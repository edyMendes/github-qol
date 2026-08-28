import { describe, it, expect, beforeEach, afterEach } from "vitest";
import commentBoxDescriptor from "../src/js/content/features/sections/comment-box.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

function buildPage({ itemCount = 2, withFooters = true } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);
  container.appendChild(descWrap);

  for (let i = 1; i <= itemCount; i++) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    item.setAttribute("data-gid", String(i));
    container.appendChild(item);
  }

  const commentWrapper = document.createElement("div");
  const form = document.createElement("form");
  form.className = "js-new-comment-form";
  const field = document.createElement("textarea");
  field.id = "new_comment_field";
  form.appendChild(field);
  commentWrapper.appendChild(form);
  if (withFooters) {
    const footer = document.createElement("div");
    footer.className = "text-small";
    footer.textContent =
      "Remember, contributions to this repository should follow our guidelines.";
    commentWrapper.appendChild(footer);
  }
  container.appendChild(commentWrapper);

  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, commentWrapper, form, field };
}

beforeEach(() => {
  buildPage();
});

afterEach(() => {
  commentBoxDescriptor.cleanup();
  resetDomCache();
});

describe("commentBox descriptor", () => {
  it("resolves the comment wrapper", () => {
    const { container, commentWrapper } = buildPage();
    expect(commentBoxDescriptor.resolve(container)).toBe(commentWrapper);
  });

  it("place before: moves above ref, extracts footers, marks the box", () => {
    const { container, commentWrapper } = buildPage();
    const firstItem = container.querySelector(":scope > .js-timeline-item");
    const placed = commentBoxDescriptor.place(
      commentWrapper, container, "before", firstItem,
    );
    expect(placed).toBe(commentWrapper);
    expect(firstItem.previousElementSibling).toBe(commentWrapper);
    expect(commentWrapper.getAttribute("data-gqol-comment-box-moved")).toBe("1");
    expect(commentWrapper.classList.contains("gqol-comment-box-at-top")).toBe(true);
    const footer = document.querySelector("[data-gqol-comment-footer-moved='1']");
    expect(footer).not.toBeNull();
    expect(container.lastElementChild).toBe(footer);
  });

  it("isPlaced before-mode requires marker, adjacency and extracted footers", () => {
    const { container, commentWrapper } = buildPage();
    const firstItem = container.querySelector(":scope > .js-timeline-item");
    expect(
      commentBoxDescriptor.isPlaced(commentWrapper, container, "before", firstItem),
    ).toBe(false);
    commentBoxDescriptor.place(commentWrapper, container, "before", firstItem);
    expect(
      commentBoxDescriptor.isPlaced(commentWrapper, container, "before", firstItem),
    ).toBe(true);
  });

  it("place after: keeps footers inside the box, no marker", () => {
    const { container, commentWrapper } = buildPage();
    const items = container.querySelectorAll(":scope > .js-timeline-item");
    const lastItem = items[items.length - 1];
    commentBoxDescriptor.place(commentWrapper, container, "after", lastItem);
    expect(commentWrapper.previousSibling).toBe(lastItem);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBeNull();
    expect(
      commentWrapper.textContent.includes("Remember, contributions"),
    ).toBe(true);
  });

  it("cleanup restores the box and footers to native positions", () => {
    const { container, commentWrapper } = buildPage();
    const firstItem = container.querySelector(":scope > .js-timeline-item");
    commentBoxDescriptor.place(commentWrapper, container, "before", firstItem);
    commentBoxDescriptor.cleanup();
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBeNull();
    expect(container.lastElementChild).toBe(commentWrapper);
  });

  it("declares recovery only when ranked before the timeline", () => {
    buildPage();
    expect(
      commentBoxDescriptor.recovery.expectedWhen({
        sectionOrder: ["copilot", "mergebox", "commentBox", "timeline"],
      }),
    ).toBe(true);
    expect(
      commentBoxDescriptor.recovery.expectedWhen({
        sectionOrder: ["copilot", "timeline", "commentBox", "mergebox"],
      }),
    ).toBe(false);
    expect(commentBoxDescriptor.recovery.landmark()).not.toBe(null);
  });
});
