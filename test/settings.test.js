import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEY,
  SETTING_DEFINITIONS,
  DEFAULT_SETTINGS,
  SECTION_IDS,
  TIMELINE_ORDERS,
  normalizeSettings,
  getSettings,
  saveSettings,
  ensureDefaultSettings,
} from "../src/js/settings.js";

beforeEach(() => {
  globalThis.__resetChromeStorage();
});

describe("SETTING_DEFINITIONS", () => {
  it("is the single source DEFAULT_SETTINGS is derived from", () => {
    expect(DEFAULT_SETTINGS).toEqual(
      Object.fromEntries(
        SETTING_DEFINITIONS.map((definition) => [
          definition.key,
          definition.default,
        ]),
      ),
    );
  });

  it("covers every default key exactly once", () => {
    const keys = SETTING_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it("keeps the popupControlled marking in sync with definitions", () => {
    const popupKeys = SETTING_DEFINITIONS.filter((d) => d.popupControlled);
    expect(popupKeys.map((d) => d.key)).toEqual([
      "collapsePrDescription",
      "showMergeBoxBelowDescription",
      "commentBoxAtTop",
    ]);
  });

  it("declares enum and sectionOrder values", () => {
    const timelineOrder = SETTING_DEFINITIONS.find((d) => d.key === "timelineOrder");
    expect(timelineOrder.type).toBe("enum");
    expect(timelineOrder.values).toEqual(["newest", "oldest"]);
    const sectionOrder = SETTING_DEFINITIONS.find((d) => d.key === "sectionOrder");
    expect(sectionOrder.type).toBe("sectionOrder");
    expect(sectionOrder.values).toEqual(SECTION_IDS);
  });
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
      timelineOrder: "oldest",
      sectionOrder: ["copilot", "timeline", "mergebox", "commentBox"],
    });
  });

  it("falls back per-key when a value is undefined", () => {
    expect(normalizeSettings({ reverseTimeline: false })).toEqual({
      ...DEFAULT_SETTINGS,
      reverseTimeline: false,
      timelineOrder: "oldest",
      sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"],
      commentBoxAtTop: false,
    });
  });

  it("coerces values with Boolean()", () => {
    expect(normalizeSettings({ reverseTimeline: 0 })).toEqual({
      ...DEFAULT_SETTINGS,
      reverseTimeline: false,
      timelineOrder: "oldest",
    });
  });
});

describe("normalizeSettings: timelineOrder", () => {
  it("keeps a valid enum value", () => {
    expect(normalizeSettings({ timelineOrder: "oldest" }).timelineOrder).toBe("oldest");
  });

  it("falls back to newest for an invalid value", () => {
    expect(normalizeSettings({ timelineOrder: "sideways" }).timelineOrder).toBe("newest");
  });

  it("migrates legacy reverseTimeline=false to oldest", () => {
    expect(normalizeSettings({ reverseTimeline: false }).timelineOrder).toBe("oldest");
    expect(normalizeSettings({ reverseTimeline: true }).timelineOrder).toBe("newest");
  });
});

describe("normalizeSettings: sectionOrder", () => {
  it("keeps a valid full ordering", () => {
    const order = ["timeline", "copilot", "commentBox", "mergebox"];
    expect(normalizeSettings({ sectionOrder: order }).sectionOrder).toEqual(order);
  });

  it("drops unknown ids, dedupes, and appends missing ids", () => {
    expect(
      normalizeSettings({ sectionOrder: ["bogus", "timeline", "timeline", "copilot"] })
        .sectionOrder,
    ).toEqual(["timeline", "copilot", "mergebox", "commentBox"]);
  });

  it("falls back to the default order for non-array input", () => {
    expect(normalizeSettings({ sectionOrder: "nope" }).sectionOrder).toEqual([
      "copilot", "mergebox", "commentBox", "timeline",
    ]);
  });

  it("migrates showMergeBoxBelowDescription=false by demoting mergebox", () => {
    expect(normalizeSettings({ showMergeBoxBelowDescription: false }).sectionOrder).toEqual([
      "copilot", "commentBox", "timeline", "mergebox",
    ]);
  });

  it("migrates commentBoxAtTop=false by demoting commentBox", () => {
    expect(normalizeSettings({ commentBoxAtTop: false }).sectionOrder).toEqual([
      "copilot", "mergebox", "timeline", "commentBox",
    ]);
  });

  it("migrates reverseTimeline=false by demoting commentBox", () => {
    expect(normalizeSettings({ reverseTimeline: false }).sectionOrder).toEqual([
      "copilot", "mergebox", "timeline", "commentBox",
    ]);
  });
});

describe("normalizeSettings: legacy mirrors (expand phase)", () => {
  it("derives legacy booleans from new keys", () => {
    const s = normalizeSettings({ timelineOrder: "oldest", sectionOrder: ["copilot", "timeline", "mergebox", "commentBox"] });
    expect(s.reverseTimeline).toBe(false);
    expect(s.showMergeBoxBelowDescription).toBe(false);
    expect(s.commentBoxAtTop).toBe(false);
  });

  it("derives new keys from legacy booleans", () => {
    const s = normalizeSettings({ reverseTimeline: true, showMergeBoxBelowDescription: false, commentBoxAtTop: true });
    expect(s.timelineOrder).toBe("newest");
    expect(s.sectionOrder).toEqual(["copilot", "commentBox", "timeline", "mergebox"]);
    expect(s.showMergeBoxBelowDescription).toBe(false);
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
      timelineOrder: "oldest",
      sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"],
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

  it("falls back to local data when sync is readable but empty", async () => {
    // Sync was unavailable when defaults were seeded to local.
    chrome.storage.local.__store.set(STORAGE_KEY, {
      reverseTimeline: false,
    });
    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      reverseTimeline: false,
      timelineOrder: "oldest",
      sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"],
      commentBoxAtTop: false,
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
