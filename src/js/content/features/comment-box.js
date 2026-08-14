/**
 * Feature: comment box at the top of the timeline.
 *
 * The comment box sits directly above the timeline items when the sort is
 * newest-first (GitLab-style), i.e. right below the merge box:
 * - Descending (newest first): [description][hint][merge box][comment
 *   box][items newest→oldest][footer texts].
 * - Ascending (oldest first): box at its native END-of-timeline position,
 *   beside the newest items at the bottom.
 *
 * The guidelines/ProTip footer texts inside the box never travel with it:
 * they are extracted and pinned to the end of the timeline.
 */

import {
  findCommentWrapper,
  findElementsByText,
  isPlacedBeforeTimelineItems,
} from "../../lib/placement.js";
import {
  findCommentForm,
  findMergeBox,
  findFirstTimelineItemChild,
  findTimelineContainer,
  getTimelineItems,
  resetDomCache,
} from "../dom-cache.js";
import { COMMENT_BOX_MOVED_ATTR, TIMELINE_ITEM_SELECTOR } from "../selectors.js";

const COMMENT_WRAPPER_STOP_SELECTOR =
  "main, [data-turbo-body], [data-turbo-permanent], .js-discussion, .pull-discussion-timeline";

const COMMENT_BOX_AT_TOP_CLASS = "gqol-comment-box-at-top";
const COMMENT_FOOTER_PATTERN =
  /Remember,\s+contributions\s+to\s+this\s+repository|ProTip!/i;
// Never move anything that contains form controls — only the helper texts.
const COMMENT_FOOTER_GUARD_SELECTOR = "form, textarea, [contenteditable], button";
const COMMENT_FOOTER_MOVED_ATTR = "data-gqol-comment-footer-moved";

// Native page-end order: guidelines first, ProTip right after.
const GUIDELINES_PATTERN = /Remember,\s+contributions/i;

const MOVED_MARKERS_SELECTOR = `[${COMMENT_BOX_MOVED_ATTR}="1"], [${COMMENT_FOOTER_MOVED_ATTR}="1"]`;

const commentBoxAnchors = new WeakMap();
const commentFooterAnchors = new WeakMap();

function isCommentBoxPlaced(wrapper, container) {
  return isPlacedBeforeTimelineItems(wrapper, container, TIMELINE_ITEM_SELECTOR);
}

function restoreCommentBox(wrapper) {
  const anchor = commentBoxAnchors.get(wrapper);
  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
    anchor.remove();
  }
  commentBoxAnchors.delete(wrapper);
  wrapper.removeAttribute(COMMENT_BOX_MOVED_ATTR);
  wrapper.classList.remove(COMMENT_BOX_AT_TOP_CLASS);
}

function findCommentFooters(wrapper) {
  if (!wrapper) return [];
  // Match by TEXT across all elements (the guidelines and ProTip carry no
  // stable class between GitHub renders), dropping anything containing
  // form controls BEFORE collapsing — so the comment form can never
  // absorb or travel with the helper texts. When both texts share one
  // form-free footer container, that single container is moved and native
  // order (guidelines → ProTip) is preserved.
  return findElementsByText(wrapper, COMMENT_FOOTER_PATTERN, "*", {
    excludeContaining: COMMENT_FOOTER_GUARD_SELECTOR,
  });
}

function extractCommentFooters(wrapper, container) {
  let moved = false;
  const footers = [...findCommentFooters(wrapper)].sort(
    (a, b) =>
      Number(Boolean(GUIDELINES_PATTERN.test(b.textContent ?? ""))) -
      Number(Boolean(GUIDELINES_PATTERN.test(a.textContent ?? ""))),
  );
  for (const footer of footers) {
    if (!commentFooterAnchors.has(footer)) {
      const anchor = document.createComment("gqol-comment-footer-anchor");
      footer.parentNode?.insertBefore(anchor, footer);
      commentFooterAnchors.set(footer, anchor);
    }
    container.appendChild(footer);
    footer.setAttribute(COMMENT_FOOTER_MOVED_ATTR, "1");
    moved = true;
  }
  return moved;
}

function restoreCommentFooters() {
  document
    .querySelectorAll(`[${COMMENT_FOOTER_MOVED_ATTR}="1"]`)
    .forEach((footer) => {
      const anchor = commentFooterAnchors.get(footer);
      if (anchor?.parentNode) {
        anchor.parentNode.insertBefore(footer, anchor.nextSibling);
        anchor.remove();
      }
      commentFooterAnchors.delete(footer);
      footer.removeAttribute(COMMENT_FOOTER_MOVED_ATTR);
    });
}

function restoreAllCommentBoxes() {
  restoreCommentFooters();
  document
    .querySelectorAll(`[${COMMENT_BOX_MOVED_ATTR}="1"]`)
    .forEach((wrapper) => restoreCommentBox(wrapper));
  resetDomCache();
}

function applyCommentBoxPlacement(enabled, newestFirst) {
  if (!enabled || !newestFirst) {
    restoreAllCommentBoxes();
    return false;
  }

  const form = findCommentForm();
  const container = findTimelineContainer();
  if (!form || !container) return false;

  const wrapper = findCommentWrapper(form, {
    stopSelector: COMMENT_WRAPPER_STOP_SELECTOR,
    timelineContainer: container,
    timelineItem: getTimelineItems()[0] ?? null,
    mergeBox: findMergeBox(),
  });
  if (!wrapper) return false;

  // The guidelines/ProTip footer texts live INSIDE the comment box; when
  // the box moves to the top they must be pulled out and pinned to the end
  // of the timeline so they stay at the bottom of the page.
  extractCommentFooters(wrapper, container);

  if (isCommentBoxPlaced(wrapper, container)) {
    wrapper.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
    wrapper.classList.add(COMMENT_BOX_AT_TOP_CLASS);
    return true;
  }

  if (!commentBoxAnchors.has(wrapper)) {
    const anchor = document.createComment("gqol-comment-box-anchor");
    wrapper.parentNode?.insertBefore(anchor, wrapper);
    commentBoxAnchors.set(wrapper, anchor);
  }

  // Newest first: the box goes directly above the timeline items (the
  // merge box feature runs first and holds the same anchor, so it settles
  // between the hint and this box).
  container.insertBefore(
    wrapper,
    findFirstTimelineItemChild(container) ?? null,
  );

  wrapper.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
  wrapper.classList.add(COMMENT_BOX_AT_TOP_CLASS);
  resetDomCache();
  return true;
}

function needsWorkCommentBox(settings) {
  if (!settings.commentBoxAtTop || !settings.reverseTimeline) {
    return Boolean(document.querySelector(MOVED_MARKERS_SELECTOR));
  }
  const form = findCommentForm();
  const container = findTimelineContainer();
  if (!form || !container) return false;
  const wrapper = findCommentWrapper(form, {
    stopSelector: COMMENT_WRAPPER_STOP_SELECTOR,
    timelineContainer: container,
    timelineItem: getTimelineItems()[0] ?? null,
    mergeBox: findMergeBox(),
  });
  return Boolean(
    wrapper &&
      (!isCommentBoxPlaced(wrapper, container) ||
        findCommentFooters(wrapper).length > 0),
  );
}

export default {
  name: "comment-box-placement",
  apply: (settings) =>
    applyCommentBoxPlacement(
      settings.commentBoxAtTop,
      settings.reverseTimeline,
    ),
  needsWork: needsWorkCommentBox,
  reset: restoreAllCommentBoxes,
};
