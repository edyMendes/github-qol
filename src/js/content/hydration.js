/**
 * Lazy content hydration: force GitHub's deferred timeline content to
 * load, and poll-friendly predicates describing what is still loading.
 */

import { getDescriptionElement, getTimelineItems } from "./dom-cache.js";
import { isMarkdownLoaded } from "./description.js";
import { requestRevalidate } from "./bus.js";
import {
  MARKDOWN_BODY_SELECTOR,
  SKELETON_SELECTOR,
} from "../lib/selectors.js";

const POST_CHANGE_RETRY_DELAYS = [0, 200, 800, 2000];

/** How long the reversal waits for the timeline to finish loading before
 * proceeding anyway; the status progress bar uses it as its denominator. */
export const TIMELINE_HYDRATION_TIMEOUT_MS = 12000;

let postChangeRetryTimeouts = [];
let lastDescriptionNudgeAt = 0;

const LAZY_FRAGMENT_SELECTOR = "include-fragment[loading='lazy'][src]";
const EAGER_FRAGMENT_SELECTOR =
  "include-fragment[src]:not([loading='lazy'])";

/**
 * Re-create include-fragment elements so GitHub refetches them (a fresh
 * clone restarts the lazy load). Each fragment must be cloned at most
 * once per call: a second synchronous clone cancels the fetch the first
 * one started.
 */
function refetchIncludeFragments(root, selector, shouldSkip = () => false) {
  root.querySelectorAll(selector).forEach((el) => {
    if (shouldSkip(el)) return;
    const src = el.getAttribute("src");
    if (!src) return;
    const clone = el.cloneNode(false);
    clone.setAttribute("src", src);
    el.replaceWith(clone);
  });
}

/**
 * Elements whose deferred/React-managed content must never be re-cloned
 * (a clone drops React state and leaves an empty shell). Features that
 * relocate such elements register a region provider here instead of
 * hydration knowing about any specific feature's marker.
 */
const protectedRegionProviders = new Set();

export function registerProtectedRegion(provider) {
  protectedRegionProviders.add(provider);
}

function isInsideProtectedRegion(el) {
  for (const provide of protectedRegionProviders) {
    const region = provide();
    if (region && region.contains(el)) return true;
  }
  return false;
}

function forceLazyHydration(root) {
  const descEl = getDescriptionElement();
  const descBody = descEl?.querySelector(MARKDOWN_BODY_SELECTOR);
  const preserveDescription = Boolean(
    descEl && descBody && isMarkdownLoaded(descBody),
  );

  root.querySelectorAll("batch-deferred-content").forEach((el) => {
    if (isInsideProtectedRegion(el)) return;
    if (preserveDescription && descEl.contains(el)) return;
    if (el.querySelector(MARKDOWN_BODY_SELECTOR)) return;
    el.replaceWith(el.cloneNode(true));
  });

  // Lazy fragments only: eager ones are handled by the caller when needed.
  refetchIncludeFragments(root, LAZY_FRAGMENT_SELECTOR, isInsideProtectedRegion);
}

export function schedulePostChangeRetries(container) {
  for (const timeout of postChangeRetryTimeouts) clearTimeout(timeout);
  postChangeRetryTimeouts = [];

  for (const delay of POST_CHANGE_RETRY_DELAYS) {
    postChangeRetryTimeouts.push(
      setTimeout(() => {
        forceLazyHydration(container);
        window.dispatchEvent(new Event("scroll"));
        requestRevalidate();
      }, delay),
    );
  }
}

export function cancelPostChangeRetries() {
  for (const timeout of postChangeRetryTimeouts) clearTimeout(timeout);
  postChangeRetryTimeouts = [];
}

function allSkeletonsInsideDescription(container, skeletons) {
  const descEl = getDescriptionElement();
  if (!descEl || !container.contains(descEl)) return false;
  return (
    skeletons.length !== 0 && [...skeletons].every((el) => descEl.contains(el))
  );
}

/**
 * True while the timeline still shows loading placeholders. `skeletons`
 * may be precomputed (the status hot path queries them once and shares
 * the result with every predicate below).
 */
export function timelineHasLoadingContent(container, skeletons = null) {
  const found = skeletons ?? container.querySelectorAll(SKELETON_SELECTOR);
  return (
    found.length > 0 &&
    !(
      getTimelineItems().length >= 2 &&
      allSkeletonsInsideDescription(container, found)
    )
  );
}

/** Same contract as timelineHasLoadingContent, with a precomputed verdict. */
export function timelineNeedsHydration(container, hasLoadingContent = null) {
  if (!container) return false;
  if (hasLoadingContent ?? timelineHasLoadingContent(container)) return true;

  const deferred = container.querySelectorAll(
    "batch-deferred-content, include-fragment[loading]",
  );
  if (deferred.length === 0) return false;

  // Deferred content inside the description block is expected; anywhere
  // else in the timeline means items still need to be fetched.
  const descEl = getDescriptionElement();
  const descriptionReady = Boolean(descEl && getTimelineItems().length >= 2);
  if (!descriptionReady) return true;
  return ![...deferred].every((el) => descEl.contains(el));
}

export function resetNudgeTimer() {
  lastDescriptionNudgeAt = 0;
}

export function nudgeDescription() {
  const descEl = getDescriptionElement();
  if (!descEl || descEl.querySelector(MARKDOWN_BODY_SELECTOR)) return;

  const now = Date.now();
  if (now - lastDescriptionNudgeAt < 3000) return;
  lastDescriptionNudgeAt = now;

  forceLazyHydration(descEl);
  // forceLazyHydration already restarted the lazy fragments; only
  // re-fetch the eager ones here so no fragment is cloned twice.
  refetchIncludeFragments(descEl, EAGER_FRAGMENT_SELECTOR);
  window.dispatchEvent(new Event("scroll"));
}
