/**
 * Shared plumbing for the popup and options pages: a transient status
 * line and a table-driven save path for [data-setting] inputs. The
 * pages stay thin — control discovery and section-list specifics stay
 * in their own modules.
 */

import { saveSettings } from "./settings.js";

const STATUS_CLEAR_MS = 1500;

/**
 * A showStatus(message) function writing to `statusEl`, auto-clearing
 * the line after a moment.
 */
export function createStatusFlash(statusEl) {
  let timeout = null;
  return (message) => {
    statusEl.textContent = message;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      statusEl.textContent = "";
    }, STATUS_CLEAR_MS);
  };
}

/** Save a partial settings update, reporting the outcome via status. */
export async function saveSetting(partial, showStatus) {
  try {
    await saveSettings(partial);
    showStatus("Saved");
  } catch (error) {
    console.error("GitHub QoL settings:", error);
    showStatus("Could not save");
  }
}

/**
 * Bind an input marked data-setting="key" so changing it persists its
 * checked state. (Every settings input rendered today is a checkbox.)
 */
export function bindSettingCheckbox(input, showStatus) {
  input.addEventListener("change", () =>
    saveSetting({ [input.dataset.setting]: input.checked }, showStatus),
  );
}
