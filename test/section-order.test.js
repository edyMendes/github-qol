import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sectionOrderFeature from "../src/js/content/features/section-order.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const DEFAULTS = {
  timelineOrder: "newest",
  sectionOrder: ["copilot", "mergebox", "commentBox", "timeline"],
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

  const bannerUnit = document.createElement("div");
  const banner = document.createElement("div");
  banner.setAttribute("data-testid", "copilot-pull-request-summaries");
  banner.textContent = "Copilot summary";
  bannerUnit.appendChild(banner);
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
      : el === document.querySelector("[data-gqol-copilot-moved='1']")
        ? "copilot"
        : el.hasAttribute("data-gqol-comment-box-moved") ||
            el.querySelector(":scope > form.js-new-comment-form")
          ? "commentBox"
          : el.classList.contains("js-timeline-item")
            ? "item"
            : "other",
  );
}

describe("section-order feature", () => {
  it("lays out the default order: copilot, mergebox, commentBox above the items", () => {
    const { container } = buildPage();
    expect(sectionOrderFeature.apply(DEFAULTS)).toBe(true);
    expect(directChildren(container)).toEqual([
      "other", "copilot", "mergebox", "commentBox", "item", "item", "other",
    ]);
  });

  it("places sections ranked after the timeline below the items", () => {
    const { container, commentWrapper } = buildPage();
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"],
    });
    // 6 children: footers stay INSIDE the box in after-mode.
    expect(directChildren(container)).toEqual([
      "other", "copilot", "mergebox", "item", "item", "commentBox",
    ]);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
  });

  it("reorders when the rank flips between passes", () => {
    const { container, bannerUnit } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "copilot", "commentBox", "timeline"],
    });
    expect(directChildren(container)).toEqual([
      "other", "mergebox", "copilot", "commentBox", "item", "item", "other",
    ]);
    expect(bannerUnit.getAttribute("data-gqol-copilot-moved")).toBe("1");
  });

  it("skips absent sections without failing", () => {
    const { container, bannerUnit } = buildPage();
    bannerUnit.remove();
    resetDomCache();
    sectionOrderFeature.apply(DEFAULTS);
    expect(directChildren(container)).toEqual([
      "other", "mergebox", "commentBox", "item", "item", "other",
    ]);
  });

  it("reports no needsWork once laid out", () => {
    buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    expect(sectionOrderFeature.needsWork(DEFAULTS)).toBe(false);
  });

  it("reports needsWork when a section is out of slot", () => {
    const { container } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "copilot", "commentBox", "timeline"],
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
    expect(bannerUnit.hasAttribute("data-gqol-copilot-moved")).toBe(false);
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
