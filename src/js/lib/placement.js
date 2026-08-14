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
 * Climb from the mergebox partial to its top-level wrapper in the timeline
 * flow — the node whose parent is the flow container or has timeline items
 * as siblings. Moving this unit (instead of the bare partial) preserves
 * GitHub's native wrapper classes (e.g. the React "Stack" merge box) so the
 * box looks exactly like it does natively, just below the description.
 */
export function findMergeBoxUnit(mergeBox, container, itemSelector) {
  if (!mergeBox?.isConnected || !container) return null;

  let node = mergeBox;
  while (node.parentElement) {
    const parent = node.parentElement;
    if (parent === container || parent === document.body) break;
    if (
      parent.matches?.(
        "main, [data-turbo-body], [data-turbo-permanent], .js-discussion, .pull-discussion-timeline",
      )
    ) {
      break;
    }
    const hasSiblingItem = [...parent.children].some(
      (child) => child !== node && child.matches?.(itemSelector),
    );
    if (hasSiblingItem) break;
    node = parent;
  }
  return node;
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
 */
export function findElementsByText(root, pattern, selector, options = {}) {
  if (!root?.querySelectorAll) return [];
  const { excludeContaining = "" } = options;

  let matches = [...root.querySelectorAll(selector)].filter((el) =>
    pattern.test(el.textContent ?? ""),
  );
  if (excludeContaining) {
    matches = matches.filter((el) => !el.querySelector(excludeContaining));
  }

  // Collapse to the outermost matches: an element is kept unless one of
  // its ancestors also matched (equivalent to, but cheaper than, testing
  // every other match with contains()).
  const matchSet = new Set(matches);
  return matches.filter((el) => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (matchSet.has(parent)) return false;
    }
    return true;
  });
}
