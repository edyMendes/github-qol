/**
 * Lazy content hydration: force GitHub's deferred timeline content to
 * load, and poll-friendly predicates describing what is still loading.
 */

import { getDescriptionElement, getTimelineItems } from "./dom-cache.js";
import { isMarkdownLoaded } from "./description.js";
import { requestRevalidate } from "./bus.js";

const POST_CHANGE_RETRY_DELAYS = [0, 200, 800, 2000];
const SKELETON_SELECTOR =
  "batch-deferred-content .Skeleton, .commit-build-statuses .Skeleton, .js-updatable-content .Skeleton";

let postChangeRetryTimeouts = [];
let lastDescriptionNudgeAt = 0;

/**
 * Re-create include-fragment elements so GitHub refetches them (a fresh
 * clone restarts the lazy load).
 */
function refetchIncludeFragments(root, selector = "include-fragment[src]") {
  root.querySelectorAll(selector).forEach((el) => {
    const src = el.getAttribute("src");
    if (!src) return;
    const clone = el.cloneNode(false);
    clone.setAttribute("src", src);
    el.replaceWith(clone);
  });
}

export function forceLazyHydration(root) {
  const descEl = getDescriptionElement();
  const descBody = descEl?.querySelector(".markdown-body, .js-comment-body");
  const preserveDescription =
    descEl && descBody && isMarkdownLoaded(descBody) && descEl.contains(descBody);

  root.querySelectorAll("batch-deferred-content").forEach((el) => {
    if (preserveDescription && descEl.contains(el)) return;
    if (el.querySelector(".markdown-body, .js-comment-body")) return;
    el.replaceWith(el.cloneNode(true));
  });

  refetchIncludeFragments(root, "include-fragment[loading='lazy']");
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

  const descEl = getDescriptionElement();
  return !(descEl && getTimelineItems().length >= 2) ||
    ![...deferred].every((el) => descEl.contains(el));
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
  refetchIncludeFragments(descEl);
  window.dispatchEvent(new Event("scroll"));
}
