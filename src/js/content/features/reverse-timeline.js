/**
 * Feature: reverse the PR timeline (newest first), keeping it reversed as
 * GitHub streams in new items. Also owns the timeline status descriptor
 * (the progress card's content) while this feature's work is in flight.
 */

import {
  commonAncestor,
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
  DESC_SECTION_ATTR,
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
 * The cheap holders of a nested stream: the region (flips group order)
 * and every item parent (flips order inside each group). Deduped, no
 * nulls — resolved without any subtree scans.
 */
function structuralHolders(stream) {
  if (!stream.nested) return [stream.parent];
  return [...new Set([stream.region, ...stream.itemParents].filter(Boolean))];
}

/**
 * Every element that must carry the visual reversal class in nested
 * mode: the structural holders plus the commit-rollup row lists (the
 * SHAs listed under "added N commits" are not timeline items — they are
 * found by their SHA-bearing elements and flipped as rows). Finding the
 * rollup lists walks each commits-log item's full subtree — keep this
 * off hot paths that can decide from the structural holders alone.
 */
function visualHolders(stream) {
  if (!stream.nested) return [stream.parent];
  const holders = structuralHolders(stream);
  for (const item of stream.items) {
    if (COMMIT_ROLLUP_ITEM_PATTERN.test(item.textContent || "")) {
      holders.push(...commitRollupRowLists(item));
    }
  }
  return [...new Set(holders)];
}

const COMMIT_ROLLUP_ITEM_PATTERN = /added\s+\d+\s+commits/i;
const SHA_TEXT_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Containers inside a commits-log item whose children are the commit
 * rows. The rollup carries no stable selector across React renders, so
 * the SHA chips are found by TEXT: every descendant element whose entire
 * text is a bare SHA. Their deepest common ancestor is the shared row
 * list (the header text is never an ancestor of a chip, so it can never
 * be dragged into the flip). Scoped to commits-log items only —
 * SHA-like code inside comment markdown lives in other items.
 */
function commitRollupRowLists(item) {
  const chips = [...item.querySelectorAll("*")].filter((el) =>
    SHA_TEXT_PATTERN.test((el.textContent || "").trim()),
  );
  if (chips.length < 2) return [];

  const lca = commonAncestor(chips, item);
  if (!lca || lca === item || !item.contains(lca)) return [];
  return [lca];
}

function holderIsReversed(holder) {
  return (
    holder.classList.contains(TIMELINE_REVERSED_CLASS) &&
    holder.getAttribute(REVERSED_ATTR) === "1"
  );
}

/**
 * True when the current stream resolution is fully reversed: legacy
 * mutation mode marks with the attribute only; nested visual mode
 * requires class + attribute on every holder (self-heals a class
 * React wiped and new groups streamed without one). The structural
 * holders are checked first — while any of them is unmarked the answer
 * is false without paying for the rollup subtree scans (this predicate
 * runs on every apply pass, needsWork and status tick).
 */
function isStreamApplied(stream) {
  if (!stream.nested) {
    return stream.parent.getAttribute(REVERSED_ATTR) === "1";
  }
  if (!structuralHolders(stream).every(holderIsReversed)) return false;
  return visualHolders(stream).every(holderIsReversed);
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
          !node.hasAttribute(DESC_SECTION_ATTR),
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
