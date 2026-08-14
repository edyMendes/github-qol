import { DEFAULT_SETTINGS, getSettings } from "../settings.js";

/**
 * Per-page settings cache. Invalidated when the sort button saves a new
 * value or when chrome.storage.onChanged fires.
 */

let cachedSettings = null;

export async function getCachedSettings() {
  if (!cachedSettings) {
    try {
      cachedSettings = await getSettings();
    } catch (error) {
      console.warn("GitHub QoL: could not read settings, using defaults.", error);
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  }
  return cachedSettings;
}

export function invalidateCachedSettings() {
  cachedSettings = null;
}
