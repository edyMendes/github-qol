import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mergeboxFeature from "../src/js/content/features/mergebox.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const SETTINGS = { showMergeBoxBelowDescription: true };

const STACK_CLASSES =
  "tmp-py-2 tmp-px-3 border bgColor-muted rounded-2 mt-2 Stack";

/**
 * Mirrors the React-era PR conversation layout: the description block,
 * the merge box wrapped in a decorated React "Stack", then timeline
 * items — all children of one flow container.
 */
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
  descWrap.className = "TimelineItem TimelineItem--condensed js-comment-container js-command-palette-pull-body";
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
  mergeboxFeature.reset();
  resetDomCache();
});

describe("mergebox-below-description", () => {
  it("marks the description's TimelineItem as the merge anchor", () => {
    const { descWrap } = buildPage();
    mergeboxFeature.apply(SETTINGS);
    expect(descWrap.hasAttribute("data-gqol-merge-anchor")).toBe(true);
  });

  it("strips the Stack wrapper's decorative classes but keeps the layout hook", () => {
    const { stack } = buildPage();
    mergeboxFeature.apply(SETTINGS);
    expect(stack.className).toBe("Stack");
  });

  it("styles the bare partial for its new spot", () => {
    const { mergeBox } = buildPage();
    mergeboxFeature.apply(SETTINGS);
    expect(mergeBox.classList.contains("gqol-mergebox-below-desc")).toBe(true);
  });

  it("wraps the unit in a timeline row before the first item", () => {
    const { stack, item2 } = buildPage();
    mergeboxFeature.apply(SETTINGS);
    const row = stack.parentElement;
    expect(row.classList.contains("gqol-mergebox-timeline-row")).toBe(true);
    expect(row.nextElementSibling).toBe(item2);
  });

  it("reports no work once placed", () => {
    buildPage();
    mergeboxFeature.apply(SETTINGS);
    expect(mergeboxFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("reset restores classes, attributes and the original position", () => {
    const { container, descWrap, stack, mergeBox } = buildPage();
    mergeboxFeature.apply(SETTINGS);
    mergeboxFeature.reset();

    expect([...stack.classList].sort()).toEqual(STACK_CLASSES.split(/\s+/).sort());
    expect(stack.parentElement).toBe(container);
    expect(stack.hasAttribute("data-gqol-stripped-merge-classes")).toBe(false);
    expect(mergeBox.classList.contains("gqol-mergebox-below-desc")).toBe(false);
    expect(descWrap.hasAttribute("data-gqol-merge-anchor")).toBe(false);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBe(null);
  });
});
