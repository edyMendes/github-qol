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
    expect(popupKeys.map((d) => d.key)).toEqual(["enabled", "collapsePrDescription"]);
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

  it("keeps explicit values", () => {
    expect(
      normalizeSettings({
        timelineOrder: "oldest",
        collapsePrDescription: false,
        sectionOrder: ["timeline", "description", "commentBox", "mergebox"],
      }),
    ).toEqual({
      enabled: true,
      timelineOrder: "oldest",
      collapsePrDescription: false,
      collapseLongComments: true,
      hideCopilotBanner: false,
      sectionOrder: ["timeline", "description", "commentBox", "mergebox"],
    });
  });

  it("falls back per-key when a value is undefined", () => {
    expect(normalizeSettings({ timelineOrder: "oldest" })).toEqual({
      ...DEFAULT_SETTINGS,
      timelineOrder: "oldest",
    });
  });

  it("coerces boolean values", () => {
    expect(normalizeSettings({ collapsePrDescription: 0 })).toEqual({
      ...DEFAULT_SETTINGS,
      collapsePrDescription: false,
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
    const order = ["timeline", "description", "commentBox", "mergebox"];
    expect(normalizeSettings({ sectionOrder: order }).sectionOrder).toEqual(order);
  });

  it("drops unknown ids, dedupes, backfills (description on top)", () => {
    expect(
      normalizeSettings({ sectionOrder: ["bogus", "timeline", "timeline", "mergebox"] })
        .sectionOrder,
    ).toEqual(["description", "timeline", "mergebox", "commentBox"]);
  });

  it("falls back to the default order for non-array input", () => {
    expect(normalizeSettings({ sectionOrder: "nope" }).sectionOrder).toEqual([
      "description", "mergebox", "commentBox", "timeline",
    ]);
  });

  it("migrates showMergeBoxBelowDescription=false by demoting mergebox", () => {
    expect(normalizeSettings({ showMergeBoxBelowDescription: false }).sectionOrder).toEqual([
      "description", "commentBox", "timeline", "mergebox",
    ]);
  });

  it("migrates commentBoxAtTop=false by demoting commentBox", () => {
    expect(normalizeSettings({ commentBoxAtTop: false }).sectionOrder).toEqual([
      "description", "mergebox", "timeline", "commentBox",
    ]);
  });

  it("migrates reverseTimeline=false by demoting commentBox", () => {
    expect(normalizeSettings({ reverseTimeline: false }).sectionOrder).toEqual([
      "description", "mergebox", "timeline", "commentBox",
    ]);
  });

  it("migrates v0 orders: drops copilot, inserts description at the top", () => {
    expect(
      normalizeSettings({
        sectionOrder: ["timeline", "mergebox", "commentBox", "copilot"],
      }).sectionOrder,
    ).toEqual(["description", "timeline", "mergebox", "commentBox"]);
  });
});

describe("normalizeSettings: legacy contraction", () => {
  it("drops legacy booleans from the output", () => {
    const s = normalizeSettings({ reverseTimeline: false, commentBoxAtTop: false });
    expect(Object.keys(s).sort()).toEqual(
      [
        "collapseLongComments",
        "collapsePrDescription",
        "enabled",
        "hideCopilotBanner",
        "sectionOrder",
        "timelineOrder",
      ].sort(),
    );
    expect(s.timelineOrder).toBe("oldest");
    expect(s.sectionOrder).toEqual(["description", "mergebox", "timeline", "commentBox"]);
    expect(s.hideCopilotBanner).toBe(false);
  });
});

describe("getSettings", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns normalized settings from sync storage", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, { timelineOrder: "oldest" });
    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      timelineOrder: "oldest",
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
      timelineOrder: "oldest",
    });
    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      timelineOrder: "oldest",
    });
  });

  it("ignores non-object stored values", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, "garbage");
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  it("merges a partial over existing settings and writes to sync", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, { timelineOrder: "oldest" });
    const saved = await saveSettings({ collapsePrDescription: false });
    expect(saved).toEqual({ ...DEFAULT_SETTINGS, timelineOrder: "oldest", collapsePrDescription: false });
    expect(chrome.storage.sync.__store.get(STORAGE_KEY)).toEqual(saved);
  });

  it("falls back to local storage when sync write fails", async () => {
    chrome.storage.sync.__failSet = true;
    const saved = await saveSettings({ timelineOrder: "oldest" });

    expect(saved.timelineOrder).toBe("oldest");
    expect(chrome.storage.local.__store.get(STORAGE_KEY)).toEqual(saved);
  });
});

describe("ensureDefaultSettings", () => {
  it("seeds defaults when nothing is stored", async () => {
    await ensureDefaultSettings();
    expect(chrome.storage.sync.__store.get(STORAGE_KEY)).toEqual(DEFAULT_SETTINGS);
  });

  it("does not overwrite existing settings", async () => {
    const existing = { timelineOrder: "oldest" };
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
