import { ensureDefaultSettings } from "./settings.js";

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.warn("GitHub QoL: failed to initialize storage.", error);
  });
});
