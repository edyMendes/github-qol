/**
 * GitLab-style sort direction toggle for the PR timeline.
 *
 * The toggle lives INLINE in the timeline container — a right-aligned row
 * inserted right before the first timeline item (i.e. between the comment
 * box and the PR-body item), never a floating overlay. GitHub's sticky
 * header / floating outline toggle own the top-right corner, so anything
 * fixed-positioned there either collides visually or loses clicks.
 *
 * Pure factories: no dependency on content-script globals so they can be
 * unit-tested directly.
 */

const CHEVRON_DOWN_SVG =
  '<svg class="gqol-sort-button__icon" aria-hidden="true" height="16" width="16" viewBox="0 0 16 16"><path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/></svg>';

const CHEVRON_UP_SVG =
  '<svg class="gqol-sort-button__icon" aria-hidden="true" height="16" width="16" viewBox="0 0 16 16"><path d="M3.22 10.53a.749.749 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.06 0l4.25 4.25a.749.749 0 1 1-1.06 1.06L8 6.811 4.28 10.53a.749.749 0 0 1-1.06 0Z"/></svg>';

export const SORT_BUTTON_ID = "gqol-sort-button";
export const SORT_BUTTON_CLASS = "gqol-sort-button";
export const SORT_ROW_CLASS = "gqol-sort-row";

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
    label.innerHTML = newestFirst ? CHEVRON_DOWN_SVG : CHEVRON_UP_SVG;
  }
}

export function getSortButton() {
  return document.getElementById(SORT_BUTTON_ID);
}

export function getSortRow() {
  return document.querySelector(`.${SORT_ROW_CLASS}`);
}

export function createSortRow(button) {
  const row = document.createElement("div");
  row.className = SORT_ROW_CLASS;
  row.appendChild(button ?? createSortButton());
  return row;
}

/**
 * Keep the sort row directly above `anchor` (e.g. the comment box
 * wrapper), wherever that element lives. Falls back to the top of the
 * timeline container when no anchor exists. Returns true when the row was
 * (re)positioned.
 */
export function placeSortRow(row, container, anchor) {
  if (!row || !container) return false;
  const parent = anchor?.parentElement ?? container;
  const target = anchor ?? container.firstChild;
  if (target === row) return false;
  if (row.parentElement === parent && row.nextSibling === target) return false;
  parent.insertBefore(row, target);
  return true;
}
