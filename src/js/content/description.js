/**
 * PR description predicates: is the markdown rendered, is it still
 * loading, how tall is it. Shared by the collapse-description feature and
 * the hydration module.
 */

import {
  getDescriptionElement,
  PR_DESCRIPTION_ID_SELECTOR,
  PR_DESCRIPTION_TESTID_SELECTOR,
} from "./dom-cache.js";

export function isMarkdownLoaded(body) {
  return (
    Boolean(body?.isConnected) &&
    !body.querySelector(".Skeleton") &&
    (Boolean(
      body.querySelector("img, pre, table, ul, ol, blockquote, h1, h2, h3, p"),
    ) ||
      body.textContent.trim().length > 0)
  );
}

export function isDescriptionLoading(descEl) {
  if (!descEl?.isConnected) return false;
  const body = descEl.querySelector(".markdown-body, .js-comment-body");
  if (!body) {
    return Boolean(
      descEl.querySelector(
        ".Skeleton, batch-deferred-content .Skeleton, include-fragment[loading]",
      ),
    );
  }
  if (isMarkdownLoaded(body)) return false;
  return Boolean(body.querySelector(".Skeleton"));
}

export function isDescriptionBodyLoading(body) {
  if (!body?.isConnected) return true;
  if (isMarkdownLoaded(body)) return false;
  if (body.querySelector(".Skeleton")) return true;

  const descRoot =
    body.closest(
      `${PR_DESCRIPTION_TESTID_SELECTOR}, ${PR_DESCRIPTION_ID_SELECTOR}`,
    ) ?? getDescriptionElement();
  return Boolean(descRoot && isDescriptionLoading(descRoot));
}

function measureFullHeight(el) {
  if (!el?.isConnected) return 0;
  const { maxHeight, overflow, height } = el.style;
  // Fast path (the common case): no inline constraints to lift, so one
  // scrollHeight read is enough — scrollHeight reports the full content
  // height even when a stylesheet clips it.
  if (maxHeight === "" && overflow === "" && height === "") {
    return el.scrollHeight;
  }
  el.style.maxHeight = "none";
  el.style.overflow = "visible";
  el.style.height = "auto";
  const fullHeight = el.scrollHeight;
  el.style.maxHeight = maxHeight;
  el.style.overflow = overflow;
  el.style.height = height;
  return fullHeight;
}

export function isTallBody(body) {
  return measureFullHeight(body) > 144;
}
