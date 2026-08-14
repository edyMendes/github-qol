import { describe, it, expect, beforeEach } from "vitest";
import {
  findTimelineItemFor,
  findCommentWrapper,
  isPlacedBeforeTimelineItems,
  isLastChildOf,
} from "../src/js/lib/placement.js";

const ITEM_SELECTOR = ".js-timeline-item";

beforeEach(() => {
  document.body.innerHTML = "";
});

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

describe("findTimelineItemFor", () => {
  it("climbs to the closest timeline item", () => {
    const item = el("div", "js-timeline-item TimelineItem");
    const inner = el("div", "comment-body");
    item.appendChild(inner);
    document.body.appendChild(item);

    expect(findTimelineItemFor(inner, ITEM_SELECTOR)).toBe(item);
  });

  it("falls back to generic TimelineItem wrapper", () => {
    const item = el("div", "TimelineItem");
    const inner = el("div", "comment-body");
    item.appendChild(inner);
    document.body.appendChild(item);

    expect(findTimelineItemFor(inner, ITEM_SELECTOR)).toBe(item);
  });

  it("returns null for disconnected nodes", () => {
    const orphan = el("div", "comment-body");
    expect(findTimelineItemFor(orphan, ITEM_SELECTOR)).toBe(null);
  });
});

describe("findCommentWrapper", () => {
  function buildPage() {
    const container = el("div", "js-timeline-container");
    const item = el("div", "js-timeline-item");
    container.appendChild(item);

    const composerSection = el("div", "composer-section");
    const form = el("form", "js-new-comment-form");
    const field = el("textarea");
    field.id = "new_comment_field";
    form.appendChild(field);
    composerSection.appendChild(form);

    const page = el("div", "page");
    page.appendChild(container);
    page.appendChild(composerSection);
    document.body.appendChild(page);

    return { container, item, form, composerSection, page };
  }

  it("climbs to the node just below the parent containing the timeline container", () => {
    const { container, form, composerSection } = buildPage();
    const wrapper = findCommentWrapper(form, { timelineContainer: container });
    expect(wrapper).toBe(composerSection);
  });

  it("stops at a stopSelector match", () => {
    const { form } = buildPage();
    document.querySelector(".composer-section").className += " pull-discussion-timeline";
    const wrapper = findCommentWrapper(form, {
      stopSelector: "main, .pull-discussion-timeline",
    });
    expect(wrapper).toBe(form);
  });

  it("stops before a parent containing a timeline item", () => {
    const { item, form } = buildPage();
    const wrapper = findCommentWrapper(form, { timelineItem: item });
    expect(wrapper).toBe(form.closest(".composer-section"));
  });

  it("stops before a parent containing the merge box outside the current node", () => {
    const { form, page } = buildPage();
    const mergeBox = el("div");
    mergeBox.setAttribute("data-testid", "mergebox-partial");
    page.appendChild(mergeBox);

    const wrapper = findCommentWrapper(form, { mergeBox });
    expect(wrapper).toBe(form.closest(".composer-section"));
  });

  it("climbs through a node that contains the merge box itself", () => {
    const { container, form } = buildPage();
    const mergeBox = el("div");
    mergeBox.setAttribute("data-testid", "mergebox-partial");
    form.appendChild(mergeBox);

    const wrapper = findCommentWrapper(form, { timelineContainer: container, mergeBox });
    expect(wrapper).toBe(form.closest(".composer-section"));
  });

  it("stops at document.body", () => {
    const form = el("form");
    document.body.appendChild(form);
    expect(findCommentWrapper(form)).toBe(form);
  });

  it("returns null for a disconnected form", () => {
    const form = el("form");
    expect(findCommentWrapper(form)).toBe(null);
  });
});

describe("isPlacedBeforeTimelineItems", () => {
  it("is true when the wrapper precedes all timeline items", () => {
    const container = el("div");
    const wrapper = el("div", "composer");
    container.appendChild(wrapper);
    container.appendChild(el("div", "js-timeline-item"));
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    expect(isPlacedBeforeTimelineItems(wrapper, container, ITEM_SELECTOR)).toBe(true);
  });

  it("is false when a timeline item precedes the wrapper", () => {
    const container = el("div");
    container.appendChild(el("div", "js-timeline-item"));
    const wrapper = el("div", "composer");
    container.appendChild(wrapper);
    document.body.appendChild(container);

    expect(isPlacedBeforeTimelineItems(wrapper, container, ITEM_SELECTOR)).toBe(false);
  });

  it("ignores non-timeline siblings before the wrapper", () => {
    const container = el("div");
    container.appendChild(el("div", "something-else"));
    const wrapper = el("div", "composer");
    container.appendChild(wrapper);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    expect(isPlacedBeforeTimelineItems(wrapper, container, ITEM_SELECTOR)).toBe(true);
  });

  it("is false when the wrapper lives elsewhere", () => {
    const container = el("div");
    container.appendChild(el("div", "js-timeline-item"));
    const wrapper = el("div", "composer");
    document.body.appendChild(container);
    document.body.appendChild(wrapper);

    expect(isPlacedBeforeTimelineItems(wrapper, container, ITEM_SELECTOR)).toBe(false);
  });
});

describe("isLastChildOf", () => {
  it("is true for the last child", () => {
    const parent = el("div");
    const row = el("div");
    parent.appendChild(el("div"));
    parent.appendChild(row);
    expect(isLastChildOf(row, parent)).toBe(true);
  });

  it("is false for a non-last child", () => {
    const parent = el("div");
    const row = el("div");
    parent.appendChild(row);
    parent.appendChild(el("div"));
    expect(isLastChildOf(row, parent)).toBe(false);
  });

  it("is false when the row has a different parent", () => {
    const parent = el("div");
    const other = el("div");
    const row = el("div");
    other.appendChild(row);
    expect(isLastChildOf(row, parent)).toBe(false);
  });
});
