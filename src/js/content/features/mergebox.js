/**
 * Feature: move the merge status box below the PR description, styled to
 * look native in its new spot (timeline rail connects at the merge badge).
 */

import {
  findMergeBoxUnit,
  findTimelineItemFor,
} from "../../lib/placement.js";
import {
  findDescriptionContainer,
  findFirstTimelineItemChild,
  findMergeBox,
  findTimelineContainer,
  resetDomCache,
} from "../dom-cache.js";
import { COMMENT_BOX_MOVED_ATTR, TIMELINE_ITEM_SELECTOR } from "../selectors.js";

const MERGEBOX_BELOW_DESC_CLASS = "gqol-mergebox-below-desc";
const MERGEBOX_MOVED_ATTR = "data-gqol-mergebox-moved";
const MERGEBOX_TIMELINE_ROW_CLASS = "gqol-mergebox-timeline-row";
const MERGE_ANCHOR_ATTR = "data-gqol-merge-anchor";
const STRIPPED_MERGE_CLASSES_ATTR = "data-gqol-stripped-merge-classes";
const STRIPPED_CLASS_PREFIXES = ["tmp-ml-", "tmp-pl-", "tmp-mr-", "tmp-pr-"];
// Decorative classes on the React "Stack" wrapper: the box look below the
// description comes from the merge partial itself, so the wrapper must be
// transparent. The `Stack` layout hook stays.
const STRIPPED_UNIT_CLASSES = [
  "border",
  "bgColor-muted",
  "rounded-2",
  "mt-2",
  "tmp-py-2",
  "tmp-px-3",
];

const mergeBoxAnchors = new WeakMap();

function unwrapMergeRow(row) {
  // The row wraps exactly one unit (the merge box's top-level wrapper or
  // the bare partial); put that unit back and drop the row.
  const unit = row.firstElementChild;
  if (unit) {
    row.replaceWith(unit);
  } else {
    row.remove();
  }
}

