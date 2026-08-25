/**
 * Feature: GitLab-style sort direction toggle row above the timeline.
 */

import { saveSettings } from "../../settings.js";
import {
  createSortButton,
  createSortRow,
  isSortRowPlaced,
  placeSortRow,
  setSortDirection,
  SORT_BUTTON_ID,
  SORT_ROW_CLASS,
} from "../../lib/sort-button.js";
import { findMovedCommentBox } from "../../lib/placement.js";
import {
  findFirstTimelineItemChild,
  findTimelineContainer,
  resetDomCache,
} from "../dom-cache.js";
import { invalidateCachedSettings } from "../settings-cache.js";
import { requestApplyNow } from "../bus.js";

function handleSortClick(newestFirst) {
  // Flip the global setting, then reapply immediately (the storage.onChanged
  // listener also fires, but its pass is debounced; this one is instant).
  saveSettings({ reverseTimeline: newestFirst })
    .then(() => {
      invalidateCachedSettings();
      resetDomCache();
      return requestApplyNow();
    })
    .catch((error) => console.warn("GitHub QoL: could not save sort order.", error));
}

/** The extension's sort button once attached to the document, else null. */
function getSortButton() {
  return document.getElementById(SORT_BUTTON_ID);
}

/**
 * Stable anchor for the sort row: the earliest of (moved comment box,
 * first timeline item) among the container's direct children. The
 * descending comment box inserts itself directly before the first item —
 * i.e. directly after the row — so flipping the sort direction moves the
 * box around the row without ever moving the row itself.
 */
function findSortRowAnchor(container) {
  const firstItem = findFirstTimelineItemChild(container);
  const box = findMovedCommentBox(container);
  if (!box) return firstItem ?? null;

  const kids = [...container.children];
  const boxIdx = kids.indexOf(box);
  const itemIdx = firstItem ? kids.indexOf(firstItem) : -1;
  return itemIdx === -1 || boxIdx < itemIdx ? box : firstItem ?? null;
}

function ensureSortRow(settings) {
  const container = findTimelineContainer();
  if (!container) return false;

  let button = getSortButton();
  if (!button) {
    button = createSortButton({ onClick: handleSortClick });
  }

  let row = button.closest(`.${SORT_ROW_CLASS}`);
  if (!row) {
    row = createSortRow(button);
  }

  const placed = placeSortRow(row, container, findSortRowAnchor(container));
  const newestFirst = settings.timelineOrder === "newest";
  const directionChanged =
    button.getAttribute("aria-pressed") !== String(newestFirst);
  setSortDirection(button, newestFirst);
  return placed || directionChanged;
}

function needsWorkSortRow(settings) {
  const container = findTimelineContainer();
  if (!container) return false;
  const button = getSortButton();
  if (!button) return true;
  if (button.getAttribute("aria-pressed") !== String(settings.timelineOrder === "newest")) {
    return true;
  }
  const row = button.closest(`.${SORT_ROW_CLASS}`);
  if (!row) return true;
  return !isSortRowPlaced(row, container, findSortRowAnchor(container));
}

function removeSortRow() {
  document.querySelectorAll(`.${SORT_ROW_CLASS}`).forEach((row) => row.remove());
}

export default {
  name: "sort-row",
  apply: ensureSortRow,
  needsWork: needsWorkSortRow,
  reset: removeSortRow,
};
