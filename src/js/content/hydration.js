/**
 * Lazy content hydration: force GitHub's deferred timeline content to
 * load, and poll-friendly predicates describing what is still loading.
 */

import { getDescriptionElement, getTimelineItems } from "./dom-cache.js";
import { isMarkdownLoaded } from "./description.js";
import { requestRevalidate } from "./bus.js";
import { COMMENT_BOX_MOVED_ATTR } from "./selectors.js";

const POST_CHANGE_RETRY_DELAYS = [0, 200, 800, 2000];
const SKELETON_SELECTOR =
  "batch-deferred-content .Skeleton, .commit-build-statuses .Skeleton, .js-updatable-content .Skeleton";

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

function forceLazyHydration(root) {
  const descEl = getDescriptionElement();
  const descBody = descEl?.querySelector(".markdown-body, .js-comment-body");
  const preserveDescription =
    descEl && descBody && isMarkdownLoaded(descBody) && descEl.contains(descBody);

  // The relocated comment box lives INSIDE the timeline container once it
  // moves to the top. Its deferred/React-managed content must never be
  // cloned — a clone drops React state and leaves an empty box.
  const movedCommentBox = document.querySelector(
    `[${COMMENT_BOX_MOVED_ATTR}="1"]`,
  );
  const isInsideMovedCommentBox = (el) =>
    Boolean(movedCommentBox?.contains(el));

  root.querySelectorAll("batch-deferred-content").forEach((el) => {
    if (isInsideMovedCommentBox(el)) return;
    if (preserveDescription && descEl.contains(el)) return;
    if (el.querySelector(".markdown-body, .js-comment-body")) return;
    el.replaceWith(el.cloneNode(true));
  });

  // Lazy fragments only: eager ones are handled by the caller when needed.
  refetchIncludeFragments(root, LAZY_FRAGMENT_SELECTOR, isInsideMovedCommentBox);
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

function allSkeletonsInsideDescription(container) {
  const descEl = getDescriptionElement();
  if (!descEl || !container.contains(descEl)) return false;
  const skeletons = container.querySelectorAll(SKELETON_SELECTOR);
  return skeletons.length !== 0 && [...skeletons].every((el) => descEl.contains(el));
}

export function timelineHasLoadingContent(container) {
  return (
    container.querySelectorAll(SKELETON_SELECTOR).length > 0 &&
    !(
      getTimelineItems().length >= 2 &&
      allSkeletonsInsideDescription(container)
    )
  );
}

export function timelineNeedsHydration(container) {
  if (!container) return false;
  if (timelineHasLoadingContent(container)) return true;

  const deferred = container.querySelectorAll(
    "batch-deferred-content, include-fragment[loading]",
  );
  if (deferred.length === 0) return false;

  // Deferred content inside the description block is expected; anywhere
  // else in the timeline means items still need to be fetched.
  const descEl = getDescriptionElement();
  const descriptionReady = Boolean(descEl && getTimelineItems().length >= 2);
  return (
    !descriptionReady || ![...deferred].every((el) => descEl.contains(el))
  );
}

export function resetNudgeTimer() {
  lastDescriptionNudgeAt = 0;
}

export function nudgeDescription() {
  const descEl = getDescriptionElement();
  if (!descEl || descEl.querySelector(".markdown-body, .js-comment-body")) return;

  const now = Date.now();
  if (now - lastDescriptionNudgeAt < 3000) return;
  lastDescriptionNudgeAt = now;

  forceLazyHydration(descEl);
  // forceLazyHydration already restarted the lazy fragments; only
  // re-fetch the eager ones here so no fragment is cloned twice.
  refetchIncludeFragments(descEl, EAGER_FRAGMENT_SELECTOR);
  window.dispatchEvent(new Event("scroll"));
}
