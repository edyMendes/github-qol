/**
 * Feature: GitLab-style sort direction toggle row above the timeline.
 */

import { saveSettings } from "../../settings.js";
import {
  createSortButton,
  createSortRow,
  getSortButton,
  placeSortRow,
  setSortDirection,
  SORT_ROW_CLASS,
} from "../../lib/sort-button.js";
import {
  findFirstTimelineItemChild,
  findTimelineContainer,
  resetDomCache,
} from "../dom-cache.js";
import { invalidateCachedSettings } from "../settings-cache.js";
import { requestApplyNow } from "../bus.js";
import { COMMENT_BOX_MOVED_ATTR } from "../selectors.js";

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

/**
 * Stable anchor for the sort row: the earliest of (moved comment box,
 * first timeline item) among the container's direct children. The
 * descending comment box inserts itself directly before the first item —
 * i.e. directly after the row — so flipping the sort direction moves the
 * box around the row without ever moving the row itself.
 */
function findSortRowAnchor(container) {
  const firstItem = findFirstTimelineItemChild(container);
  const kids = [...container.children];
  const box = kids.find((child) => child.hasAttribute(COMMENT_BOX_MOVED_ATTR));

  if (!box) return firstItem ?? null;

  const boxIdx = kids.indexOf(box);
  const itemIdx = firstItem ? kids.indexOf(firstItem) : -1;
  return itemIdx === -1 || boxIdx < itemIdx ? box : firstItem ?? null;
}

export function ensureSortRow(settings) {
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

  placeSortRow(row, container, findSortRowAnchor(container));
  setSortDirection(button, settings.reverseTimeline);
  return true;
}

export function removeSortRow() {
  document.querySelectorAll(`.${SORT_ROW_CLASS}`).forEach((row) => row.remove());
}
