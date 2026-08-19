import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, STORAGE_KEY } from "../src/js/settings.js";

/**
 * The popup binds checkboxes generically via data-setting attributes: the
 * settings definition (key, default, popupControlled) in settings.js is
 * the single source of truth — adding a setting is one definition plus
 * one checkbox in popup.html, no popup.js edits.
 */

function buildPopupDom() {
  document.body.innerHTML = `
    <input data-setting="collapsePrDescription" type="checkbox" />
    <input data-setting="showMergeBoxBelowDescription" type="checkbox" />
    <input data-setting="commentBoxAtTop" type="checkbox" />
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
  it("loads stored settings into the matching checkboxes", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: {
        reverseTimeline: true,
        collapsePrDescription: false,
        showMergeBoxBelowDescription: true,
        commentBoxAtTop: false,
      },
    });
    await importPopup();
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-setting="collapsePrDescription"]').checked,
      ).toBe(false);
      expect(
        document.querySelector('[data-setting="showMergeBoxBelowDescription"]').checked,
      ).toBe(true);
      expect(
        document.querySelector('[data-setting="commentBoxAtTop"]').checked,
      ).toBe(false);
    });
  });

  it("defaults to checked when nothing is stored", async () => {
    await importPopup();
    await vi.waitFor(() => {
      for (const input of document.querySelectorAll("[data-setting]")) {
        expect(input.checked).toBe(true);
      }
    });
  });

  it("persists a flip under the setting's data-setting key", async () => {
    await importPopup();
    await vi.waitFor(async () => {
      expect(await getSettings()).toBeTruthy();
    });

    const input = document.querySelector('[data-setting="commentBoxAtTop"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.commentBoxAtTop).toBe(false);
      expect(settings.collapsePrDescription).toBe(true);
    });
  });
});
