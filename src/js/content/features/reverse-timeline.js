/**
 * Feature: reverse the PR timeline (newest first), keeping it reversed as
 * GitHub streams in new items. Also owns the timeline status descriptor
 * (the progress card's content) while this feature's work is in flight.
 */

import {
  getDirectTimelineItems,
  resolveTimelineStreamRegion,
  restoreTimelineOrder,
  reverseTimelineContainer,
  setVisualReversal,
  TIMELINE_ITEM_SELECTORS,
} from "../../lib/timeline.js";
import {
  findTimelineContainer,
  resetDomCache,
} from "../dom-cache.js";
import { isPullRequestPage } from "../page.js";
import {
  cancelPostChangeRetries,
  schedulePostChangeRetries,
  timelineHasLoadingContent,
  timelineNeedsHydration,
  TIMELINE_HYDRATION_TIMEOUT_MS,
} from "../hydration.js";
import { renderStatus } from "../status.js";
import {
  REVERSED_ATTR,
  SKELETON_SELECTOR,
  TIMELINE_GIDS_ATTR,
  TIMELINE_REVERSED_CLASS,
} from "../../lib/selectors.js";

const HYDRATION_TICK_MS = 250;
const REORDER_DEBOUNCE_MS = 400;

let timelineMutationObserver = null;
let timelineMutationTimeout = null;
let observedStreamParent = null;
let observedStreamSelector = null;

// Feature-local phase state driving the status descriptor.
let timelinePhase = null; // null | "hydrating" | "reversing"
let hydrationStartedAt = 0;

/** The item selector matching ≥2 of parent's children, else the legacy one. */
function streamSelectorFor(parent) {
  return (
    TIMELINE_ITEM_SELECTORS.find(
      (selector) => getDirectTimelineItems(parent, selector).length >= 2,
    ) ?? TIMELINE_ITEM_SELECTORS[0]
  );
}

/**
 * Elements that must carry the visual reversal class in nested mode:
 * the region (flips group order), every item parent (flips order
 * inside each group), and the commit-rollup row lists (the SHAs listed
 * under "added N commits" are not timeline items — they are found by
 * their SHA-bearing elements and flipped as rows). Deduped, no nulls.
 */
function visualHolders(stream) {
  if (!stream.nested) return [stream.parent];
  const holders = [stream.region, ...stream.itemParents].filter(Boolean);
  for (const item of stream.items) {
    if (COMMIT_ROLLUP_ITEM_PATTERN.test(item.textContent || "")) {
      holders.push(...commitRollupRowLists(item));
    }
  }
  return [...new Set(holders)];
}

const COMMIT_ROLLUP_ITEM_PATTERN = /added\s+\d+\s+commits/i;
const SHA_TEXT_PATTERN = /^[0-9a-f]{7,40}$/i;

/** The outermost ancestor of `el` still inside `boundary` (or null). */
function outermostWithin(el, boundary) {
  let node = el;
  while (node.parentElement && node.parentElement !== boundary) {
    node = node.parentElement;
  }
  return node.parentElement === boundary ? node : null;
}

/**
 * Containers inside a commits-log item whose children are the commit
 * rows: every SHA-bearing element climbs to its outermost wrapper
 * within the item — that is the shared row list — and lists carrying
 * at least two rows get flipped. Class-agnostic by design (the rollup
 * carries no stable selector across React renders).
 */
function commitRollupRowLists(item) {
  const shaEls = [
    ...item.querySelectorAll('code, [class*="sha" i], [data-testid*="sha" i]'),
  ].filter((el) => SHA_TEXT_PATTERN.test((el.textContent || "").trim()));

  const counts = new Map();
  for (const el of shaEls) {
    const list = outermostWithin(el, item);
    if (list && list !== item) {
      counts.set(list, (counts.get(list) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([list]) => list);
}

/**
 * True when the current stream resolution is fully reversed: legacy
 * mutation mode marks with the attribute only; nested visual mode
 * requires class + attribute on every holder (self-heals a class
 * React wiped and new groups streamed without one).
 */
function isStreamApplied(stream) {
  if (!stream.nested) {
    return stream.parent.getAttribute(REVERSED_ATTR) === "1";
  }
  return visualHolders(stream).every(
    (holder) =>
      holder.classList.contains(TIMELINE_REVERSED_CLASS) &&
      holder.getAttribute(REVERSED_ATTR) === "1",
  );
}

function observeTimelineContainer(streamParent, selector) {
  if (!streamParent) return;
  if (
    observedStreamParent === streamParent &&
    timelineMutationObserver &&
    observedStreamSelector === selector
  ) {
    return;
  }

  if (timelineMutationObserver) timelineMutationObserver.disconnect();

  observedStreamParent = streamParent;
  observedStreamSelector = selector;
  timelineMutationObserver = new MutationObserver((mutations) => {
    if (streamParent.getAttribute(REVERSED_ATTR) !== "1") return;

    const addedItems = mutations
      .flatMap((mutation) => [...mutation.addedNodes])
      .filter(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          node.matches(selector) &&
          !node.hasAttribute("data-gqol-desc-section"),
      );

    if (addedItems.length === 0) return;

    if (timelineMutationTimeout) clearTimeout(timelineMutationTimeout);
    timelineMutationTimeout = setTimeout(() => {
      timelineMutationTimeout = null;
      const firstItem = getDirectTimelineItems(streamParent, selector)[0];
      for (const item of addedItems) {
        if (firstItem && item !== firstItem) {
          streamParent.insertBefore(item, firstItem);
        }
      }
      schedulePostChangeRetries(streamParent);
    }, REORDER_DEBOUNCE_MS);
  });

  timelineMutationObserver.observe(streamParent, { childList: true });
}

function hydrateTimeline(container, onProgress) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    hydrationStartedAt = startedAt;

    const tick = () => {
      resetDomCache();
      onProgress?.();
      if (container.isConnected && timelineHasLoadingContent(container)) {
        if (Date.now() - startedAt >= TIMELINE_HYDRATION_TIMEOUT_MS) {
          resolve();
        } else {
          setTimeout(tick, HYDRATION_TICK_MS);
        }
      } else {
        resolve();
      }
    };

    tick();
  });
}

