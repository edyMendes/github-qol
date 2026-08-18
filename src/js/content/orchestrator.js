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
import {
  findCommentForm,
  findMergeBox,
  resetDomCache,
} from "./dom-cache.js";
import {
  isPullRequestPage,
  markNavigationAt,
  msSinceNavigation,
  pageKey,
} from "./page.js";
import { nudgeDescription, resetNudgeTimer } from "./hydration.js";
import { clearStatus, updateStatus } from "./status.js";
import { registerBus } from "./bus.js";
import collapseDescription from "./features/collapse-description.js";
import mergeboxBelowDescription from "./features/mergebox.js";
import commentBoxPlacement from "./features/comment-box.js";
import reverseTimeline from "./features/reverse-timeline.js";
import sortRow from "./features/sort-row.js";

// Elements the extension itself renders. Mutations whose target lives
// inside one of these must never trigger revalidation — re-applying
// writes to them again, which would feed the observer forever.
const GQOL_OWNED_SELECTOR = '#gqol-timeline-status, [class*="gqol-"]';

/** True when at least one mutation record comes from outside our own UI. */
export function hasExternalMutations(records) {
  return records.some(
    (record) =>
      !(record.target instanceof Element) ||
      !record.target.closest(GQOL_OWNED_SELECTOR),
  );
}

const INITIAL_RETRY_DELAYS = [0, 800, 2000, 5000, 10000, 20000, 45000];
const OBSERVER_SETTLE_LINGER_MS = 60000;
const REVALIDATE_DEBOUNCE_MS = 600;

// After a navigation GitHub reconciles the restored page: cached content is
// evicted and re-rendered from a fresh fetch. Applying our moves inside
// that window gets the re-rendered subtrees (the TimelineActions partial:
// merge box + comment form) unmounted by React — permanently. So right
// after a navigation, apply passes first wait for a short externally-quiet
// window; later passes (chatty pages) skip the wait entirely.
const SETTLE_PROBE_MS = 250;
const SETTLE_PROBE_GRACE_MS = 10000;

// Recovery for the corrupted state (merge box / comment form seen earlier,
// gone after the DOM settled): one reload per page key per session.
const RECOVERY_MIN_DELAY_MS = 6000;

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
let rerunAfterPass = false;
// Which key elements were seen on the current page key — the baseline that
// lets "gone" be told apart from "never rendered" (locked PRs etc.).
let seenOnPage = { mergeBox: false, commentForm: false };

/**
 * Resolve true when no external (GitHub) mutation lands within the probe
 * window. Our own UI writes are filtered out via the shared owned-selector
 * check; a disturbed probe means GitHub is mid-render and applying now
 * could corrupt its reconciliation.
 */
function domSettled() {
  return new Promise((resolve) => {
    let settled = true;
    const probe = new MutationObserver((records) => {
      if (hasExternalMutations(records)) settled = false;
    });
    probe.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => {
      probe.disconnect();
      resolve(settled);
    }, SETTLE_PROBE_MS);
  });
}

// Injectable indirection: jsdom freezes location.reload, so tests swap
// this out to observe recovery without navigating.
let reloadPage = () => location.reload();
export function setReloadForTests(fn) {
  reloadPage = fn ?? (() => location.reload());
}

function reloadOncePerKey() {
  try {
    if (sessionStorage.getItem(`gqol-reloaded:${pageKey()}`)) return false;
    sessionStorage.setItem(`gqol-reloaded:${pageKey()}`, "1");
  } catch {
    return false;
  }
  reloadPage();
  return true;
}

/**
 * The corrupted state: merge box / comment form existed earlier on this
 * page key, the DOM has settled after the navigation, and they are still
 * gone. GitHub will not re-render them on its own — reload once to get a
 * clean page (the settle probe then keeps the reload clean too).
 * Returns true when a reload was actually triggered.
 */
function maybeRecoverCorruptedPage(settings) {
  if (msSinceNavigation() < RECOVERY_MIN_DELAY_MS) return false;
  const expectMergeBox = settings.showMergeBoxBelowDescription;
  const expectForm = settings.commentBoxAtTop && settings.reverseTimeline;
  const mergeBoxGone = expectMergeBox && seenOnPage.mergeBox && !findMergeBox();
  const formGone = expectForm && seenOnPage.commentForm && !findCommentForm();
  if (!mergeBoxGone && !formGone) return false;
  return reloadOncePerKey();
}

