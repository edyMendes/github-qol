/**
 * Section descriptor: the merge status box. All DOM knowledge for the
 * mergebox lives here; the section-order engine decides WHERE it goes.
 * Move/restore logic ported from the former mergebox feature.
 */

import {
  findMergeBoxUnit,
  findTimelineItemFor,
} from "../../../lib/placement.js";
import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import { insertRelativeTo, isAdjacentTo } from "./shared.js";
import {
  findDescriptionContainer,
  findMergeBox,
  resetDomCache,
} from "../../dom-cache.js";
import { TIMELINE_ITEM_SELECTOR } from "../../../lib/selectors.js";

const MERGEBOX_BELOW_DESC_CLASS = "gqol-mergebox-below-desc";
const MERGEBOX_MOVED_ATTR = "data-gqol-mergebox-moved";
const MERGEBOX_TIMELINE_ROW_CLASS = "gqol-mergebox-timeline-row";
const MERGE_ANCHOR_ATTR = "data-gqol-merge-anchor";
const STRIPPED_MERGE_CLASSES_ATTR = "data-gqol-stripped-merge-classes";
const STRIPPED_CLASS_PREFIXES = ["tmp-ml-", "tmp-pl-", "tmp-mr-", "tmp-pr-"];
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
  const anchorItem =
    findTimelineItemFor(row, TIMELINE_ITEM_SELECTOR) ??
    findTimelineItemFor(descContainer, TIMELINE_ITEM_SELECTOR);
  if (descContainer?.isConnected && descContainer !== anchorItem) {
    descContainer.removeAttribute(MERGE_ANCHOR_ATTR);
  }
  if (anchorItem) anchorItem.setAttribute(MERGE_ANCHOR_ATTR, "1");
}

function restoreMergeBox(mergeBox) {
  const row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  const unit = row?.firstElementChild ?? mergeBox;

  if (restoreAtAnchor(mergeBoxAnchors, mergeBox, unit)) {
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

function cleanupMergeBox() {
  document
    .querySelectorAll(`[${MERGEBOX_MOVED_ATTR}="1"]`)
    .forEach((mergeBox) => {
      restoreMergeBox(mergeBox);
    });
  document.querySelectorAll(`[${MERGE_ANCHOR_ATTR}="1"]`).forEach((anchor) => {
    anchor.removeAttribute(MERGE_ANCHOR_ATTR);
  });
  document
    .querySelectorAll(`.${MERGEBOX_TIMELINE_ROW_CLASS}`)
    .forEach((row) => {
      unwrapMergeRow(row);
    });
  resetDomCache();
}

/** The outer movable element as it exists right now, or null. */
function resolveMergeBox(container) {
  const mergeBox = findMergeBox();
  if (!mergeBox) return null;
  const existingRow = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (existingRow?.parentElement === container) return existingRow;
  return (
    findMergeBoxUnit(mergeBox, container, TIMELINE_ITEM_SELECTOR) ?? mergeBox
  );
}

function isMergeBoxPlacedAt(el, container, mode, ref) {
  const mergeBox = findMergeBox();
  return (
    mergeBox?.getAttribute(MERGEBOX_MOVED_ATTR) === "1" &&
    isAdjacentTo(el, container, mode, ref)
  );
}

function placeMergeBox(el, container, mode, ref) {
  const mergeBox = findMergeBox();

  let row = el.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (!row) {
    row = document.createElement("div");
    row.className = MERGEBOX_TIMELINE_ROW_CLASS;
    el.parentNode?.insertBefore(row, el);
    row.appendChild(el);
  }

  // Anchor keyed by the partial, placed next to the row that travels.
  anchorBefore(mergeBoxAnchors, mergeBox, row, "gqol-mergebox-anchor");
  insertRelativeTo(row, container, mode, ref);

  mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
  applyMergeBoxStyles(mergeBox, row.firstElementChild ?? mergeBox);
  if (mode === "before") {
    markMergeAnchor(findDescriptionContainer(), row);
  }
  return row;
}

export default {
  id: "mergebox",
  resolve: resolveMergeBox,
  isPlaced: isMergeBoxPlacedAt,
  place: placeMergeBox,
  cleanup: cleanupMergeBox,
  recovery: {
    expectedWhen: () => true,
    landmark: () => findMergeBox(),
  },
};
