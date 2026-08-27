/**
 * Feature: collapse long timeline comments (user comments and Copilot
 * review messages alike — both render markdown bodies) behind the same
 * Show more / Show less toggle as the PR description.
 *
 * Comments live in React-owned subtrees: re-renders (reactions, edits,
 * streaming) replace our wrappers; the orchestrator's revalidation
 * re-applies them. A processed-short body is never re-measured — an
 * in-place edit that keeps our marker attribute on the same element is
 * not a scenario GitHub's renderer produces (re-renders swap elements).
 */

import { isMarkdownLoaded, isTallBody } from "../description.js";
import { findDescriptionContainer, findTimelineContainer, resetDomCache } from "../dom-cache.js";
import { DESC_SECTION_ATTR, MARKDOWN_BODY_SELECTOR } from "../../lib/selectors.js";
import {
  COLLAPSE_BLOCK_CLASS,
  COLLAPSE_FOOTER_CLASS,
  COLLAPSE_WRAP_CLASS,
  createCollapseBlock,
  unwrapCollapseBlock,
} from "../collapse-block.js";

const COMMENT_BLOCK_CLASS = "gqol-comment-block";
const COMMENT_WRAP_CLASS = "gqol-comment-wrap";
const COMMENT_COLLAPSED_CLASS = "gqol-comment-collapsed";
const COMMENT_FOOTER_CLASS = "gqol-comment-footer";
const COMMENT_TOGGLE_CLASS = "gqol-comment-toggle";

const COMMENT_PROCESSED_ATTR = "data-gqol-comment-processed";
const COMMENT_EXPANDED_ATTR = "data-gqol-comment-expanded";

/** Rendered comment bodies under timeline items, description excluded. */
function findCommentBodies(container) {
  const bodies = container.querySelectorAll(
    `.js-timeline-item ${MARKDOWN_BODY_SELECTOR}, .TimelineItem ${MARKDOWN_BODY_SELECTOR}`,
  );
  const descContainer = findDescriptionContainer();
  return [...bodies].filter((body) => {
    // Never touch the PR description (its own feature owns it).
    if (descContainer?.contains(body)) return false;
    if (body.closest(`[${DESC_SECTION_ATTR}]`)) return false;
    // GitHub's own collapsed/minimized comments need no second collapse.
    if (body.closest(".minimized-comment")) return false;
    return true;
  });
}

function applyCollapseComments(enabled) {
  if (!enabled) {
    undoCollapseComments();
    return false;
  }

  const container = findTimelineContainer();
  if (!container) return false;

  let didWork = false;
  for (const body of findCommentBodies(container)) {
    if (body.closest(`.${COMMENT_BLOCK_CLASS}`)) continue;
    if (body.getAttribute(COMMENT_PROCESSED_ATTR) === "1") continue;
    if (!isMarkdownLoaded(body)) continue;

    if (!isTallBody(body)) {
      body.setAttribute(COMMENT_PROCESSED_ATTR, "1");
      continue;
    }

    const block = createCollapseBlock(body, {
      expandedAttr: COMMENT_EXPANDED_ATTR,
      toggleClass: COMMENT_TOGGLE_CLASS,
      blockHookClass: COMMENT_BLOCK_CLASS,
      wrapHookClass: COMMENT_WRAP_CLASS,
      collapsedHookClass: COMMENT_COLLAPSED_CLASS,
    });
    block
      .querySelector(`.${COLLAPSE_FOOTER_CLASS}`)
      ?.classList.add(COMMENT_FOOTER_CLASS);
    body.setAttribute(COMMENT_PROCESSED_ATTR, "1");
    didWork = true;
  }

  if (didWork) resetDomCache();
  return didWork;
}

function needsWorkCollapseComments(settings) {
  if (!settings.collapseLongComments) {
    return Boolean(document.querySelector(`.${COMMENT_BLOCK_CLASS}`));
  }
  const container = findTimelineContainer();
  if (!container) return false;
  for (const body of findCommentBodies(container)) {
    if (body.closest(`.${COMMENT_BLOCK_CLASS}`)) continue;
    if (body.getAttribute(COMMENT_PROCESSED_ATTR) === "1") continue;
    if (!isMarkdownLoaded(body)) continue;
    // The only reflow in the whole scan — after every cheap check.
    if (isTallBody(body)) return true;
  }
  return false;
}

function undoCollapseComments() {
  document.querySelectorAll(`.${COMMENT_BLOCK_CLASS}`).forEach((block) => {
    const body = unwrapCollapseBlock(block, {
      expandedAttr: COMMENT_EXPANDED_ATTR,
      bodySelector: MARKDOWN_BODY_SELECTOR,
    });
    body?.classList.remove(COMMENT_COLLAPSED_CLASS);
    body?.removeAttribute(COMMENT_PROCESSED_ATTR);
  });

  document.querySelectorAll(`.${COLLAPSE_FOOTER_CLASS}`).forEach((footer) => {
    if (!footer.closest(`.${COLLAPSE_BLOCK_CLASS}`)) footer.remove();
  });

  document.querySelectorAll(`.${COMMENT_WRAP_CLASS}`).forEach((wrap) => {
    if (wrap.closest(`.${COLLAPSE_BLOCK_CLASS}`)) return;
    const body = unwrapCollapseBlock(wrap, {
      expandedAttr: COMMENT_EXPANDED_ATTR,
      bodySelector: MARKDOWN_BODY_SELECTOR,
      fallbackToFirstChild: true,
    });
    body?.classList.remove(COMMENT_COLLAPSED_CLASS);
    body?.removeAttribute(COMMENT_PROCESSED_ATTR);
  });
  resetDomCache();
}

export default {
  name: "collapse-comments",
  apply: (settings) => applyCollapseComments(settings.collapseLongComments),
  needsWork: needsWorkCollapseComments,
  reset: undoCollapseComments,
};
