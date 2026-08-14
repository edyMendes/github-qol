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

function stripMergeSpacingClasses(mergeBox) {
  const stripped = new Set(
    (mergeBox.getAttribute(STRIPPED_MERGE_CLASSES_ATTR) ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  for (const cls of mergeBox.classList) {
    if (STRIPPED_CLASS_PREFIXES.some((prefix) => cls.startsWith(prefix))) {
      stripped.add(cls);
      mergeBox.classList.remove(cls);
    }
  }
  if (stripped.size > 0) {
    mergeBox.setAttribute(STRIPPED_MERGE_CLASSES_ATTR, [...stripped].join(" "));
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

function positionMergeBoxStyles(descContainer, row, mergeBox) {
  const anchorItem = findTimelineItemFor(row, TIMELINE_ITEM_SELECTOR) ??
    findTimelineItemFor(descContainer, TIMELINE_ITEM_SELECTOR);

  if (descContainer?.isConnected && descContainer !== anchorItem) {
    descContainer.removeAttribute(MERGE_ANCHOR_ATTR);
    descContainer.style.removeProperty("--gqol-merge-timeline-gap");
  }
  if (anchorItem) anchorItem.setAttribute(MERGE_ANCHOR_ATTR, "1");

  requestAnimationFrame(() => {
    if (!row.isConnected || !mergeBox.isConnected) return;

    const mergeabilityIcon =
      mergeBox.querySelector("[data-testid='mergeability-icon-wrapper']") ??
      mergeBox.querySelector("[class*='mergeabilityIcon']");
    const rowRect = row.getBoundingClientRect();
    const avatar =
      anchorItem?.querySelector(".TimelineItem-avatar") ??
      row.closest(".pull-discussion-timeline")?.querySelector(".TimelineItem-avatar");

    if (avatar) {
      const avatarRect = avatar.getBoundingClientRect();
      const railX = avatarRect.left + avatarRect.width / 2 - rowRect.left - 1;
      row.style.setProperty(
        "--gqol-timeline-rail-x",
        `${Math.max(0, Math.round(railX))}px`,
      );
    } else {
      row.style.removeProperty("--gqol-timeline-rail-x");
    }

    if (mergeabilityIcon) {
      const iconRect = mergeabilityIcon.getBoundingClientRect();
      const centerY = iconRect.top + iconRect.height / 2 - rowRect.top;
      row.style.setProperty(
        "--gqol-merge-badge-center-y",
        `${Math.max(0, Math.round(centerY))}px`,
      );
    } else {
      row.style.removeProperty("--gqol-merge-badge-center-y");
    }

    const statusBottom = mergeBox.getBoundingClientRect().bottom - rowRect.top;
    row.style.setProperty(
      "--gqol-merge-status-bottom-y",
      `${Math.max(0, Math.round(statusBottom))}px`,
    );

    if (anchorItem?.isConnected) {
      const anchorBottom = anchorItem.getBoundingClientRect().bottom - rowRect.top;
      anchorItem.style.setProperty(
        "--gqol-merge-timeline-gap",
        `${Math.max(0, Math.round(anchorBottom))}px`,
      );
    }
  });
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
  restoreStrippedClasses(mergeBox);
  mergeBox.classList.remove(MERGEBOX_BELOW_DESC_CLASS);
  row?.style.removeProperty("--gqol-merge-badge-center-y");
  row?.style.removeProperty("--gqol-merge-status-bottom-y");
}

function restoreAllMergeBoxes() {
  document.querySelectorAll(`[${MERGEBOX_MOVED_ATTR}="1"]`).forEach((mergeBox) => {
    restoreMergeBox(mergeBox);
  });
  document.querySelectorAll(`[${MERGE_ANCHOR_ATTR}="1"]`).forEach((anchor) => {
    anchor.removeAttribute(MERGE_ANCHOR_ATTR);
    anchor.style.removeProperty("--gqol-merge-timeline-gap");
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
  const isBarePartial = unit === mergeBox;

  const styleUnit = () => {
    if (isBarePartial) {
      mergeBox.classList.add(MERGEBOX_BELOW_DESC_CLASS);
      stripMergeSpacingClasses(mergeBox);
    }
  };

  let row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (!row) {
    row = document.createElement("div");
    row.className = MERGEBOX_TIMELINE_ROW_CLASS;
    unit.parentNode?.insertBefore(row, unit);
    row.appendChild(unit);
  }

  if (isMergeBoxPlaced(mergeBox)) {
    mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
    styleUnit();
    positionMergeBoxStyles(descContainer, row, mergeBox);
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
  styleUnit();
  positionMergeBoxStyles(descContainer, row, mergeBox);
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
