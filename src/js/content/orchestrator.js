/**
 * Orchestrator: owns the feature registry, the apply/revalidate lifecycle,
 * the global mutation observer and navigation handling.
 *
 * One entry per feature: apply(settings) runs it, needsWork(settings)
 * reports whether it still has something to do, reset() tears every trace
 * of it down. applyAll / needsWork / onNavigation all iterate this list —
 * adding a feature means adding one object, not editing four call sites.
 */

import { getCachedSettings } from "./settings-cache.js";
import { resetDomCache } from "./dom-cache.js";
import { isPullRequestPage, pageKey } from "./page.js";
import { nudgeDescription, resetNudgeTimer } from "./hydration.js";
import { clearStatus, updateStatus } from "./status.js";
import { registerBus } from "./bus.js";
import collapseDescription from "./features/collapse-description.js";
import mergeboxBelowDescription from "./features/mergebox.js";
import commentBoxPlacement from "./features/comment-box.js";
import reverseTimeline from "./features/reverse-timeline.js";
import sortRow from "./features/sort-row.js";

const INITIAL_RETRY_DELAYS = [0, 800, 2000, 5000, 10000, 20000, 45000];
const OBSERVER_SETTLE_LINGER_MS = 60000;
const REVALIDATE_DEBOUNCE_MS = 600;

// Apply order matters: collapse first (reads the description in place),
// then the moves, then the reversal (reorders the container the others
// live in), and finally the sort row (anchored above the comment box once
// it has settled in its final spot).
const FEATURES = [
  collapseDescription,
  mergeboxBelowDescription,
  commentBoxPlacement,
  reverseTimeline,
  sortRow,
];

let globalMutationObserver = null;
let observerSettledAt = null;
let revalidateTimeout = null;
let initialRetryTimeouts = [];
let lastUrl = "";
let isApplying = false;

function runFeature(name, fn) {
  try {
    return fn();
  } catch (error) {
    console.warn(`GitHub QoL: ${name} failed.`, error);
    return false;
  } finally {
    // Features mutate the DOM; the next feature must see fresh nodes.
    resetDomCache();
  }
}

function needsWork(settings) {
  if (!isPullRequestPage()) return false;
  return FEATURES.some((feature) => feature.needsWork(settings));
}

function resetAllFeatures() {
  // Reverse order: the reversal is undone first because it reorders the
  // container the other features live in; the sort row is independent but
  // comes off first for the same reason.
  for (const feature of [...FEATURES].reverse()) {
    runFeature(`${feature.name} reset`, feature.reset);
  }
}

function stopGlobalObserver() {
  globalMutationObserver?.disconnect();
  globalMutationObserver = null;
  observerSettledAt = null;
}

function ensureGlobalObserver() {
  if (!isPullRequestPage()) {
    stopGlobalObserver();
    return;
  }

  getCachedSettings()
    .then((settings) => {
      if (needsWork(settings)) {
        if (!globalMutationObserver) {
          globalMutationObserver = new MutationObserver(() => {
            // Rolling linger: stay alive while the page keeps mutating.
            // applyAll's settled branch retires it after true DOM silence.
            observerSettledAt = Date.now();
            scheduleRevalidate();
          });
          globalMutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        }
      } else {
        stopGlobalObserver();
      }
    })
    .catch(() => {});
}

function cancelInitialRetries() {
  for (const timeout of initialRetryTimeouts) clearTimeout(timeout);
  initialRetryTimeouts = [];
}

async function applyAll() {
  if (isApplying) return false;
  isApplying = true;
  try {
    if (!isPullRequestPage()) {
      resetAllFeatures();
      stopGlobalObserver();
      clearStatus();
      document.documentElement.removeAttribute("data-gqol-active");
      return false;
    }

    document.documentElement.setAttribute("data-gqol-active", "1");
    resetDomCache();
    const settings = await getCachedSettings();

    nudgeDescription();
    updateStatus(settings);

    let anyApplied = false;
    for (const feature of FEATURES) {
      const done = await runFeature(feature.name, () => feature.apply(settings));
      anyApplied ||= Boolean(done);
    }

    if (needsWork(settings)) {
      observerSettledAt = null;
      ensureGlobalObserver();
    } else {
      // Everything is applied and stable: stop burning the initial retry
      // schedule, and let the global observer die after a short linger
      // window that still catches late GitHub re-renders.
      cancelInitialRetries();
      if (globalMutationObserver) {
        observerSettledAt ??= Date.now();
        if (Date.now() - observerSettledAt > OBSERVER_SETTLE_LINGER_MS) {
          stopGlobalObserver();
        }
      }
    }
    updateStatus(settings);

    return anyApplied;
  } finally {
    isApplying = false;
  }
}

function scheduleRevalidate() {
  if (revalidateTimeout) return;
  revalidateTimeout = setTimeout(() => {
    revalidateTimeout = null;
    resetDomCache();
    applyAll().catch((error) => console.warn("GitHub QoL:", error));
  }, REVALIDATE_DEBOUNCE_MS);
}

function scheduleInitialPasses() {
  cancelInitialRetries();
  for (const delay of INITIAL_RETRY_DELAYS) {
    initialRetryTimeouts.push(
      setTimeout(() => {
        resetDomCache();
        applyAll().catch((error) => console.warn("GitHub QoL:", error));
      }, delay),
    );
  }
}

export function onNavigation() {
  if (pageKey() === lastUrl) return;
  lastUrl = pageKey();
  resetNudgeTimer();
  resetDomCache();
  resetAllFeatures();
  stopGlobalObserver();
  scheduleInitialPasses();
  ensureGlobalObserver();
}

export function init() {
  registerBus({ applyNow: applyAll, requestRevalidate: scheduleRevalidate });
  lastUrl = pageKey();
  scheduleInitialPasses();
  ensureGlobalObserver();
}
