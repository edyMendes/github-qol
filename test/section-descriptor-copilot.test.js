import { describe, it, expect, beforeEach, afterEach } from "vitest";
import copilotDescriptor from "../src/js/content/features/sections/copilot.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

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

  let banner = null;
  let bannerUnit = null;
  if (withBanner) {
    bannerUnit = document.createElement("div");
    bannerUnit.className = "copilot-banner-unit";
    banner = document.createElement("div");
    banner.setAttribute("data-testid", "copilot-pull-request-summaries");
    banner.textContent = "Copilot summary";
    bannerUnit.appendChild(banner);
    container.appendChild(bannerUnit);
  }

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  container.append(item1, item2);

  document.body.appendChild(container);
  resetDomCache();
  return { container, banner, bannerUnit, item1, item2 };
}

beforeEach(() => buildPage());

afterEach(() => {
  copilotDescriptor.cleanup();
  resetDomCache();
});

describe("copilot descriptor", () => {
  it("resolves null when the banner is absent", () => {
    expect(copilotDescriptor.resolve(buildPage({ withBanner: false }).container)).toBeNull();
  });

  it("resolves the banner's top-level flow unit", () => {
    const { container, bannerUnit } = buildPage();
    expect(copilotDescriptor.resolve(container)).toBe(bannerUnit);
  });

  it("place before: moves above the ref and marks the unit", () => {
    const { container, bannerUnit, item1 } = buildPage();
    const placed = copilotDescriptor.place(bannerUnit, container, "before", item1);
    expect(placed).toBe(bannerUnit);
    expect(item1.previousSibling).toBe(bannerUnit);
    expect(bannerUnit.getAttribute("data-gqol-copilot-moved")).toBe("1");
  });

  it("place after: moves directly after the ref", () => {
    const { container, bannerUnit, item2 } = buildPage();
    copilotDescriptor.place(bannerUnit, container, "after", item2);
    expect(bannerUnit.previousSibling).toBe(item2);
  });

  it("isPlaced requires the moved marker and adjacency", () => {
    const { container, bannerUnit, item1 } = buildPage();
    expect(copilotDescriptor.isPlaced(bannerUnit, container, "before", item1)).toBe(false);
    copilotDescriptor.place(bannerUnit, container, "before", item1);
    expect(copilotDescriptor.isPlaced(bannerUnit, container, "before", item1)).toBe(true);
  });

  it("cleanup restores the native position", () => {
    const { container, bannerUnit, item1 } = buildPage();
    copilotDescriptor.place(bannerUnit, container, "before", item1);
    copilotDescriptor.cleanup();
    expect(bannerUnit.hasAttribute("data-gqol-copilot-moved")).toBe(false);
    expect(bannerUnit.nextSibling).toBe(item1);
  });

  it("declares no recovery", () => {
    expect(copilotDescriptor.recovery).toBeUndefined();
  });
});
