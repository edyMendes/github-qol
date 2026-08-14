import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  normalizeSettings,
  getSettings,
  saveSettings,
  ensureDefaultSettings,
} from "../src/js/settings.js";

beforeEach(() => {
  globalThis.__resetChromeStorage();
});

describe("normalizeSettings", () => {
  it("returns defaults for empty input", () => {
    expect(normalizeSettings()).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps explicit booleans", () => {
    expect(
      normalizeSettings({
        reverseTimeline: false,
        collapsePrDescription: false,
        showMergeBoxBelowDescription: false,
        commentBoxAtTop: false,
      }),
    ).toEqual({
      reverseTimeline: false,
      collapsePrDescription: false,
      showMergeBoxBelowDescription: false,
      commentBoxAtTop: false,
    });
  });

  it("falls back per-key when a value is undefined", () => {
    expect(normalizeSettings({ reverseTimeline: false })).toEqual({
      ...DEFAULT_SETTINGS,
      reverseTimeline: false,
    });
  });

  it("coerces values with Boolean()", () => {
    expect(normalizeSettings({ reverseTimeline: 0 })).toEqual({
      ...DEFAULT_SETTINGS,
      reverseTimeline: false,
    });
  });
});

describe("getSettings", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns normalized settings from sync storage", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, {
      reverseTimeline: false,
      commentBoxAtTop: false,
    });
    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      reverseTimeline: false,
      commentBoxAtTop: false,
    });
  });

  it("falls back to local storage when sync fails", async () => {
    chrome.storage.sync.__failGet = true;
    chrome.storage.local.__store.set(STORAGE_KEY, {
      collapsePrDescription: false,
    });
    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      collapsePrDescription: false,
    });
  });

  it("ignores non-object stored values", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, "garbage");
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  it("merges a partial over existing settings and writes to sync", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, { reverseTimeline: true });
    const saved = await saveSettings({ commentBoxAtTop: false });

    expect(saved).toEqual({ ...DEFAULT_SETTINGS, commentBoxAtTop: false });
    expect(chrome.storage.sync.__store.get(STORAGE_KEY)).toEqual(saved);
    expect(chrome.storage.local.__store.has(STORAGE_KEY)).toBe(false);
  });

  it("falls back to local storage when sync write fails", async () => {
    chrome.storage.sync.__failSet = true;
    const saved = await saveSettings({ reverseTimeline: false });

    expect(saved.reverseTimeline).toBe(false);
    expect(chrome.storage.local.__store.get(STORAGE_KEY)).toEqual(saved);
  });
});

describe("ensureDefaultSettings", () => {
  it("seeds defaults when nothing is stored", async () => {
    await ensureDefaultSettings();
    expect(chrome.storage.sync.__store.get(STORAGE_KEY)).toEqual(DEFAULT_SETTINGS);
  });

  it("does not overwrite existing settings", async () => {
    const existing = { reverseTimeline: false };
    chrome.storage.sync.__store.set(STORAGE_KEY, existing);
    await ensureDefaultSettings();
    expect(chrome.storage.sync.__store.get(STORAGE_KEY)).toEqual(existing);
  });

  it("falls back to local when sync is unavailable", async () => {
    chrome.storage.sync.__failGet = true;
    chrome.storage.sync.__failSet = true;
    await ensureDefaultSettings();
    expect(chrome.storage.local.__store.get(STORAGE_KEY)).toEqual(DEFAULT_SETTINGS);
  });
});
