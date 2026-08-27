import { getSettings, SETTING_DEFINITIONS } from "./settings.js";
import { bindSettingCheckbox, createStatusFlash } from "./settings-ui.js";

const statusEl = document.getElementById("popup-status");
const showStatus = createStatusFlash(statusEl);

// The popup renders a control for every popupControlled setting; the
// options page owns the rest.
const settingInputs = SETTING_DEFINITIONS.filter(
  (definition) => definition.popupControlled,
).map((definition) => ({
  key: definition.key,
  input: document.querySelector(`[data-setting="${definition.key}"]`),
}));

for (const { key, input } of settingInputs) {
  if (!input) {
    console.warn(`GitHub QoL popup: no control for setting "${key}".`);
    continue;
  }
  bindSettingCheckbox(input, showStatus);
}

document
  .getElementById("open-options")
  ?.addEventListener("click", () => chrome.runtime.openOptionsPage());

(async () => {
  const settings = await getSettings();
  for (const { key, input } of settingInputs) {
    if (input) input.checked = Boolean(settings[key]);
  }
})().catch((error) => {
  console.error("GitHub QoL popup:", error);
  showStatus("Could not load settings");
});
