import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  findTimelineContainer,
  getTimelineItems,
  findMergeBox,
  findCommentForm,
  getDescriptionBody,
  getDescriptionElement,
  findDescriptionContainer,
  isConversationRendered,
  resetDomCache,
} from "../src/js/content/dom-cache.js";
import { TIMELINE_ITEM_SELECTOR } from "../src/js/lib/selectors.js";

/**
 * The per-pass DOM cache contract: each accessor computes its value at
 * most once per pass, only when asked (lazy), and resetDomCache() makes
 * the next call recompute.
 */

function buildConversationDom({ itemCount = 2 } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  const descBody = document.createElement("div");
  descBody.className = "markdown-body";
  descBody.textContent = "PR description";
  desc.appendChild(descBody);
  descGroup.appendChild(desc);

  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);

  const form = document.createElement("form");
  form.className = "js-new-comment-form";
  const field = document.createElement("textarea");
  field.id = "new_comment_field";
  form.appendChild(field);

  container.appendChild(descWrap);
  for (let i = 1; i <= itemCount; i++) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    container.appendChild(item);
  }
  container.appendChild(form);
  document.body.appendChild(container);
  return { container, desc, descBody };
}

beforeEach(() => {
  buildConversationDom();
});

afterEach(() => {
  resetDomCache();
});

describe("dom-cache accessors", () => {
  it("returns the timeline container and items", () => {
    const { container } = buildConversationDom();
    expect(findTimelineContainer()).toBe(container);
    expect(getTimelineItems()).toHaveLength(2);
  });

  it("caches each lookup within a pass (same node returned after DOM growth)", () => {
    const { container } = buildConversationDom();
    expect(getTimelineItems()).toHaveLength(2);
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    container.appendChild(item);
    expect(getTimelineItems()).toHaveLength(2); // still cached
  });

  it("recomputes after resetDomCache", () => {
    const { container } = buildConversationDom();
    getTimelineItems();
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    container.appendChild(item);
    resetDomCache();
    expect(getTimelineItems()).toHaveLength(3);
  });

  it("caches a null container result (missing container stays null until reset)", () => {
    document.body.innerHTML = "";
    resetDomCache();
    expect(findTimelineContainer()).toBe(null);
    buildConversationDom(); // items now exist, but the null is cached
    expect(findTimelineContainer()).toBe(null);
    resetDomCache();
    expect(findTimelineContainer()).not.toBe(null);
  });

  it("computes only what is asked for (merge box lookup skips timeline scans)", () => {
    buildConversationDom();
    resetDomCache();
    const spy = vi.spyOn(Element.prototype, "querySelectorAll");
    findMergeBox();
    const timelineScans = spy.mock.calls.filter(
      ([selector]) => selector === TIMELINE_ITEM_SELECTOR,
    );
    spy.mockRestore();
    expect(timelineScans).toHaveLength(0);
  });

  it("finds the comment form through its field", () => {
    const form = document.querySelector("form.js-new-comment-form");
    expect(findCommentForm()).toBe(form);
  });

  it("resolves the description element and body", () => {
    const { desc, descBody } = buildConversationDom();
    expect(getDescriptionElement()).toBe(desc);
    expect(getDescriptionBody()).toBe(descBody);
  });

  it("isConversationRendered requires description and two items", () => {
    buildConversationDom();
    expect(isConversationRendered()).toBe(true);
    buildConversationDom({ itemCount: 1 });
    resetDomCache();
    expect(isConversationRendered()).toBe(false);
  });

  it("falls back to parent-counting when no rails partial exists", () => {
    const { container } = buildConversationDom();
    expect(findDescriptionContainer()).toBeTruthy();
    expect(container.contains(findDescriptionContainer())).toBe(true);
  });
});
