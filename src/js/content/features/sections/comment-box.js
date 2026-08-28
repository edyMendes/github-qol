/**
 * Section descriptor: the comment box. "before" mode is the moved-to-top
 * placement (footers extracted to the timeline end); "after" mode is the
 * native-style end-of-timeline placement (footers stay inside the box).
 */

import {
  findCommentWrapper,
  findElementsByText,
} from "../../../lib/placement.js";
import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import { insertRelativeTo, isAdjacentTo } from "./shared.js";
import {
  findCommentForm,
  findMergeBox,
  getTimelineItems,
  resetDomCache,
} from "../../dom-cache.js";
import { registerProtectedRegion } from "../../hydration.js";
import {
  COMMENT_BOX_MOVED_ATTR,
  TIMELINE_FLOW_STOP_SELECTOR,
} from "../../../lib/selectors.js";

const COMMENT_BOX_AT_TOP_CLASS = "gqol-comment-box-at-top";
const COMMENT_FOOTER_PATTERN =
  /Remember,\s+contributions\s+to\s+this\s+repository|ProTip!/i;
const COMMENT_FOOTER_GUARD_SELECTOR =
  "form, textarea, [contenteditable], button";
const COMMENT_FOOTER_MOVED_ATTR = "data-gqol-comment-footer-moved";
const GUIDELINES_PATTERN = /Remember,\s+contributions/i;

const commentBoxAnchors = new WeakMap();
const commentFooterAnchors = new WeakMap();

registerProtectedRegion(() =>
  document.querySelector(`[${COMMENT_BOX_MOVED_ATTR}="1"]`),
);

function findCommentFooters(wrapper) {
  if (!wrapper) return [];
  return findElementsByText(wrapper, COMMENT_FOOTER_PATTERN, "*", {
    excludeContaining: COMMENT_FOOTER_GUARD_SELECTOR,
  });
}

function extractCommentFooters(wrapper, container) {
  const footers = [...findCommentFooters(wrapper)].sort(
    (a, b) =>
      Number(GUIDELINES_PATTERN.test(b.textContent)) -
      Number(GUIDELINES_PATTERN.test(a.textContent)),
  );
  for (const footer of footers) {
    anchorBefore(
      commentFooterAnchors, footer, footer, "gqol-comment-footer-anchor",
    );
    container.appendChild(footer);
    footer.setAttribute(COMMENT_FOOTER_MOVED_ATTR, "1");
  }
}

function restoreCommentFooters() {
  document
    .querySelectorAll(`[${COMMENT_FOOTER_MOVED_ATTR}="1"]`)
    .forEach((footer) => {
      restoreAtAnchor(commentFooterAnchors, footer, footer);
      footer.removeAttribute(COMMENT_FOOTER_MOVED_ATTR);
    });
}

function resolveCommentBox(container) {
  const form = findCommentForm();
  if (!form?.isConnected) return null;
  return findCommentWrapper(form, {
    stopSelector: TIMELINE_FLOW_STOP_SELECTOR,
    timelineContainer: container,
    timelineItem: getTimelineItems()[0] ?? null,
    mergeBox: findMergeBox(),
  });
}

function isCommentBoxPlacedAt(el, container, mode, ref) {
  if (!isAdjacentTo(el, container, mode, ref)) return false;
  if (mode === "before") {
    return (
      el.getAttribute(COMMENT_BOX_MOVED_ATTR) === "1" &&
      findCommentFooters(el).length === 0
    );
  }
  return (
    el.getAttribute(COMMENT_BOX_MOVED_ATTR) === null &&
    document.querySelector(`[${COMMENT_FOOTER_MOVED_ATTR}="1"]`) === null
  );
}

function placeCommentBox(el, container, mode, ref) {
  if (mode === "before") {
    extractCommentFooters(el, container);
  } else {
    restoreCommentFooters();
    el.removeAttribute(COMMENT_BOX_MOVED_ATTR);
    el.classList.remove(COMMENT_BOX_AT_TOP_CLASS);
  }

  anchorBefore(commentBoxAnchors, el, el, "gqol-comment-box-anchor");
  insertRelativeTo(el, container, mode, ref);

  if (mode === "before") {
    el.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
    el.classList.add(COMMENT_BOX_AT_TOP_CLASS);
  }
  return el;
}

function cleanupCommentBox() {
  restoreCommentFooters();
  document
    .querySelectorAll(`[${COMMENT_BOX_MOVED_ATTR}="1"]`)
    .forEach((wrapper) => {
      restoreAtAnchor(commentBoxAnchors, wrapper, wrapper);
      wrapper.removeAttribute(COMMENT_BOX_MOVED_ATTR);
      wrapper.classList.remove(COMMENT_BOX_AT_TOP_CLASS);
    });
  resetDomCache();
}

export default {
  id: "commentBox",
  resolve: resolveCommentBox,
  isPlaced: isCommentBoxPlacedAt,
  place: placeCommentBox,
  cleanup: cleanupCommentBox,
  recovery: {
    expectedWhen: (settings) =>
      settings.sectionOrder.indexOf("commentBox") <
      settings.sectionOrder.indexOf("timeline"),
    landmark: () => findCommentForm(),
  },
};
