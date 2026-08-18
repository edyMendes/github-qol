/**
 * Feature: reverse the PR timeline (newest first), keeping it reversed as
 * GitHub streams in new items.
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
import {
  cancelPostChangeRetries,
  schedulePostChangeRetries,
  timelineHasLoadingContent,
  timelineNeedsHydration,
} from "../hydration.js";
import {
  clearStatus,
  setHydrationStartedAt,
  setTimelinePhase,
  updateStatus,
} from "../status.js";
import { TIMELINE_HYDRATION_TIMEOUT_MS } from "../hydration.js";
import { REVERSED_ATTR, TIMELINE_ITEM_SELECTOR } from "../selectors.js";

const HYDRATION_TICK_MS = 250;
const REORDER_DEBOUNCE_MS = 400;

let timelineMutationObserver = null;
let timelineMutationTimeout = null;
let observedTimelineContainer = null;

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
          node.matches?.(TIMELINE_ITEM_SELECTOR),
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
    setHydrationStartedAt(startedAt);

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
  setTimelinePhase(null);
  setHydrationStartedAt(0);

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
    clearStatus();
    return false;
  }

  const container = findTimelineContainer();
  if (!container || getTimelineItems().length < 2) {
    updateStatus(settings);
    return false;
  }

  if (container.getAttribute(REVERSED_ATTR) === "1") {
    observeTimelineContainer(container);
    updateStatus(settings);
    return true;
  }

  setTimelinePhase("hydrating");
  updateStatus(settings);

  try {
    await hydrateTimeline(container, () => {
      updateStatus(settings);
    });

    setTimelinePhase("reversing");
    updateStatus(settings);

    const reversed = reverseTimelineContainer(container, TIMELINE_ITEM_SELECTOR);
    if (reversed) {
      schedulePostChangeRetries(container);
      observeTimelineContainer(container);
    }
    resetDomCache();

    return reversed;
  } finally {
    setTimelinePhase(null);
    setHydrationStartedAt(0);
    updateStatus(settings);
  }
}

function needsWorkReverseTimeline(settings) {
  if (!settings.reverseTimeline) return false;
  const container = findTimelineContainer();
  if (getTimelineItems().length >= 2) {
    return Boolean(
      container && container.getAttribute(REVERSED_ATTR) !== "1",
    );
  }
  return Boolean(container && timelineNeedsHydration(container));
}

export default {
  name: "reverse-timeline",
  apply: (settings) => applyReverseTimeline(settings.reverseTimeline, settings),
  needsWork: needsWorkReverseTimeline,
  reset: undoReverseTimeline,
};
