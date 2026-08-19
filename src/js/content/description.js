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
import {
  MARKDOWN_BODY_SELECTOR,
  SKELETON_CLASS,
} from "../lib/selectors.js";

export function isMarkdownLoaded(body) {
  return (
    Boolean(body?.isConnected) &&
    !body.querySelector(SKELETON_CLASS) &&
    (Boolean(
      body.querySelector("img, pre, table, ul, ol, blockquote, h1, h2, h3, p"),
    ) ||
      body.textContent.trim().length > 0)
  );
}

export function isDescriptionLoading(descEl) {
  if (!descEl?.isConnected) return false;
  const body = descEl.querySelector(MARKDOWN_BODY_SELECTOR);
  if (!body) {
    return Boolean(
      descEl.querySelector(
        `${SKELETON_CLASS}, batch-deferred-content ${SKELETON_CLASS}, include-fragment[loading]`,
      ),
    );
  }
  if (isMarkdownLoaded(body)) return false;
  return Boolean(body.querySelector(SKELETON_CLASS));
}

export function isDescriptionBodyLoading(body) {
  if (!body?.isConnected) return true;
  if (isMarkdownLoaded(body)) return false;
  if (body.querySelector(SKELETON_CLASS)) return true;

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
  try {
    return el.scrollHeight;
  } finally {
    // A throw mid-measure must never leak the lifted styles onto the page.
    el.style.maxHeight = maxHeight;
    el.style.overflow = overflow;
    el.style.height = height;
  }
}

export function isTallBody(body) {
  return measureFullHeight(body) > 144;
}