async function runFeature(name, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`GitHub QoL: ${name} failed.`, error);
    return false;
  } finally {
    // Features mutate the DOM; the next feature must see fresh nodes. The
    // await above guarantees this also holds for async features.
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
  // comes off first for the same reason. runFeature executes sync reset
  // fns immediately, so the order holds; runFeature never rejects.
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

  if (globalMutationObserver) return;

  globalMutationObserver = new MutationObserver((records) => {
    // Our own UI writes (status card text, sort label) land here too;
    // re-applying in response would rewrite them again — an endless
    // self-sustaining loop. Only external (GitHub) mutations revalidate.
    if (!hasExternalMutations(records)) return;
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

function cancelInitialRetries() {
  for (const timeout of initialRetryTimeouts) clearTimeout(timeout);
  initialRetryTimeouts = [];
}

/**
 * Work is pending (or the DOM is still swapping): keep the global observer
 * alive without a retirement deadline and make sure a retry ladder is
 * running — mutation events alone cannot complete work on a render that
 * stalls or goes quiet.
 */
function ensureRetriesAndObserver() {
  observerSettledAt = null;
  ensureGlobalObserver();
  if (initialRetryTimeouts.length === 0) scheduleInitialPasses();
}

async function applyAll() {
  if (isApplying) {
    // A pass is in flight — typically reverse-timeline awaiting hydration,
    // which can hold for up to 12s. GitHub's fresh render can land entirely
    // inside that window; dropping these calls would lose it, so remember
    // one rerun and compensate when the current pass ends.
    rerunAfterPass = true;
    return false;
  }
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

    // Right after a navigation, wait for GitHub's restore reconciliation
    // to fall quiet before touching the DOM; applying mid-swap is what
    // unmounts the TimelineActions partial. Disturbed probes defer this
    // pass — the ladder/observer retries as soon as the DOM settles.
    if (msSinceNavigation() < SETTLE_PROBE_GRACE_MS && !(await domSettled())) {
      ensureRetriesAndObserver();
      return false;
    }

    seenOnPage.mergeBox ||= Boolean(findMergeBox());
    seenOnPage.commentForm ||= Boolean(findCommentForm());
    if (maybeRecoverCorruptedPage(settings)) return false;

    nudgeDescription();
    updateStatus(settings);

    let anyApplied = false;
    for (const feature of FEATURES) {
      const done = await runFeature(feature.name, () => feature.apply(settings));
      anyApplied ||= Boolean(done);
    }

    if (needsWork(settings)) {
      ensureRetriesAndObserver();
    } else {
      // Everything is applied and stable: stop burning the initial retry
      // schedule, but keep the global observer alive for the linger window.
      // Right after a navigation the first pass often settles against a
      // cached DOM that GitHub is about to replace with a fresh render;
      // only the observer catches that swap — the retries are gone and
      // onNavigation no-ops because the page key has not changed.
      cancelInitialRetries();
      ensureGlobalObserver();
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
    if (rerunAfterPass) {
      rerunAfterPass = false;
      scheduleRevalidate();
    }
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
    const timeout = setTimeout(() => {
      // Self-remove on fire so applyAll can tell when the ladder has
      // fully drained and restart it if work remains.
      initialRetryTimeouts = initialRetryTimeouts.filter((t) => t !== timeout);
      resetDomCache();
      applyAll().catch((error) => console.warn("GitHub QoL:", error));
    }, delay);
    initialRetryTimeouts.push(timeout);
  }
}

export function onNavigation(event) {
  // bfcache restores resurrect a frozen page (same URL, our DOM changes
  // still in place) and fire pageshow/popstate — but the page key guard
  // would skip the teardown/reapply cycle exactly when it is needed.
  // Persisted restores must always force the full cycle.
  if (!event?.persisted && pageKey() === lastUrl) return;
  lastUrl = pageKey();
  markNavigationAt();
  seenOnPage = { mergeBox: false, commentForm: false };
  resetNudgeTimer();
  resetDomCache();
  resetAllFeatures();
  stopGlobalObserver();
  scheduleInitialPasses();
}

export function init() {
  registerBus({ applyNow: applyAll, requestRevalidate: scheduleRevalidate });
  window.addEventListener("pageshow", onNavigation);
  lastUrl = pageKey();
  markNavigationAt();
  scheduleInitialPasses();
}
