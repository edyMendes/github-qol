/**
 * Feature: reverse the PR timeline (newest first), keeping it reversed as
 * GitHub streams in new items. Also owns the timeline status descriptor
 * (the progress card's content) while this feature's work is in flight.
 */

import {
  getDirectTimelineItems,
  restoreTimelineOrder,
  reverseTimelineContainer,
} from "../../lib/timeline.js";
import {
  findTimelineContainer,
  getTimelineItems,
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
  TIMELINE_ITEM_SELECTOR,
} from "../../lib/selectors.js";

const HYDRATION_TICK_MS = 250;
const REORDER_DEBOUNCE_MS = 400;

let timelineMutationObserver = null;
let timelineMutationTimeout = null;
let observedTimelineContainer = null;

// Feature-local phase state driving the status descriptor.
let timelinePhase = null; // null | "hydrating" | "reversing"
let hydrationStartedAt = 0;

function observeTimelineContainer(container) {
  if (!container) return;
  if (observedTimelineContainer === container && timelineMutationObserver) return;

  if (timelineMutationObserver) timelineMutationObserver.disconnect();

  observedTimelineContainer = container;
  timelineMutationObserver = new MutationObserver((mutations) => {
    if (container.getAttribute(REVERSED_ATTR) !== "1") return;

    const addedItems = mutations
      .flatMap((mutation) => [...mutation.addedNodes])
      .filter(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          node.matches(TIMELINE_ITEM_SELECTOR),
      );

    if (addedItems.length === 0) return;

    if (timelineMutationTimeout) clearTimeout(timelineMutationTimeout);
    timelineMutationTimeout = setTimeout(() => {
      timelineMutationTimeout = null;
      const firstItem = getDirectTimelineItems(container, TIMELINE_ITEM_SELECTOR)[0];
      for (const item of addedItems) {
        if (firstItem && item !== firstItem) {
          container.insertBefore(item, firstItem);
        }
      }
      schedulePostChangeRetries(container);
    }, REORDER_DEBOUNCE_MS);
  });

  timelineMutationObserver.observe(container, { childList: true });
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
  observedTimelineContainer = null;
  timelinePhase = null;
  hydrationStartedAt = 0;

  document.querySelectorAll(`[${REVERSED_ATTR}="1"]`).forEach((container) => {
    if (restoreTimelineOrder(container, TIMELINE_ITEM_SELECTOR)) {
      schedulePostChangeRetries(container);
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
  if (!container || getTimelineItems().length < 2) {
    renderStatus(settings);
    return false;
  }

  if (container.getAttribute(REVERSED_ATTR) === "1") {
    observeTimelineContainer(container);
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

    const reversed = reverseTimelineContainer(container, TIMELINE_ITEM_SELECTOR);
    if (reversed) {
      schedulePostChangeRetries(container);
      observeTimelineContainer(container);
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
  if (getTimelineItems().length >= 2) {
    return Boolean(
      container && container.getAttribute(REVERSED_ATTR) !== "1",
    );
  }
  return Boolean(container && timelineNeedsHydration(container));
}

/**
 * The status card's content while this feature has work in flight:
 * null once the timeline is reversed (or the feature is off) — the
 * card only exists for this feature's pending work.
 */
export function timelineStatus(settings) {
  if (settings.timelineOrder !== "newest" || !isPullRequestPage()) return null;

  const container = findTimelineContainer();
  const items = getTimelineItems();

  if (container?.getAttribute(REVERSED_ATTR) === "1") return null;

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

  if (items.length < 2) {
    return {
      label: "Waiting for timeline…",
      progress: items.length === 0 ? 14 : 26,
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
