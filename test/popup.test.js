import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, STORAGE_KEY } from "../src/js/settings.js";

function buildPopupDom() {
  document.body.innerHTML = `
    <input id="gqol-master-toggle" data-setting="enabled" type="checkbox" />
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
  it("loads the master toggle state from storage", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { enabled: false },
    });
    await importPopup();
    await vi.waitFor(() => {
      expect(
        document.getElementById("gqol-master-toggle").checked,
      ).toBe(false);
    });
  });

  it("persists turning the extension off", async () => {
    await importPopup();
    await vi.waitFor(async () => {
      expect(await getSettings()).toBeTruthy();
    });

    const toggle = document.getElementById("gqol-master-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.enabled).toBe(false);
    });
  });

  it("loads the collapse state", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { collapsePrDescription: false },
    });
    await importPopup();
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-setting="collapsePrDescription"]').checked,
      ).toBe(false);
    });
  });

  it("persists a collapse flip without touching direction", async () => {
    await importPopup();
    await vi.waitFor(async () => {
      expect(await getSettings()).toBeTruthy();
    });

    const input = document.querySelector('[data-setting="collapsePrDescription"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.collapsePrDescription).toBe(false);
      expect(settings.timelineOrder).toBe("newest");
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
