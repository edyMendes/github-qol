import { DEFAULT_SETTINGS, getSettings } from "../settings.js";

/**
 * Per-page settings cache. Invalidated when chrome.storage.onChanged fires.
 */

let cachedSettings = null;

export function getCachedSettings() {
  // Cache the promise itself: concurrent callers (initial retries, global
  // observer, status interval) share one storage read.
  cachedSettings ??= getSettings().catch((error) => {
    console.warn("GitHub QoL: could not read settings, using defaults.", error);
    return { ...DEFAULT_SETTINGS };
  });
  return cachedSettings;
}

export function invalidateCachedSettings() {
  cachedSettings = null;
}
