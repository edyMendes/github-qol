import { describe, it, expect, beforeEach } from "vitest";
import {
  collectTimelineItems,
  getDirectTimelineItems,
  reverseTimelineContainer,
  restoreTimelineOrder,
} from "../src/js/lib/timeline.js";

const SELECTOR = ".js-timeline-item";

function buildTimeline(gids) {
  const container = document.createElement("div");
  container.className = "js-discussion";
  for (const gid of gids) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    item.dataset.gid = gid;
    container.appendChild(item);
  }
  document.body.appendChild(container);
  return container;
}

function order(container) {
  return getDirectTimelineItems(container, SELECTOR).map(
    (item) => item.dataset.gid,
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collectTimelineItems", () => {
  it("collects matching descendants from a root", () => {
    const container = buildTimeline(["a", "b"]);
    const nested = document.createElement("div");
    nested.className = "js-timeline-item";
    nested.dataset.gid = "c";
    container.children[0].appendChild(nested);

    const items = collectTimelineItems(container, SELECTOR);
    expect(items.map((el) => el.dataset.gid)).toEqual(["a", "c", "b"]);
  });
});

describe("getDirectTimelineItems", () => {
  it("only returns direct children matching the selector", () => {
    const container = buildTimeline(["a", "b"]);

    const noise = document.createElement("div");
    container.appendChild(noise);
    const nested = document.createElement("div");
    nested.className = "js-timeline-item";
    container.children[0].appendChild(nested);

    expect(order(container)).toEqual(["a", "b"]);
  });
});

describe("reverseTimelineContainer", () => {
  it("returns false and does nothing with fewer than 2 items", () => {
    const container = buildTimeline(["only"]);
    expect(reverseTimelineContainer(container, SELECTOR)).toBe(false);
    expect(order(container)).toEqual(["only"]);
    expect(container.hasAttribute("data-gqol-reverse")).toBe(false);
  });

  it("reverses order, saves gids, and marks the container", () => {
    const container = buildTimeline(["1", "2", "3"]);
    expect(reverseTimelineContainer(container, SELECTOR)).toBe(true);

    expect(order(container)).toEqual(["3", "2", "1"]);
    expect(container.getAttribute("data-gqol-timeline-gids")).toBe("1|2|3");
    expect(container.getAttribute("data-gqol-reverse")).toBe("1");
  });

  it("does not overwrite saved gids on repeated reversal", () => {
    const container = buildTimeline(["1", "2", "3"]);
    reverseTimelineContainer(container, SELECTOR);
    reverseTimelineContainer(container, SELECTOR);

    expect(order(container)).toEqual(["1", "2", "3"]);
    expect(container.getAttribute("data-gqol-timeline-gids")).toBe("1|2|3");
  });
});

describe("restoreTimelineOrder", () => {
  it("restores the original order from saved gids", () => {
    const container = buildTimeline(["1", "2", "3"]);
    reverseTimelineContainer(container, SELECTOR);
    expect(order(container)).toEqual(["3", "2", "1"]);

    expect(restoreTimelineOrder(container, SELECTOR)).toBe(true);
    expect(order(container)).toEqual(["1", "2", "3"]);
    expect(container.hasAttribute("data-gqol-reverse")).toBe(false);
    expect(container.hasAttribute("data-gqol-timeline-gids")).toBe(false);
  });

  it("falls back to reversing when no gids were saved", () => {
    const container = buildTimeline(["1", "2", "3"]);
    container.setAttribute("data-gqol-reverse", "1");

    expect(restoreTimelineOrder(container, SELECTOR)).toBe(true);
    expect(order(container)).toEqual(["3", "2", "1"]);
  });

  it("returns false when there is nothing to undo", () => {
    const container = buildTimeline(["1", "2"]);
    expect(restoreTimelineOrder(container, SELECTOR)).toBe(false);
    expect(order(container)).toEqual(["1", "2"]);
  });

  it("round-trips even after items were prepended while reversed", () => {
    const container = buildTimeline(["1", "2"]);
    reverseTimelineContainer(container, SELECTOR);

    const fresh = document.createElement("div");
    fresh.className = "js-timeline-item";
    fresh.dataset.gid = "new";
    container.prepend(fresh);
    expect(order(container)).toEqual(["new", "2", "1"]);

    restoreTimelineOrder(container, SELECTOR);
    expect(order(container)).toEqual(["new", "1", "2"]);
  });
});
