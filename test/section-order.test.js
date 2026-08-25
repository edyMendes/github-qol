import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sectionOrderFeature from "../src/js/content/features/section-order.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const DEFAULTS = {
  timelineOrder: "newest",
  sectionOrder: ["description", "mergebox", "commentBox", "timeline"],
};

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
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);
  container.appendChild(descWrap);

  // The @copilot hint callout — NOT orderable (hide-copilot owns it);
  // the engine must leave it wherever it natively sits.
  const bannerUnit = document.createElement("div");
  bannerUnit.textContent = "Mention @copilot in a comment to make changes.";
  container.appendChild(bannerUnit);

  const stack = document.createElement("div");
  stack.className = "tmp-py-2 border bgColor-muted rounded-2 mt-2 Stack";
  const mergeBox = document.createElement("div");
  mergeBox.setAttribute("data-testid", "mergebox-partial");
  stack.appendChild(mergeBox);
  container.appendChild(stack);

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  item1.setAttribute("data-gid", "1");
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  item2.setAttribute("data-gid", "2");
  container.append(item1, item2);

  const commentWrapper = document.createElement("div");
  const form = document.createElement("form");
  form.className = "js-new-comment-form";
  const field = document.createElement("textarea");
  field.id = "new_comment_field";
  form.appendChild(field);
  commentWrapper.appendChild(form);
  const footer = document.createElement("div");
  footer.textContent =
    "Remember, contributions to this repository should follow our guidelines.";
  commentWrapper.appendChild(footer);
  container.appendChild(commentWrapper);

  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, bannerUnit, stack, mergeBox, item1, item2, commentWrapper };
}

beforeEach(() => buildPage());

afterEach(() => {
  sectionOrderFeature.reset();
  resetDomCache();
});

function directChildren(container) {
  return [...container.children].map((el) =>
    el.classList.contains("gqol-mergebox-timeline-row")
      ? "mergebox"
      : el.hasAttribute("data-gqol-desc-section")
        ? "description"
        : el.hasAttribute("data-gqol-comment-box-moved") ||
            el.querySelector(":scope > form.js-new-comment-form")
          ? "commentBox"
          : el.classList.contains("js-timeline-item")
            ? "item"
            : "other",
  );
}

describe("section-order feature", () => {
  it("lays out the default order: description, mergebox, commentBox above the items", () => {
    const { container } = buildPage();
    expect(sectionOrderFeature.apply(DEFAULTS)).toBe(true);
    expect(directChildren(container)).toEqual([
      "other", "description", "mergebox", "commentBox", "item", "item", "other",
    ]);
  });

  it("marks the description unit so the reversal excludes it", () => {
    const { descWrap } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    expect(descWrap.getAttribute("data-gqol-desc-section")).toBe("1");
  });

  it("places the description below the items when ranked last", () => {
    const { container } = buildPage();
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "commentBox", "timeline", "description"],
    });
    expect(directChildren(container)).toEqual([
      "other", "mergebox", "commentBox", "item", "item", "description", "other",
    ]);
  });

  it("places sections ranked after the timeline below the items", () => {
    const { container, commentWrapper } = buildPage();
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["description", "mergebox", "timeline", "commentBox"],
    });
    expect(directChildren(container)).toEqual([
      "other", "description", "mergebox", "item", "item", "commentBox",
    ]);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
  });

  it("reorders when the rank flips between passes", () => {
    const { container } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "description", "commentBox", "timeline"],
    });
    expect(directChildren(container)).toEqual([
      "other", "mergebox", "description", "commentBox", "item", "item", "other",
    ]);
  });

  it("leaves the copilot hint untouched (not an orderable section)", () => {
    const { bannerUnit } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    expect(bannerUnit.hasAttribute("data-gqol-copilot-hidden")).toBe(false);
    expect(bannerUnit.closest(".js-discussion")).not.toBeNull();
  });

  it("skips absent sections without failing", () => {
    const { container, stack } = buildPage();
    stack.remove();
    resetDomCache();
    sectionOrderFeature.apply(DEFAULTS);
    expect(directChildren(container)).toEqual([
      "other", "description", "commentBox", "item", "item", "other",
    ]);
  });

  it("reports no needsWork once laid out", () => {
    buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    expect(sectionOrderFeature.needsWork(DEFAULTS)).toBe(false);
  });

  it("reports needsWork when a section is out of slot", () => {
    buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "description", "commentBox", "timeline"],
    });
    expect(sectionOrderFeature.needsWork(DEFAULTS)).toBe(true);
  });

  it("reset restores every section to native positions", () => {
    const { container, descWrap, bannerUnit, stack, item1, item2, commentWrapper } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.reset();
    expect([...container.children]).toEqual([
      descWrap, bannerUnit, stack, item1, item2, commentWrapper,
    ]);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBe(null);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBe(null);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(descWrap.hasAttribute("data-gqol-desc-section")).toBe(false);
  });

  it("aggregates recovery across descriptors", () => {
    buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    expect(sectionOrderFeature.recovery.expectedWhen(DEFAULTS)).toBe(true);
    expect(sectionOrderFeature.recovery.isPresent()).toBe(true);
    document.querySelector('[data-testid="mergebox-partial"]').remove();
    resetDomCache();
    expect(sectionOrderFeature.recovery.isPresent()).toBe(false);
  });
});
