/**
 * GitLab-style sort direction toggle for the PR timeline.
 *
 * The toggle lives INLINE in the timeline container — a right-aligned row
 * inserted right before the first timeline item (i.e. between the comment
 * box and the PR-body item), never a floating overlay. GitHub's sticky
 * header / floating outline toggle own the top-right corner, so anything
 * fixed-positioned there either collides visually or loses clicks.
 *
 * Pure factories and state helpers: they only touch the document through
 * the elements they are given, so they unit-test without any
 * content-script module state (the feature owns DOM lookups).
 */

import { chevronDownIcon, chevronUpIcon, filterLeftIcon } from "./icons.js";

export const SORT_BUTTON_ID = "gqol-sort-button";
export const SORT_ROW_CLASS = "gqol-sort-row";

const SORT_BUTTON_CLASS = "gqol-sort-button";

export function createSortButton({ onClick } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = SORT_BUTTON_ID;
  button.className = SORT_BUTTON_CLASS;

  const label = document.createElement("span");
  label.className = "gqol-sort-button__label";
  button.appendChild(label);

  setSortDirection(button, true);

  button.addEventListener("click", () => {
    const newestFirst = button.getAttribute("aria-pressed") === "true";
    setSortDirection(button, !newestFirst);
    onClick?.(!newestFirst);
  });

  return button;
}

/**
 * Sync the button's visual state: newestFirst=true shows a descending
 * chevron (newest at top), false shows ascending.
 */
export function setSortDirection(button, newestFirst) {
  if (!button) return;
  button.setAttribute("aria-pressed", newestFirst ? "true" : "false");
  button.setAttribute(
    "title",
    newestFirst ? "Sort: newest first" : "Sort: oldest first",
  );
  button.setAttribute(
    "aria-label",
    newestFirst ? "Sort timeline newest first" : "Sort timeline oldest first",
  );

  const label = button.querySelector(".gqol-sort-button__label");
  if (label) {
    // The filter icon keeps a stable class so CSS can flip it upside down
    // when the button shows the ascending (up chevron) direction.
    label.innerHTML =
      (newestFirst
        ? chevronDownIcon("gqol-sort-button__icon")
        : chevronUpIcon("gqol-sort-button__icon")) +
      filterLeftIcon("gqol-sort-button__filter");
  }
}

export function createSortRow(button) {
  const row = document.createElement("div");
  row.className = SORT_ROW_CLASS;
  row.appendChild(button ?? createSortButton());
  return row;
}

/**
 * True when the row already sits where placeSortRow would put it (directly
 * above `anchor`, or at the top of `container` when no anchor exists).
 */
export function isSortRowPlaced(row, container, anchor) {
  if (!row || !container) return false;
  const target = anchor ?? container.firstChild;
  if (target === row) return true;
  return row.parentElement === (anchor?.parentElement ?? container) &&
    row.nextSibling === target;
}

/**
 * Keep the sort row directly above `anchor` (e.g. the comment box
 * wrapper), wherever that element lives. Falls back to the top of the
 * timeline container when no anchor exists. Returns true when the row was
 * (re)positioned.
 */
export function placeSortRow(row, container, anchor) {
  if (!row || !container) return false;
  if (isSortRowPlaced(row, container, anchor)) return false;
  (anchor?.parentElement ?? container).insertBefore(
    row,
    anchor ?? container.firstChild,
  );
  return true;
}
