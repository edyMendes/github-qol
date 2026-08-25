import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, STORAGE_KEY } from "../src/js/settings.js";

function buildPopupDom() {
  document.body.innerHTML = `
    <input data-setting="timelineOrder" data-on="newest" data-off="oldest" type="checkbox" />
    <input data-setting="collapsePrDescription" type="checkbox" />
    <button id="open-options"></button>
    <p id="popup-status"></p>
  `;
}

async function importPopup() {
  vi.resetModules();
  return import("../src/js/popup.js");
}

beforeEach(() => {
  globalThis.__resetChromeStorage();
  sessionStorage.clear();
  buildPopupDom();
});

describe("popup", () => {
  it("loads timelineOrder newest as a checked box", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { timelineOrder: "oldest" },
    });
    await importPopup();
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-setting="timelineOrder"]').checked,
      ).toBe(false);
    });
  });

  it("persists a direction flip", async () => {
    await importPopup();
    await vi.waitFor(async () => {
      expect(await getSettings()).toBeTruthy();
    });

    const input = document.querySelector('[data-setting="timelineOrder"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.timelineOrder).toBe("oldest");
      expect(settings.sectionOrder).toEqual([
        "description", "mergebox", "commentBox", "timeline",
      ]);
    });
  });

  it("opens the options page from the link", async () => {
    let opened = false;
    chrome.runtime.openOptionsPage = () => {
      opened = true;
      return Promise.resolve();
    };
    await importPopup();
    document.getElementById("open-options").click();
    expect(opened).toBe(true);
  });
});
