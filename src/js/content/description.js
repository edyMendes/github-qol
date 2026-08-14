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
  if (!body || !isMarkdownLoaded(body)) {
    if (body) {
      return Boolean(body.querySelector(".Skeleton"));
    }
    return Boolean(
      descEl.querySelector(
        ".Skeleton, batch-deferred-content .Skeleton, include-fragment[loading]",
      ),
    );
  }
  return false;
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
  const saved = {
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
    height: el.style.height,
  };
  el.style.maxHeight = "none";
  el.style.overflow = "visible";
  el.style.height = "auto";
  const fullHeight = el.scrollHeight;
  el.style.maxHeight = saved.maxHeight;
  el.style.overflow = saved.overflow;
  el.style.height = saved.height;
  return fullHeight;
}

export function isTallBody(body) {
  return measureFullHeight(body) > 144;
}
