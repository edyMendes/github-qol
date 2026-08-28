import { describe, it, expect, beforeEach, afterEach } from "vitest";
import hideCopilotFeature from "../src/js/content/features/hide-copilot.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const HIDE = { hideCopilotBanner: true };
const SHOW = { hideCopilotBanner: false };

/**
 * Mirrors the PR conversation layout: description, the @copilot text
 * callout (no stable selector — text only), then timeline items.
 */
function buildPage({ withBanner = true } = {}) {
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

  let bannerUnit = null;
  if (withBanner) {
    bannerUnit = document.createElement("div");
    const callout = document.createElement("div");
    callout.className = "flash";
    callout.textContent = "Mention @copilot in a comment to make changes to this pull request.";
    bannerUnit.appendChild(callout);
    container.appendChild(bannerUnit);
  }

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  container.appendChild(item1);

  document.body.appendChild(container);
  resetDomCache();
  return { container, bannerUnit };
}

beforeEach(() => buildPage());

afterEach(() => {
  hideCopilotFeature.reset();
  resetDomCache();
});

describe("hide-copilot", () => {
  it("hides the banner by marker when enabled", () => {
    const { bannerUnit } = buildPage();
    expect(hideCopilotFeature.apply(HIDE)).toBe(true);
    expect(bannerUnit.getAttribute("data-gqol-copilot-hidden")).toBe("1");
  });

  it("reports no work once hidden", () => {
    buildPage();
    hideCopilotFeature.apply(HIDE);
    expect(hideCopilotFeature.needsWork(HIDE)).toBe(false);
  });

  it("reports work when enabled and the banner is visible", () => {
    buildPage();
    expect(hideCopilotFeature.needsWork(HIDE)).toBe(true);
  });

  it("unhides when disabled", () => {
    const { bannerUnit } = buildPage();
    hideCopilotFeature.apply(HIDE);
    expect(hideCopilotFeature.apply(SHOW)).toBe(true);
    expect(bannerUnit.hasAttribute("data-gqol-copilot-hidden")).toBe(false);
    expect(hideCopilotFeature.needsWork(SHOW)).toBe(false);
  });

  it("no-ops when the banner is absent", () => {
    buildPage({ withBanner: false });
    expect(hideCopilotFeature.apply(HIDE)).toBe(false);
    expect(hideCopilotFeature.needsWork(HIDE)).toBe(false);
  });

  it("never hides anything when the timeline container cannot be found", () => {
    // Selector drift regression: with no container, a stray text match
    // must not climb to a body-level wrapper and hide it.
    buildPage();
    document.body.classList.add("js-discussion");
    document.querySelector(".js-discussion").classList.remove("js-discussion");
    resetDomCache();
    document.querySelector(".js-timeline-item")?.remove();
    document.querySelector(".js-timeline-item")?.remove();
    resetDomCache();
    expect(hideCopilotFeature.apply(HIDE)).toBe(false);
    expect(
      document.querySelector("[data-gqol-copilot-hidden='1']"),
    ).toBe(null);
  });

  it("reset unhides everything", () => {
    const { bannerUnit } = buildPage();
    hideCopilotFeature.apply(HIDE);
    hideCopilotFeature.reset();
    expect(bannerUnit.hasAttribute("data-gqol-copilot-hidden")).toBe(false);
  });
});
