import { describe, it, expect, beforeEach, afterEach } from "vitest";
import collapseFeature from "../src/js/content/features/collapse-description.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const SETTINGS = { collapsePrDescription: true };

/**
 * A PR description whose markdown body is tall enough to collapse.
 * jsdom reports scrollHeight 0, so height is injected directly — the
 * feature's cutoff is > 144px.
 */
function buildPage({ bodyHeight = 300, text = "A lengthy description" } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  const body = document.createElement("div");
  body.className = "markdown-body";
  body.textContent = text;
  Object.defineProperty(body, "scrollHeight", { value: bodyHeight });
  desc.appendChild(body);
  descGroup.appendChild(desc);

  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);

  const item = document.createElement("div");
  item.className = "js-timeline-item";
  container.append(descWrap, item);
  document.body.appendChild(container);
  resetDomCache();
  return { container, desc, body };
}

beforeEach(() => {
  buildPage();
});

afterEach(() => {
  collapseFeature.reset();
  resetDomCache();
});

describe("collapse-description", () => {
  it("wraps a tall body in a collapsed block with a toggle", () => {
    const { body } = buildPage();
    expect(collapseFeature.apply(SETTINGS)).toBe(true);

    const block = body.closest(".gqol-desc-block");
    expect(block).not.toBeNull();
    expect(body.classList.contains("gqol-desc-collapsed")).toBe(true);
    expect(block.querySelector(".gqol-desc-toggle")).not.toBeNull();
  });

  it("reports no work once collapsed", () => {
    buildPage();
    collapseFeature.apply(SETTINGS);
    expect(collapseFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("reports work for an uncollapsed tall body", () => {
    buildPage();
    expect(collapseFeature.needsWork(SETTINGS)).toBe(true);
  });

  it("does not collapse a short body", () => {
    buildPage({ bodyHeight: 100 });
    expect(collapseFeature.apply(SETTINGS)).toBe(false);
    expect(document.querySelector(".gqol-desc-block")).toBeNull();
  });

  it("reports no work for a short body", () => {
    buildPage({ bodyHeight: 100 });
    expect(collapseFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("expands and re-collapses through the toggle", () => {
    const { body } = buildPage();
    collapseFeature.apply(SETTINGS);
    const toggle = document.querySelector(".gqol-desc-toggle");

    toggle.click();
    expect(body.getAttribute("data-gqol-desc-expanded")).toBe("true");
    expect(body.classList.contains("gqol-desc-collapsed")).toBe(false);

    toggle.click();
    expect(body.getAttribute("data-gqol-desc-expanded")).toBe("false");
    expect(body.classList.contains("gqol-desc-collapsed")).toBe(true);
  });

  it("restores the plain body on reset", () => {
    const { container, body } = buildPage();
    collapseFeature.apply(SETTINGS);
    collapseFeature.reset();

    expect(document.querySelector(".gqol-desc-block")).toBeNull();
    expect(body.classList.contains("gqol-desc-collapsed")).toBe(false);
    expect(body.hasAttribute("data-gqol-desc-expanded")).toBe(false);
    expect(container.contains(body)).toBe(true);
  });

  it("undoes the collapse when disabled", () => {
    buildPage();
    collapseFeature.apply(SETTINGS);
    const result = collapseFeature.apply({ collapsePrDescription: false });
    expect(result).toBe(false);
    expect(document.querySelector(".gqol-desc-block")).toBeNull();
  });
});