function undoReverseTimeline() {
  if (timelineMutationObserver) {
    timelineMutationObserver.disconnect();
    timelineMutationObserver = null;
  }
  if (timelineMutationTimeout) {
    clearTimeout(timelineMutationTimeout);
    timelineMutationTimeout = null;
  }

  cancelPostChangeRetries();
  observedStreamParent = null;
  observedStreamSelector = null;
  timelinePhase = null;
  hydrationStartedAt = 0;

  // Visual mode first: unstyle every reversed wrapper (no DOM restore —
  // the document order was never touched). Then the legacy mutation
  // mode: containers with saved gids get their exact order back.
  document.querySelectorAll(`[${REVERSED_ATTR}="1"]`).forEach((parent) => {
    parent.classList.remove(TIMELINE_REVERSED_CLASS);
    parent.removeAttribute(REVERSED_ATTR);
  });
  document.querySelectorAll(`[${TIMELINE_GIDS_ATTR}]`).forEach((parent) => {
    if (restoreTimelineOrder(parent, streamSelectorFor(parent))) {
      schedulePostChangeRetries(parent);
    }
  });
  resetDomCache();
}

async function applyReverseTimeline(enabled, settings) {
  if (!enabled) {
    undoReverseTimeline();
    return false;
  }

  const container = findTimelineContainer();
  const stream = container ? resolveTimelineStreamRegion(container) : null;
  if (!container || !stream) {
    renderStatus(settings);
    return false;
  }

  if (isStreamApplied(stream)) {
    if (!stream.nested) {
      observeTimelineContainer(stream.parent, stream.selector);
    }
    renderStatus(settings);
    return true;
  }

  timelinePhase = "hydrating";
  renderStatus(settings);

  try {
    await hydrateTimeline(container, () => {
      renderStatus(settings);
    });

    timelinePhase = "reversing";
    renderStatus(settings);

    const streamNow = resolveTimelineStreamRegion(container) ?? stream;

    if (streamNow.nested) {
      // React-owned stream: visual reversal only. Node moves here get
      // reverted by React reconciliation (observed on live pages).
      // Region flips group order (comments vs reviews vs commit log);
      // each item parent flips order inside its group. New groups
      // streamed later surface via needsWork → re-apply.
      let changed = false;
      for (const holder of visualHolders(streamNow)) {
        changed = setVisualReversal(holder, true) || changed;
      }
      resetDomCache();
      return changed;
    }

    const reversed = reverseTimelineContainer(
      streamNow.parent,
      streamNow.selector,
    );
    if (reversed) {
      schedulePostChangeRetries(streamNow.parent);
      observeTimelineContainer(streamNow.parent, streamNow.selector);
    }
    resetDomCache();

    return reversed;
  } finally {
    timelinePhase = null;
    hydrationStartedAt = 0;
    renderStatus(settings);
  }
}

function needsWorkReverseTimeline(settings) {
  if (settings.timelineOrder !== "newest") return false;
  const container = findTimelineContainer();
  if (!container) return false;
  const stream = resolveTimelineStreamRegion(container);
  if (stream) {
    return !isStreamApplied(stream);
  }
  return Boolean(timelineNeedsHydration(container));
}

/**
 * The status card's content while this feature has work in flight:
 * null once the timeline is reversed (or the feature is off) — the
 * card only exists for this feature's pending work.
 */
export function timelineStatus(settings) {
  if (settings.timelineOrder !== "newest" || !isPullRequestPage()) return null;

  const container = findTimelineContainer();
  const stream = container ? resolveTimelineStreamRegion(container) : null;

  if (stream && isStreamApplied(stream)) return null;

  if (timelinePhase === "reversing") {
    return {
      label: "Sorting timeline newest first…",
      progress: 92,
      indeterminate: false,
    };
  }

  // One skeleton scan shared by every predicate below (the status path
  // runs on every apply pass and hydration tick).
  const loading = container
    ? timelineHasLoadingContent(
        container,
        container.querySelectorAll(SKELETON_SELECTOR),
      )
    : false;

  if (timelinePhase === "hydrating" || loading) {
    const elapsed = hydrationStartedAt ? Date.now() - hydrationStartedAt : 0;
    const ratio = Math.min(1, elapsed / TIMELINE_HYDRATION_TIMEOUT_MS);
    return {
      label: "Loading timeline activity…",
      progress: 34 + 48 * ratio,
      indeterminate: ratio < 0.08,
    };
  }

  if (!stream) {
    return {
      label: "Waiting for timeline…",
      progress: 14,
      indeterminate: true,
    };
  }

  if (container && timelineNeedsHydration(container, loading)) {
    return {
      label: "Loading deferred timeline items…",
      progress: 38,
      indeterminate: true,
    };
  }

  return { label: "Preparing timeline…", progress: 84, indeterminate: false };
}

export default {
  name: "reverse-timeline",
  apply: (settings) =>
    applyReverseTimeline(settings.timelineOrder === "newest", settings),
  needsWork: needsWorkReverseTimeline,
  reset: undoReverseTimeline,
  status: timelineStatus,
};
