import { describe, it, expect, beforeEach, afterEach } from "vitest";
import commentBoxFeature from "../src/js/content/features/comment-box.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const SETTINGS = { commentBoxAtTop: true, reverseTimeline: true };

/**
 * Mirrors the PR conversation layout: description, timeline items, then
 * the comment box (with guidelines/ProTip footer texts inside) at its
 * native end-of-timeline position.
 */
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
  commentBoxFeature.reset();
  resetDomCache();
});

describe("comment-box-placement", () => {
  it("moves the box above the first timeline item and marks it", () => {
    const { container, commentWrapper } = buildPage();
    expect(commentBoxFeature.apply(SETTINGS)).toBe(true);

    const firstItem = container.querySelector(":scope > .js-timeline-item");
    expect(firstItem.previousElementSibling).toBe(commentWrapper);
    expect(commentWrapper.getAttribute("data-gqol-comment-box-moved")).toBe("1");
    expect(commentWrapper.classList.contains("gqol-comment-box-at-top")).toBe(true);
  });

  it("extracts the footer texts to the end of the timeline", () => {
    const { container } = buildPage();
    commentBoxFeature.apply(SETTINGS);

    const footer = document.querySelector(
      "[data-gqol-comment-footer-moved='1']",
    );
    expect(footer).not.toBeNull();
    expect(footer.classList.contains("text-small")).toBe(true);
    expect(footer.closest(".js-discussion")).toBe(container);
    expect(container.lastElementChild).toBe(footer);
  });

  it("reports no work once placed and extracted", () => {
    buildPage();
    commentBoxFeature.apply(SETTINGS);
    expect(commentBoxFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("reports work while unplaced", () => {
    buildPage();
    expect(commentBoxFeature.needsWork(SETTINGS)).toBe(true);
  });

  it("restores the box and footers on reset", () => {
    const { container, commentWrapper, form } = buildPage();
    commentBoxFeature.apply(SETTINGS);
    commentBoxFeature.reset();

    expect(container.lastElementChild).toBe(commentWrapper);
    expect(commentWrapper.lastElementChild.className).toBe("text-small");
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(form.isConnected).toBe(true);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBeNull();
  });

  it("undoes everything when the sort is oldest-first", () => {
    const { container, commentWrapper } = buildPage();
    commentBoxFeature.apply(SETTINGS);
    const result = commentBoxFeature.apply({
      commentBoxAtTop: true,
      reverseTimeline: false,
    });
    expect(result).toBe(false);
    expect(container.lastElementChild).toBe(commentWrapper);
    expect(document.querySelector("[data-gqol-comment-box-moved]")).toBeNull();
  });

  it("reports pending while the form has not rendered in the swap window", () => {
    const { container, commentWrapper } = buildPage();
    commentWrapper.remove(); // GitHub has not rendered the form yet.
    resetDomCache();
    expect(commentBoxFeature.needsWork(SETTINGS)).toBe(true);
  });
});
