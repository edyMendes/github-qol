import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSortButton,
  createSortRow,
  getSortButton,
  isSortRowPlaced,
  placeSortRow,
  setSortDirection,
  SORT_BUTTON_ID,
  SORT_ROW_CLASS,
} from "../src/js/lib/sort-button.js";

const ITEM_SELECTOR = ".js-timeline-item";

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createSortRow", () => {
  it("wraps the button in a row", () => {
    const button = createSortButton();
    const row = createSortRow(button);
    expect(row.className).toBe(SORT_ROW_CLASS);
    expect(row.contains(button)).toBe(true);
  });

  it("creates its own button when none is given", () => {
    const row = createSortRow();
    expect(row.querySelector(`#${SORT_BUTTON_ID}`)).not.toBeNull();
  });
});

describe("placeSortRow", () => {
  it("prepends to the container when no anchor exists", () => {
    const container = el("div");
    container.appendChild(el("div", "js-timeline-item"));
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    const row = createSortRow();
    expect(placeSortRow(row, container)).toBe(true);
    expect(container.firstElementChild).toBe(row);
  });

  it("sits directly above the anchor element", () => {
    const container = el("div");
    const wrapper = el("div", "comment-wrapper");
    container.appendChild(wrapper);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    const row = createSortRow();
    expect(placeSortRow(row, container, wrapper)).toBe(true);
    expect(wrapper.previousElementSibling).toBe(row);
  });

  it("re-anchors above the wrapper when displaced after it", () => {
    const container = el("div");
    const wrapper = el("div", "comment-wrapper");
    container.appendChild(wrapper);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    const row = createSortRow();
    placeSortRow(row, container, wrapper);
    container.appendChild(row); // displaced after the wrapper
    expect(wrapper.previousElementSibling).not.toBe(row);

    expect(placeSortRow(row, container, wrapper)).toBe(true);
    expect(wrapper.previousElementSibling).toBe(row);
  });

  it("follows an anchor outside the timeline container", () => {
    const container = el("div");
    container.appendChild(el("div", "js-timeline-item"));
    const below = el("div", "below-timeline");
    const wrapper = el("div", "comment-wrapper");
    below.appendChild(wrapper);
    document.body.append(container, below);

    const row = createSortRow();
    expect(placeSortRow(row, container, wrapper)).toBe(true);
    expect(wrapper.previousElementSibling).toBe(row);
    expect(row.parentElement).toBe(below);
  });

  it("returns false when already anchored above the target", () => {
    const container = el("div");
    const wrapper = el("div", "comment-wrapper");
    container.appendChild(wrapper);
    document.body.appendChild(container);

    const row = createSortRow();
    placeSortRow(row, container, wrapper);
    expect(placeSortRow(row, container, wrapper)).toBe(false);
  });

  it("works in an empty container", () => {
    const container = el("div");
    document.body.appendChild(container);

    const row = createSortRow();
    expect(placeSortRow(row, container)).toBe(true);
    expect(container.firstElementChild).toBe(row);
    expect(placeSortRow(row, container)).toBe(false);
  });

  it("is a no-op with missing arguments", () => {
    const row = createSortRow();
    expect(placeSortRow(null, document.body)).toBe(false);
    expect(placeSortRow(row, null)).toBe(false);
  });
});

describe("isSortRowPlaced", () => {
  function buildAnchored() {
    const container = el("div");
    const wrapper = el("div", "comment-wrapper");
    container.appendChild(wrapper);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    const row = createSortRow();
    placeSortRow(row, container, wrapper);
    return { container, wrapper, row };
  }

  it("is true exactly when placeSortRow would be a no-op", () => {
    const { container, wrapper, row } = buildAnchored();
    expect(isSortRowPlaced(row, container, wrapper)).toBe(true);
    expect(placeSortRow(row, container, wrapper)).toBe(false);
  });

  it("is false when the row is displaced", () => {
    const { container, wrapper, row } = buildAnchored();
    container.appendChild(row);
    expect(isSortRowPlaced(row, container, wrapper)).toBe(false);
  });

  it("is true when the row itself is the insertion target", () => {
    const container = el("div");
    container.appendChild(createSortRow());
    document.body.appendChild(container);

    const row = container.firstElementChild;
    expect(isSortRowPlaced(row, container, null)).toBe(true);
  });

  it("is false for missing row or container", () => {
    const { container, row } = buildAnchored();
    expect(isSortRowPlaced(null, container, null)).toBe(false);
    expect(isSortRowPlaced(row, null, null)).toBe(false);
  });
});

describe("createSortButton", () => {
  it("creates a button with the expected id and defaults to newest first", () => {
    const button = createSortButton();
    expect(button.id).toBe(SORT_BUTTON_ID);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Sort: newest first");
    expect(button.getAttribute("aria-label")).toBe("Sort timeline newest first");
  });

  it("renders a chevron icon inside a label span", () => {
    const button = createSortButton();
    const label = button.querySelector(".gqol-sort-button__label");
    expect(label).not.toBeNull();
    expect(label.querySelector("svg.gqol-sort-button__icon")).not.toBeNull();
  });

  it("renders a filter icon left of the chevron inside the label span", () => {
    const button = createSortButton();
    const label = button.querySelector(".gqol-sort-button__label");
    const filter = label.querySelector("svg.gqol-sort-button__filter");
    const chevron = label.querySelector("svg.gqol-sort-button__icon");
    expect(filter).not.toBeNull();
    expect(filter.compareDocumentPosition(chevron)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("keeps the filter icon mounted across direction flips (CSS flip hook)", () => {
    const button = createSortButton();

    setSortDirection(button, false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(
      button.querySelector("svg.gqol-sort-button__filter"),
    ).not.toBeNull();

    setSortDirection(button, true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(
      button.querySelector("svg.gqol-sort-button__filter"),
    ).not.toBeNull();
  });

  it("reports the flipped direction on click", () => {
    const onClick = vi.fn();
    const button = createSortButton({ onClick });

    button.click();
    expect(onClick).toHaveBeenCalledWith(false);

    button.click();
    expect(onClick).toHaveBeenCalledWith(true);
  });

  it("updates its own visual state on click", () => {
    const button = createSortButton();
    button.click();

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toBe("Sort: oldest first");
  });

  it("is a type=button so it never submits forms", () => {
    expect(createSortButton().type).toBe("button");
  });
});

describe("setSortDirection", () => {
  it("syncs pressed/title/aria-label for each direction", () => {
    const button = createSortButton();

    setSortDirection(button, false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Sort timeline oldest first");

    setSortDirection(button, true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Sort: newest first");
  });

  it("is a no-op for a missing button", () => {
    expect(() => setSortDirection(null, true)).not.toThrow();
  });
});

describe("getSortButton", () => {
  it("finds the button once attached to the document", () => {
    expect(getSortButton()).toBeNull();
    const button = createSortButton();
    document.body.appendChild(button);
    expect(getSortButton()).toBe(button);
  });
});
