/**
 * Placement helpers for moving elements around the PR timeline.
 * All functions take explicit elements/selectors: they touch the document
 * only through their arguments (plus document.body as a climb boundary),
 * so they unit-test without any content-script module state.
 */

import {
  COMMENT_BOX_MOVED_ATTR,
  TIMELINE_FLOW_STOP_SELECTOR,
} from "./selectors.js";

/** Climb from `el` through ancestors until `shouldStop` approves a parent. */
function climbFrom(el, shouldStop) {
  let node = el;
  while (node.parentElement) {
    const parent = node.parentElement;
    if (shouldStop(parent, node)) break;
    node = parent;
  }
  return node;
}

/**
 * The direct child of `container` marked as the moved comment box, or null.
 */
export function findMovedCommentBox(container) {
  return (
    container?.querySelector(`:scope > [${COMMENT_BOX_MOVED_ATTR}="1"]`) ??
    null
  );
}

/**
 * Climb from an element to its top-level timeline item wrapper.
 */
export function findTimelineItemFor(el, selector) {
  if (!el?.isConnected) return null;
  return (
    el.closest(".TimelineItem.js-comment-container") ??
    el.closest(selector) ??
    el.closest(".TimelineItem")
  );
}

/**
 * Climb from the comment form to its top-level wrapper — the node that sits
 * as a sibling of the timeline container. Stops before climbing into any
 * parent that also contains the timeline container/items or the merge box
 * (unless the merge box is inside the current node).
 *
 * Uses contains() on known landmarks instead of per-level querySelector walks.
 */
export function findCommentWrapper(form, options = {}) {
  const {
    stopSelector = "",
    timelineContainer = null,
    timelineItem = null,
    mergeBox = null,
  } = options;

  if (!form?.isConnected) return null;

  return climbFrom(
    form,
    (parent, node) =>
      parent === document.body ||
      (stopSelector && parent.matches(stopSelector)) ||
      (timelineContainer && parent.contains(timelineContainer)) ||
      (timelineItem && parent.contains(timelineItem)) ||
      (mergeBox && parent.contains(mergeBox) && !node.contains(mergeBox)),
  );
}

/**
 * True when `wrapper` lives inside `container` with no timeline items
 * rendered before it.
 */
export function isPlacedBeforeTimelineItems(wrapper, container, selector) {
  if (!wrapper?.isConnected || wrapper.parentElement !== container) {
    return false;
  }
  let sibling = wrapper.previousElementSibling;
  while (sibling) {
    if (sibling.matches(selector)) return false;
    sibling = sibling.previousElementSibling;
  }
  return true;
}

/**
 * Climb from the mergebox partial to its top-level wrapper in the timeline
 * flow — the node whose parent is the flow container or has timeline items
 * as siblings. Moving this unit (instead of the bare partial) preserves
 * GitHub's native wrapper classes (e.g. the React "Stack" merge box) so the
 * box looks exactly like it does natively, just below the description.
 */
export function findMergeBoxUnit(mergeBox, container, itemSelector) {
  if (!mergeBox?.isConnected || !container) return null;

  return climbFrom(mergeBox, (parent, node) => {
    if (parent === container || parent === document.body) return true;
    if (parent.matches(TIMELINE_FLOW_STOP_SELECTOR)) return true;
    return [...parent.children].some(
      (child) => child !== node && child.matches(itemSelector),
    );
  });
}

/**
 * All descendants of `root` matching `selector` whose text matches
 * `pattern`, collapsed to the outermost matching elements (nested matches
 * are absorbed by their ancestor). Used to locate GitHub callouts that
 * carry no stable selector, e.g. the guidelines/ProTip footer texts.
 *
 * `excludeContaining` drops candidates that contain elements matching
 * that selector BEFORE collapsing, so a form (or a form-wrapping
 * ancestor) never absorbs matches nested inside it.
 *
 * Perf: this runs on every revalidation pass, so instead of regex-testing
 * textContent (which rebuilds the full subtree text) on EVERY descendant,
 * it walks text nodes only — the cheap test — and re-checks just their
 * ancestor chains, which is where a match can surface. Ancestors of a
 * matching text node contain that node, so their textContent necessarily
 * matches too (requires a non-global pattern, which all callers pass —
 * global patterns carry lastIndex state and would break the walk anyway).
 * Matches whose occurrence spans two text nodes without any single node
 * matching are not expected for callout text and are not found.
 */
export function findElementsByText(root, pattern, selector = "*", options = {}) {
  if (!root?.querySelectorAll) return [];
  const { excludeContaining = "" } = options;

  const candidates = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!pattern.test(node.data)) continue;
    for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
      candidates.add(el);
    }
  }

  const matches = [...candidates].filter(
    (el) =>
      el.matches(selector) &&
      !(excludeContaining && el.querySelector(excludeContaining)),
  );

  // Collapse to the outermost matches: an element is kept unless one of
  // its ancestors also matched.
  const matchSet = new Set(matches);
  return matches.filter((el) => {
    for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
      if (matchSet.has(parent)) return false;
    }
    return true;
  });
}
