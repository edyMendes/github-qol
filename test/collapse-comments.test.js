import { describe, it, expect, beforeEach, afterEach } from "vitest";
import collapseCommentsFeature from "../src/js/content/features/collapse-comments.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const SETTINGS = { collapseLongComments: true };

/**
 * A PR conversation: description (excluded from this feature) plus
 * timeline items carrying markdown bodies. jsdom reports scrollHeight 0,
 * so heights are injected directly — the cutoff is > 144px.
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
  descBody.textContent = "A lengthy description";
  Object.defineProperty(descBody, "scrollHeight", { value: 400 });
  desc.appendChild(descBody);
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);

  const tallCommentItem = document.createElement("div");
  tallCommentItem.className = "js-timeline-item";
  const tallBody = document.createElement("div");
  tallBody.className = "markdown-body";
  tallBody.textContent = "A very long user comment";
  Object.defineProperty(tallBody, "scrollHeight", { value: 300 });
  tallCommentItem.appendChild(tallBody);

  const shortCommentItem = document.createElement("div");
  shortCommentItem.className = "js-timeline-item";
  const shortBody = document.createElement("div");
  shortBody.className = "markdown-body";
  shortBody.textContent = "Short.";
  Object.defineProperty(shortBody, "scrollHeight", { value: 50 });
  shortCommentItem.appendChild(shortBody);

  const copilotItem = document.createElement("div");
  copilotItem.className = "TimelineItem";
  const copilotBody = document.createElement("div");
  copilotBody.className = "markdown-body";
  copilotBody.textContent = "Copilot reviewed 3 files and left suggestions";
  Object.defineProperty(copilotBody, "scrollHeight", { value: 250 });
  copilotItem.appendChild(copilotBody);

  container.append(
    descWrap,
    tallCommentItem,
    shortCommentItem,
    copilotItem,
  );
  document.body.appendChild(container);
  resetDomCache();
  return { container, descBody, tallBody, shortBody, copilotBody };
}

beforeEach(() => buildPage());

afterEach(() => {
  collapseCommentsFeature.reset();
  resetDomCache();
});

describe("collapse-comments", () => {
  it("wraps tall user and Copilot bodies, leaves short ones alone", () => {
    const { tallBody, shortBody, copilotBody } = buildPage();
    expect(collapseCommentsFeature.apply(SETTINGS)).toBe(true);

    expect(tallBody.closest(".gqol-comment-block")).not.toBeNull();
    expect(copilotBody.closest(".gqol-comment-block")).not.toBeNull();
    expect(tallBody.classList.contains("gqol-comment-collapsed")).toBe(true);

    expect(shortBody.closest(".gqol-comment-block")).toBeNull();
    expect(shortBody.getAttribute("data-gqol-comment-processed")).toBe("1");
  });

  it("never touches the PR description body", () => {
    const { descBody } = buildPage();
    collapseCommentsFeature.apply(SETTINGS);
    expect(descBody.closest(".gqol-comment-block")).toBeNull();
    expect(descBody.hasAttribute("data-gqol-comment-processed")).toBe(false);
  });

  it("skips minimized comments", () => {
    const { container, tallBody } = buildPage();
    const minimized = document.createElement("div");
    minimized.className = "js-timeline-item minimized-comment";
    const body = document.createElement("div");
    body.className = "markdown-body";
    Object.defineProperty(body, "scrollHeight", { value: 500 });
    minimized.appendChild(body);
    container.appendChild(minimized);
    resetDomCache();

    collapseCommentsFeature.apply(SETTINGS);
    expect(body.closest(".gqol-comment-block")).toBeNull();
    expect(tallBody.closest(".gqol-comment-block")).not.toBeNull();
  });

  it("reports no work once collapsed", () => {
    buildPage();
    collapseCommentsFeature.apply(SETTINGS);
    expect(collapseCommentsFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("reports work for an uncollapsed tall comment", () => {
    buildPage();
    expect(collapseCommentsFeature.needsWork(SETTINGS)).toBe(true);
  });

  it("expands through the toggle", () => {
    const { tallBody } = buildPage();
    collapseCommentsFeature.apply(SETTINGS);
    const toggle = tallBody
      .closest(".gqol-comment-block")
      .querySelector(".gqol-comment-toggle");

    toggle.click();
    expect(tallBody.getAttribute("data-gqol-comment-expanded")).toBe("true");
    expect(tallBody.classList.contains("gqol-comment-collapsed")).toBe(false);

    toggle.click();
    expect(tallBody.getAttribute("data-gqol-comment-expanded")).toBe("false");
  });

  it("reset unwraps every collapsed comment", () => {
    const { container, tallBody, copilotBody } = buildPage();
    collapseCommentsFeature.apply(SETTINGS);
    collapseCommentsFeature.reset();

    expect(document.querySelector(".gqol-comment-block")).toBeNull();
    expect(tallBody.classList.contains("gqol-comment-collapsed")).toBe(false);
    expect(tallBody.hasAttribute("data-gqol-comment-expanded")).toBe(false);
    expect(container.contains(tallBody)).toBe(true);
    expect(container.contains(copilotBody)).toBe(true);
  });

  it("undoes the collapse when disabled", () => {
    buildPage();
    collapseCommentsFeature.apply(SETTINGS);
    const result = collapseCommentsFeature.apply({ collapseLongComments: false });
    expect(result).toBe(false);
    expect(document.querySelector(".gqol-comment-block")).toBeNull();
  });
});
