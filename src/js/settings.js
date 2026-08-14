export const STORAGE_KEY = "githubQolSettings";

export const DEFAULT_SETTINGS = {
  reverseTimeline: true,
  collapsePrDescription: true,
  showMergeBoxBelowDescription: true,
  commentBoxAtTop: true,
};

export function normalizeSettings(raw = {}) {
  return {
    reverseTimeline:
      raw.reverseTimeline !== undefined
        ? Boolean(raw.reverseTimeline)
        : DEFAULT_SETTINGS.reverseTimeline,
    collapsePrDescription:
      raw.collapsePrDescription !== undefined
        ? Boolean(raw.collapsePrDescription)
        : DEFAULT_SETTINGS.collapsePrDescription,
    showMergeBoxBelowDescription:
      raw.showMergeBoxBelowDescription !== undefined
        ? Boolean(raw.showMergeBoxBelowDescription)
        : DEFAULT_SETTINGS.showMergeBoxBelowDescription,
    commentBoxAtTop:
      raw.commentBoxAtTop !== undefined
        ? Boolean(raw.commentBoxAtTop)
        : DEFAULT_SETTINGS.commentBoxAtTop,
  };
}

function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(items);
      }
    });
  });
}

function storageSet(area, items) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function getSettings() {
  try {
    const stored = (await storageGet("sync", STORAGE_KEY))[STORAGE_KEY];
    return stored && typeof stored === "object"
      ? normalizeSettings(stored)
      : { ...DEFAULT_SETTINGS };
  } catch {
    const stored = (await storageGet("local", STORAGE_KEY))[STORAGE_KEY];
    return stored && typeof stored === "object"
      ? normalizeSettings(stored)
      : { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial) {
  const next = normalizeSettings({ ...(await getSettings()), ...partial });
  const payload = { [STORAGE_KEY]: next };
  try {
    await storageSet("sync", payload);
  } catch {
    await storageSet("local", payload);
  }
  return next;
}

export async function ensureDefaultSettings() {
  const stored = await storageGet("sync", STORAGE_KEY).catch(() => ({}));
  if (stored[STORAGE_KEY] == null) {
    await storageSet("sync", { [STORAGE_KEY]: { ...DEFAULT_SETTINGS } }).catch(
      async () => {
        await storageSet("local", { [STORAGE_KEY]: { ...DEFAULT_SETTINGS } });
      },
    );
  }
}
