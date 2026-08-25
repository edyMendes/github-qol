import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, STORAGE_KEY } from "../src/js/settings.js";

const SECTION_ROW_SELECTOR = "[data-section-id]";

function buildOptionsDom() {
  document.body.innerHTML = `
    <ul id="section-list"></ul>
    <fieldset id="direction">
      <button data-direction="newest">Newest first</button>
      <button data-direction="oldest">Oldest first</button>
    </fieldset>
    <input data-setting="collapsePrDescription" type="checkbox" />
    <p id="options-status"></p>
  `;
}

async function importOptions() {
  vi.resetModules();
  return import("../src/js/options.js");
}

beforeEach(() => {
  globalThis.__resetChromeStorage();
  sessionStorage.clear();
  buildOptionsDom();
});

describe("options page", () => {
  it("renders one row per section in stored order", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: {
        sectionOrder: ["timeline", "copilot", "mergebox", "commentBox"],
      },
    });
    await importOptions();
    await vi.waitFor(() => {
      const ids = [...document.querySelectorAll(SECTION_ROW_SELECTOR)].map(
        (row) => row.dataset.sectionId,
      );
      expect(ids).toEqual(["timeline", "copilot", "mergebox", "commentBox"]);
    });
  });

  it("moves a section up and persists the new order", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(
        document.querySelectorAll(SECTION_ROW_SELECTOR).length,
      ).toBe(4);
    });

    const mergeboxRow = document.querySelector('[data-section-id="mergebox"]');
    mergeboxRow.querySelector("[data-move='up']").click();

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.sectionOrder).toEqual([
        "mergebox",
        "copilot",
        "commentBox",
        "timeline",
      ]);
    });
  });

  it("moves a section down and persists the new order", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(document.querySelectorAll(SECTION_ROW_SELECTOR).length).toBe(4);
    });

    const copilotRow = document.querySelector('[data-section-id="copilot"]');
    copilotRow.querySelector("[data-move='down']").click();

    await vi.waitFor(async () => {
      const settings = await getSettings();
      // Default [copilot, mergebox, commentBox, timeline]; copilot (index 0)
      // moved down one → [mergebox, copilot, commentBox, timeline].
      expect(settings.sectionOrder).toEqual([
        "mergebox",
        "copilot",
        "commentBox",
        "timeline",
      ]);
    });
  });

  it("persists the direction choice", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(document.querySelectorAll(SECTION_ROW_SELECTOR).length).toBe(4);
    });

    document.querySelector("[data-direction='oldest']").click();

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.timelineOrder).toBe("oldest");
    });
  });

  it("persists the collapse toggle", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(document.querySelectorAll(SECTION_ROW_SELECTOR).length).toBe(4);
    });

    const input = document.querySelector('[data-setting="collapsePrDescription"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.collapsePrDescription).toBe(false);
    });
  });
});
