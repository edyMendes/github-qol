import { describe, it, expect, beforeEach } from "vitest";
import {
  getDirectTimelineItems,
  resolveTimelineStream,
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
    // The unknown item keeps its current slot (after the block): the saved
    // gid order is restored within the block itself.
    expect(order(container)).toEqual(["1", "2", "new"]);
  });

  it("keeps non-item siblings (callouts, footer) in place when reversing", () => {
    const container = buildTimeline(["1", "2"]);
    const hint = document.createElement("div");
    hint.className = "copilot-hint";
    const footer = document.createElement("div");
    footer.className="timeline-footer";
    footer.textContent = "Remember, contributions to this repository should follow our GitHub Community Guidelines.";
    container.prepend(hint);
    container.appendChild(footer);

    reverseTimelineContainer(container, SELECTOR);
    expect(order(container)).toEqual(["2", "1"]);
    expect(container.firstElementChild).toBe(hint);
    expect(container.lastElementChild).toBe(footer);

    restoreTimelineOrder(container, SELECTOR);
    expect(order(container)).toEqual(["1", "2"]);
    expect(container.firstElementChild).toBe(hint);
    expect(container.lastElementChild).toBe(footer);
  });
});

describe("resolveTimelineStream", () => {
  it("prefers direct container children (legacy DOM)", () => {
    const container = document.createElement("div");
    for (let i = 1; i <= 3; i++) {
      const item = document.createElement("div");
      item.className = "js-timeline-item";
      container.appendChild(item);
    }
    const stream = resolveTimelineStream(container);
    expect(stream.parent).toBe(container);
    expect(stream.selector).toBe(".js-timeline-item");
    expect(stream.items.length).toBe(3);
  });

  it("finds the nested stream parent on React-era DOM", () => {
    // The partial's only .js-timeline-item child is the focus wrapper;
    // the real items are .TimelineItem elements inside an anonymous div.
    const partial = document.createElement("rails-partial");
    const focus = document.createElement("div");
    focus.className = "js-timeline-item js-timeline-progressive-focus-container";
    const inner = document.createElement("div");
    for (let i = 1; i <= 4; i++) {
      const item = document.createElement("div");
      item.className = "TimelineItem";
      item.setAttribute("data-gid", String(i));
      inner.appendChild(item);
    }
    focus.appendChild(inner);
    partial.appendChild(focus);
    const stream = resolveTimelineStream(partial);
    expect(stream.parent).toBe(inner);
    expect(stream.selector).toBe(".TimelineItem");
    expect(stream.items.length).toBe(4);
  });

  it("returns null until two items share a parent", () => {
    const container = document.createElement("div");
    const lone = document.createElement("div");
    lone.className = "js-timeline-item";
    container.appendChild(lone);
    expect(resolveTimelineStream(container)).toBe(null);
  });

  it("ignores the marked description unit", () => {
    const container = document.createElement("div");
    const desc = document.createElement("div");
    desc.className = "js-timeline-item";
    desc.setAttribute("data-gqol-desc-section", "1");
    const a = document.createElement("div");
    const b = document.createElement("div");
    a.className = b.className = "js-timeline-item";
    container.append(desc, a, b);
    const stream = resolveTimelineStream(container);
    expect(stream.items.length).toBe(2);
    expect(stream.items).not.toContain(desc);
  });
});
