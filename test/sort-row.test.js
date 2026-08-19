import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sortRowFeature from "../src/js/content/features/sort-row.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";
import { STORAGE_KEY } from "../src/js/settings.js";

const SETTINGS = { reverseTimeline: true };

/**
 * Mirrors the PR conversation layout: description block, then timeline
 * items, all children of one flow container (becomes the sort-row host).
 */
function buildPage() {
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

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";

  container.append(descWrap, item1, item2);
  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, item1, item2 };
}

beforeEach(() => {
  globalThis.__resetChromeStorage();
  buildPage();
});

afterEach(() => {
  sortRowFeature.reset();
  resetDomCache();
});

describe("sort-row", () => {
  it("places the sort row directly above the first timeline item", () => {
    const { item1 } = buildPage();
    expect(sortRowFeature.apply(SETTINGS)).toBe(true);

    const row = document.querySelector(".gqol-sort-row");
    expect(row).not.toBeNull();
    expect(row.nextElementSibling).toBe(item1);
  });

  it("reports no work after a matching apply", () => {
    buildPage();
    sortRowFeature.apply(SETTINGS);
    expect(sortRowFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("returns false when a second apply changes nothing", () => {
    buildPage();
    sortRowFeature.apply(SETTINGS);
    expect(sortRowFeature.apply(SETTINGS)).toBe(false);
  });

  it("reports work when the button direction disagrees with settings", () => {
    buildPage();
    sortRowFeature.apply(SETTINGS);
    // Simulate an out-of-band flip (e.g. storage synced from another tab).
    const button = document.getElementById("gqol-sort-button");
    button.setAttribute("aria-pressed", "false");
    expect(sortRowFeature.needsWork(SETTINGS)).toBe(true);
  });

  it("reports work while unplaced", () => {
    buildPage();
    expect(sortRowFeature.needsWork(SETTINGS)).toBe(true);
  });

  it("anchors above the moved comment box when present", () => {
    const { container, item1 } = buildPage();
    const box = document.createElement("div");
    box.setAttribute("data-gqol-comment-box-moved", "1");
    container.insertBefore(box, item1);

    sortRowFeature.apply(SETTINGS);
    const row = document.querySelector(".gqol-sort-row");
    expect(row.nextElementSibling).toBe(box);
  });

  it("flips the stored sort order on click", async () => {
    buildPage();
    sortRowFeature.apply(SETTINGS);

    document.getElementById("gqol-sort-button").click();
    await vi.waitFor(async () => {
      const items = await chrome.storage.sync.get(STORAGE_KEY);
      expect(items[STORAGE_KEY]?.reverseTimeline).toBe(false);
    });
  });
});
