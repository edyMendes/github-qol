import { describe, it, expect, beforeEach, afterEach } from "vitest";
import descriptionDescriptor from "../src/js/content/features/sections/description.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

function buildPage({ nested = false } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  desc.textContent = "PR description";
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);

  if (nested) {
    // An intermediate wrapper between descWrap and the container.
    const mid = document.createElement("div");
    mid.appendChild(descWrap);
    container.appendChild(mid);
  } else {
    container.appendChild(descWrap);
  }

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  item1.setAttribute("data-gid", "1");
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  item2.setAttribute("data-gid", "2");
  container.append(item1, item2);

  document.body.appendChild(container);
  resetDomCache();
  return { container, descGroup, descWrap, item1, item2 };
}

beforeEach(() => buildPage());

afterEach(() => {
  descriptionDescriptor.cleanup();
  resetDomCache();
});

/**
 * React-era live shape: the description sits in its own rails-partial
 * BESIDE the engine's Timeline-partial container, not inside it.
 */
function buildSiblingPage() {
  document.body.innerHTML = "";
  const flow = document.createElement("div");
  flow.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  desc.textContent = "PR description";
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);
  const descPartial = document.createElement("rails-partial");
  descPartial.setAttribute("data-partial-name", "pullRequestsConversationsRoute.Description");
  descPartial.appendChild(descWrap);
  flow.appendChild(descPartial);

  const container = document.createElement("rails-partial");
  container.setAttribute("data-partial-name", "pullRequestsConversationsRoute.Timeline");
  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  item1.setAttribute("data-gid", "1");
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  item2.setAttribute("data-gid", "2");
  container.append(item1, item2);
  flow.appendChild(container);

  document.body.appendChild(flow);
  resetDomCache();
  return { flow, container, descPartial, item1, item2 };
}

describe("description descriptor", () => {
  it("resolves the direct-child wrapper", () => {
    const { container, descWrap } = buildPage();
    expect(descriptionDescriptor.resolve(container)).toBe(descWrap);
  });

  it("climbs to the container's direct child through intermediates", () => {
    const { container, descWrap } = buildPage({ nested: true });
    const unit = descriptionDescriptor.resolve(container);
    // The intermediate wrapper is the movable unit — moving it carries
    // the whole description subtree.
    expect(unit).toBe(descWrap.parentElement);
    expect(unit.contains(descWrap)).toBe(true);
  });

  it("resolves the marked unit after placement", () => {
    const { container, descWrap, item1 } = buildPage();
    descriptionDescriptor.place(descWrap, container, "before", item1);
    expect(descriptionDescriptor.resolve(container)).toBe(descWrap);
    expect(descWrap.getAttribute("data-gqol-desc-section")).toBe("1");
  });

  it("place before: inserts above the ref and marks", () => {
    const { container, descWrap, item1 } = buildPage();
    const placed = descriptionDescriptor.place(descWrap, container, "before", item1);
    expect(placed).toBe(descWrap);
    expect(item1.previousSibling).toBe(descWrap);
  });

  it("place after: inserts directly after the ref", () => {
    const { container, descWrap, item2 } = buildPage();
    descriptionDescriptor.place(descWrap, container, "after", item2);
    expect(descWrap.previousSibling).toBe(item2);
  });

  it("isPlaced requires marker and adjacency", () => {
    const { container, descWrap, item1 } = buildPage();
    expect(descriptionDescriptor.isPlaced(descWrap, container, "before", item1)).toBe(false);
    descriptionDescriptor.place(descWrap, container, "before", item1);
    expect(descriptionDescriptor.isPlaced(descWrap, container, "before", item1)).toBe(true);
  });

  it("cleanup restores the native position and marker", () => {
    const { container, descWrap, item1, item2 } = buildPage();
    descriptionDescriptor.place(descWrap, container, "after", item2);
    descriptionDescriptor.cleanup();
    expect([...container.children].slice(0, 3)).toEqual([descWrap, item1, item2]);
    expect(descWrap.hasAttribute("data-gqol-desc-section")).toBe(false);
  });

  it("declares recovery with the description landmark", () => {
    buildPage();
    expect(descriptionDescriptor.recovery.expectedWhen({})).toBe(true);
    expect(descriptionDescriptor.recovery.landmark()).not.toBe(null);
  });

  it("live shape: resolves the sibling rails-partial beside the container", () => {
    const { container, descPartial } = buildSiblingPage();
    expect(descriptionDescriptor.resolve(container)).toBe(descPartial);
  });

  it("live shape: moves into the container and restores home on cleanup", () => {
    const { flow, container, descPartial, item2 } = buildSiblingPage();
    expect(
      descriptionDescriptor.isPlaced(descPartial, container, "after", item2),
    ).toBe(false);
    descriptionDescriptor.place(descPartial, container, "after", item2);
    expect(descPartial.parentElement).toBe(container);
    expect(descPartial.previousSibling).toBe(item2);
    expect(
      descriptionDescriptor.isPlaced(descPartial, container, "after", item2),
    ).toBe(true);

    descriptionDescriptor.cleanup();
    expect(descPartial.parentElement).toBe(flow);
    expect(descPartial.hasAttribute("data-gqol-desc-section")).toBe(false);
  });
});
