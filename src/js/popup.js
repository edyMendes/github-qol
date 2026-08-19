import {
  getSettings,
  saveSettings,
  SETTING_DEFINITIONS,
} from "./settings.js";

const statusEl = document.getElementById("popup-status");

let statusTimeout = null;

function showStatus(message) {
  statusEl.textContent = message;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

// One checkbox per popup-controlled definition, bound generically through
// its data-setting attribute — adding a setting is a definition entry
// plus one checkbox in popup.html, never a change here.
const settingInputs = new Map(
  SETTING_DEFINITIONS.filter((definition) => definition.popupControlled).map(
    (definition) => [
      definition.key,
      document.querySelector(`[data-setting="${definition.key}"]`),
    ],
  ),
);

for (const [key, input] of settingInputs) {
  if (!input) {
    console.warn(`GitHub QoL popup: no control for setting "${key}".`);
    continue;
  }
  input.addEventListener("change", async () => {
    try {
      await saveSettings({ [key]: input.checked });
      showStatus("Saved");
    } catch (error) {
      console.error("GitHub QoL popup:", error);
      showStatus("Could not save");
    }
  });
}

(async () => {
  const settings = await getSettings();
  for (const [key, input] of settingInputs) {
    if (input) input.checked = Boolean(settings[key]);
  }
})().catch((error) => {
  console.error("GitHub QoL popup:", error);
  showStatus("Could not load settings");
});
