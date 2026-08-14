/**
 * GitHub QoL — content script entry for GitHub PR conversation pages.
 *
 * Features:
 * - Reverse PR timeline (newest first)
 * - Collapse long PR descriptions
 * - Merge status box below the PR description
 * - Comment box at the top of the timeline
 *
 * The wiring lives in ./content/: feature modules in ./content/features/,
 * shared DOM access in ./content/dom-cache.js, lifecycle in
 * ./content/orchestrator.js. esbuild inlines everything into one IIFE.
 */

import { STORAGE_KEY } from "./settings.js";
import { init, onNavigation } from "./content/orchestrator.js";
import { invalidateCachedSettings } from "./content/settings-cache.js";
import { resetDomCache } from "./content/dom-cache.js";
import { requestRevalidate } from "./content/bus.js";

init();

// GitHub's React PR pages navigate client-side without turbo/pjax events,
// so listen to every signal we know about…
document.addEventListener("turbo:load", onNavigation);
document.addEventListener("turbo:render", onNavigation);
document.addEventListener("pjax:end", onNavigation);
document.addEventListener("soft-nav:end", onNavigation);
window.addEventListener("popstate", onNavigation);

// …and poll as a catch-all for router navigations that fire no event at
// all. onNavigation itself no-ops when the page key has not changed.
setInterval(onNavigation, 1000);

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area !== "sync" && area !== "local") || !changes[STORAGE_KEY]) return;
  invalidateCachedSettings();
  resetDomCache();
  requestRevalidate();
});
