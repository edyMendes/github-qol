export const STORAGE_KEY = "githubQolSettings";

export const DEFAULT_SETTINGS = {
  reverseTimeline: true,
  collapsePrDescription: true,
  showMergeBoxBelowDescription: true,
  commentBoxAtTop: true,
};

export function normalizeSettings(raw = {}) {
  const normalized = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    normalized[key] =
      raw[key] !== undefined ? Boolean(raw[key]) : DEFAULT_SETTINGS[key];
  }
  return normalized;
}

function readStoredSettings(area) {
  return chrome.storage[area].get(STORAGE_KEY).then((items) => {
    const stored = items[STORAGE_KEY];
    return stored && typeof stored === "object"
      ? normalizeSettings(stored)
      : { ...DEFAULT_SETTINGS };
  });
}

function writeSettings(area, settings) {
  return chrome.storage[area].set({ [STORAGE_KEY]: settings });
}

export function getSettings() {
  return readStoredSettings("sync").catch(() => readStoredSettings("local"));
}

export async function saveSettings(partial) {
  const next = normalizeSettings({ ...(await getSettings()), ...partial });
  try {
    await writeSettings("sync", next);
  } catch {
    await writeSettings("local", next);
  }
  return next;
}

export async function ensureDefaultSettings() {
  let stored = {};
  try {
    stored = await chrome.storage.sync.get(STORAGE_KEY);
  } catch {
    // Sync unavailable (e.g. disabled) — fall through and try to seed local.
  }
  if (stored[STORAGE_KEY] == null) {
    try {
      await writeSettings("sync", { ...DEFAULT_SETTINGS });
    } catch {
      await writeSettings("local", { ...DEFAULT_SETTINGS });
    }
  }
}
