/**
 * Pure placement helpers for moving elements around the PR timeline.
 * All functions take explicit elements/selectors so they can be
 * unit-tested without the content script's globals.
 */

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

  let node = form;
  while (node.parentElement) {
    const parent = node.parentElement;
    if (parent === document.body) break;
    if (stopSelector && parent.matches(stopSelector)) break;
    if (timelineContainer && parent.contains(timelineContainer)) break;
    if (timelineItem && parent.contains(timelineItem)) break;
    if (mergeBox && parent.contains(mergeBox) && !node.contains(mergeBox)) break;
    node = parent;
  }
  return node;
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
 * True when `row` is the last child of `parent` (used to confirm the merge
 * box sits directly below the description container).
 */
export function isLastChildOf(row, parent) {
  return Boolean(
    parent && row && row.parentElement === parent &&
      parent.lastElementChild === row,
  );
}