function stripMergeClasses(el, exactClasses = []) {
  const stripped = new Set(
    (el.getAttribute(STRIPPED_MERGE_CLASSES_ATTR) ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  // Snapshot: removing from a live DOMTokenList during iteration skips entries.
  for (const cls of [...el.classList]) {
    const matches =
      STRIPPED_CLASS_PREFIXES.some((prefix) => cls.startsWith(prefix)) ||
      exactClasses.includes(cls);
    if (matches) {
      stripped.add(cls);
      el.classList.remove(cls);
    }
  }
  if (stripped.size > 0) {
    el.setAttribute(STRIPPED_MERGE_CLASSES_ATTR, [...stripped].join(" "));
  }
}

/**
 * Style the merge partial for its spot below the description. In the
 * React "Stack" case the wrapper's decorative classes are stripped so
 * only the partial's own box shows (no double border/padding).
 */
function applyMergeBoxStyles(mergeBox, unit) {
  mergeBox.classList.add(MERGEBOX_BELOW_DESC_CLASS);
  stripMergeClasses(mergeBox);
  if (unit !== mergeBox) {
    stripMergeClasses(unit, STRIPPED_UNIT_CLASSES);
  }
}

function restoreStrippedClasses(mergeBox) {
  const attr = mergeBox.getAttribute(STRIPPED_MERGE_CLASSES_ATTR);
  if (!attr) return;
  attr
    .split(/\s+/)
    .filter(Boolean)
    .forEach((cls) => mergeBox.classList.add(cls));
  mergeBox.removeAttribute(STRIPPED_MERGE_CLASSES_ATTR);
}

function markMergeAnchor(descContainer, row) {
  const anchorItem = findTimelineItemFor(row, TIMELINE_ITEM_SELECTOR) ??
    findTimelineItemFor(descContainer, TIMELINE_ITEM_SELECTOR);

  if (descContainer?.isConnected && descContainer !== anchorItem) {
    descContainer.removeAttribute(MERGE_ANCHOR_ATTR);
  }
  if (anchorItem) anchorItem.setAttribute(MERGE_ANCHOR_ATTR, "1");
}

/**
 * Placed = the merge row is the nearest non-item element directly before
 * the container's first timeline item (i.e. right below the description
 * block and the @copilot hint, right above the newest items).
 */
function isMergeBoxPlaced(mergeBox) {
  const row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`) ?? mergeBox;
  const container = findTimelineContainer();
  if (!container || row.parentElement !== container) return false;

  const firstItem = findFirstTimelineItemChild(container);
  if (!firstItem) return row === container.lastElementChild;

  let sibling = firstItem.previousElementSibling;
  while (sibling && sibling !== row) {
    if (sibling.matches(TIMELINE_ITEM_SELECTOR)) return false;
    sibling = sibling.previousElementSibling;
  }
  return sibling === row;
}

function restoreMergeBox(mergeBox) {
  const row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  const unit = row?.firstElementChild ?? mergeBox;
  const anchor = mergeBoxAnchors.get(mergeBox);

  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(unit, anchor.nextSibling);
    anchor.remove();
    row?.remove();
  } else if (row) {
    unwrapMergeRow(row);
  }

  mergeBoxAnchors.delete(mergeBox);
  mergeBox.removeAttribute(MERGEBOX_MOVED_ATTR);
  restoreStrippedClasses(unit);
  restoreStrippedClasses(mergeBox);
  mergeBox.classList.remove(MERGEBOX_BELOW_DESC_CLASS);
}

function restoreAllMergeBoxes() {
  document.querySelectorAll(`[${MERGEBOX_MOVED_ATTR}="1"]`).forEach((mergeBox) => {
    restoreMergeBox(mergeBox);
  });
  document.querySelectorAll(`[${MERGE_ANCHOR_ATTR}="1"]`).forEach((anchor) => {
    anchor.removeAttribute(MERGE_ANCHOR_ATTR);
  });
  document.querySelectorAll(`.${MERGEBOX_TIMELINE_ROW_CLASS}`).forEach((row) => {
    unwrapMergeRow(row);
  });
  resetDomCache();
}

function applyMergeBoxBelowDescription(enabled) {
  if (!enabled) {
    restoreAllMergeBoxes();
    return false;
  }

  const mergeBox = findMergeBox();
  const descContainer = findDescriptionContainer();
  if (!mergeBox || !descContainer) return false;

  // Move the merge box's TOP-LEVEL wrapper (e.g. the React "Stack" box),
  // not the bare partial — the box keeps its native classes and therefore
  // its native look, just below the description.
  const container = findTimelineContainer() ?? document.body;
  const unit = findMergeBoxUnit(mergeBox, container, TIMELINE_ITEM_SELECTOR) ?? mergeBox;

  let row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (!row) {
    row = document.createElement("div");
    row.className = MERGEBOX_TIMELINE_ROW_CLASS;
    unit.parentNode?.insertBefore(row, unit);
    row.appendChild(unit);
  }

  if (isMergeBoxPlaced(mergeBox)) {
    mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
    applyMergeBoxStyles(mergeBox, unit);
    markMergeAnchor(descContainer, row);
    return true;
  }

  if (!mergeBoxAnchors.has(mergeBox)) {
    const anchor = document.createComment("gqol-mergebox-anchor");
    row.parentNode?.insertBefore(anchor, row);
    mergeBoxAnchors.set(mergeBox, anchor);
  }

  // Insert before the container's first timeline item — or before the
  // already-placed comment box when it exists, so re-runs always settle
  // as [hint][merge box][comment box][items]. Footer texts stay at the end.
  const commentWrapper = [...container.children].find((child) =>
    child.hasAttribute?.(COMMENT_BOX_MOVED_ATTR),
  );
  container.insertBefore(
    row,
    commentWrapper ?? findFirstTimelineItemChild(container) ?? null,
  );

  mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
  applyMergeBoxStyles(mergeBox, unit);
  markMergeAnchor(descContainer, row);
  resetDomCache();
  return true;
}

function needsWorkMergeBox(settings) {
  if (!settings.showMergeBoxBelowDescription) return false;
  const mergeBox = findMergeBox();
  return Boolean(mergeBox && !isMergeBoxPlaced(mergeBox));
}

export default {
  name: "mergebox-below-description",
  apply: (settings) =>
    applyMergeBoxBelowDescription(settings.showMergeBoxBelowDescription),
  needsWork: needsWorkMergeBox,
  reset: restoreAllMergeBoxes,
};
