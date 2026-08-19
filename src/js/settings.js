export const STORAGE_KEY = "githubQolSettings";

/**
 * The single source of truth for every setting: key, default, and
 * whether the popup renders a control for it (reverseTimeline is
 * toggled by the in-page sort button instead). DEFAULT_SETTINGS and
 * the popup's checkboxes both derive from this list.
 */
export const SETTING_DEFINITIONS = [
  { key: "reverseTimeline", default: true, popupControlled: false },
  { key: "collapsePrDescription", default: true, popupControlled: true },
  { key: "showMergeBoxBelowDescription", default: true, popupControlled: true },
  { key: "commentBoxAtTop", default: true, popupControlled: true },
];

export const DEFAULT_SETTINGS = Object.fromEntries(
  SETTING_DEFINITIONS.map(({ key, default: defaultValue }) => [
    key,
    defaultValue,
  ]),
);

export function normalizeSettings(raw = {}) {
  const normalized = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    normalized[key] =
      raw[key] !== undefined ? Boolean(raw[key]) : DEFAULT_SETTINGS[key];
  }
  return normalized;
}

/** Read and normalize the stored settings; null when nothing usable. */
function readStoredSettings(area) {
  return chrome.storage[area].get(STORAGE_KEY).then((items) => {
    const stored = items[STORAGE_KEY];
    return stored && typeof stored === "object"
      ? normalizeSettings(stored)
      : null;
  });
}

function writeSettings(area, settings) {
  return chrome.storage[area].set({ [STORAGE_KEY]: settings });
}

/** Sync first, local as fallback (sync can be unavailable/disabled). */
export async function getSettings() {
  for (const area of ["sync", "local"]) {
    try {
      const settings = await readStoredSettings(area);
      if (settings) return settings;
    } catch {
      // Area unavailable — try the next.
    }
  }
  return { ...DEFAULT_SETTINGS };
}

/** Write to `area`, falling back to the other one on failure. */
async function writeWithFallback(preferred, settings) {
  const fallback = preferred === "sync" ? "local" : "sync";
  try {
    await writeSettings(preferred, settings);
  } catch {
    await writeSettings(fallback, settings);
  }
}

export async function saveSettings(partial) {
  const next = normalizeSettings({ ...(await getSettings()), ...partial });
  await writeWithFallback("sync", next);
  return next;
}

export async function ensureDefaultSettings() {
  for (const area of ["sync", "local"]) {
    try {
      if (!(await readStoredSettings(area))) {
        await writeSettings(area, { ...DEFAULT_SETTINGS });
      }
      return;
    } catch {
      // Area unavailable — try the next.
    }
  }
}
