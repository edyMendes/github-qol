import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mergeboxDescriptor from "../src/js/content/features/sections/mergebox.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const STACK_CLASSES =
  "tmp-py-2 tmp-px-3 border bgColor-muted rounded-2 mt-2 Stack";

function buildPage() {
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
  descWrap.className =
    "TimelineItem TimelineItem--condensed js-comment-container js-command-palette-pull-body";
  descWrap.appendChild(descGroup);

  const stack = document.createElement("div");
  stack.className = STACK_CLASSES;
  const mergeBox = document.createElement("div");
  mergeBox.setAttribute("data-testid", "mergebox-partial");
  stack.appendChild(mergeBox);

  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  const item3 = document.createElement("div");
  item3.className = "js-timeline-item";

  container.append(descWrap, stack, item2, item3);
  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, stack, mergeBox, item2, item3 };
}

beforeEach(() => {
  buildPage();
});

afterEach(() => {
  mergeboxDescriptor.cleanup();
  resetDomCache();
});

describe("mergebox descriptor", () => {
  it("resolves the stack unit when unwrapped, the row once wrapped", () => {
    const { container, stack } = buildPage();
    expect(mergeboxDescriptor.resolve(container)).toBe(stack);
    const row = mergeboxDescriptor.place(stack, container, "before", null);
    expect(mergeboxDescriptor.resolve(container)).toBe(row);
  });

  it("place before: wraps in a row, anchors, styles, marks the desc anchor", () => {
    const { container, stack, mergeBox, descWrap, item2 } = buildPage();
    const row = mergeboxDescriptor.place(stack, container, "before", item2);
    expect(row.classList.contains("gqol-mergebox-timeline-row")).toBe(true);
    expect(row.nextSibling).toBe(item2);
    expect(stack.parentElement).toBe(row);
    expect(stack.className).toBe("Stack");
    expect(mergeBox.classList.contains("gqol-mergebox-below-desc")).toBe(true);
    expect(descWrap.hasAttribute("data-gqol-merge-anchor")).toBe(true);
  });

  it("place after: puts the row directly after the ref", () => {
    const { container, stack, item3 } = buildPage();
    const row = mergeboxDescriptor.place(stack, container, "after", item3);
    expect(row.previousSibling).toBe(item3);
    expect(descWrapHasAnchor()).toBe(false);
  });

  function descWrapHasAnchor() {
    return document
      .querySelector('[data-testid="pull-request-description"]')
      .closest(".js-comment-container")
      .hasAttribute("data-gqol-merge-anchor");
  }

  it("isPlaced is false natively, true once placed before the ref", () => {
    const { container, stack, item2 } = buildPage();
    expect(mergeboxDescriptor.isPlaced(stack, container, "before", item2)).toBe(false);
    const row = mergeboxDescriptor.place(stack, container, "before", item2);
    expect(mergeboxDescriptor.isPlaced(row, container, "before", item2)).toBe(true);
  });

  it("cleanup restores classes, attributes and the original position", () => {
    const { container, descWrap, stack, mergeBox } = buildPage();
    const unit = mergeboxDescriptor.resolve(container);
    mergeboxDescriptor.place(unit, container, "before", null);
    mergeboxDescriptor.cleanup();

    expect([...stack.classList].sort()).toEqual(STACK_CLASSES.split(/\s+/).sort());
    expect(stack.parentElement).toBe(container);
    expect(stack.hasAttribute("data-gqol-stripped-merge-classes")).toBe(false);
    expect(mergeBox.classList.contains("gqol-mergebox-below-desc")).toBe(false);
    expect(descWrap.hasAttribute("data-gqol-merge-anchor")).toBe(false);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBe(null);
  });

  it("declares recovery with the mergebox landmark", () => {
    buildPage();
    expect(
      mergeboxDescriptor.recovery.expectedWhen({ sectionOrder: ["copilot", "mergebox", "commentBox", "timeline"] }),
    ).toBe(true);
    expect(mergeboxDescriptor.recovery.landmark()).not.toBe(null);
  });
});
