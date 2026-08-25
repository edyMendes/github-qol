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

const settingInputs = new Map(
  SETTING_DEFINITIONS.filter((definition) => definition.popupControlled).map(
    (definition) => [
      definition.key,
      document.querySelector(`[data-setting="${definition.key}"]`),
    ],
  ),
);

// Booleans bind checked directly; enums bind through data-on/data-off so
// one checkbox expresses "newest" vs "oldest".
function readInput(definition, input) {
  if (definition.type === "enum") {
    return input.checked ? input.dataset.on : input.dataset.off;
  }
  return input.checked;
}

function writeInput(definition, input, value) {
  if (definition.type === "enum") {
    input.checked = value === input.dataset.on;
  } else {
    input.checked = Boolean(value);
  }
}

const definitionsByKey = new Map(
  SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
);

for (const [key, input] of settingInputs) {
  if (!input) {
    console.warn(`GitHub QoL popup: no control for setting "${key}".`);
    continue;
  }
  input.addEventListener("change", async () => {
    try {
      await saveSettings({ [key]: readInput(definitionsByKey.get(key), input) });
      showStatus("Saved");
    } catch (error) {
      console.error("GitHub QoL popup:", error);
      showStatus("Could not save");
    }
  });
}

document
  .getElementById("open-options")
  ?.addEventListener("click", () => chrome.runtime.openOptionsPage());

(async () => {
  const settings = await getSettings();
  for (const [key, input] of settingInputs) {
    if (input) writeInput(definitionsByKey.get(key), input, settings[key]);
  }
})().catch((error) => {
  console.error("GitHub QoL popup:", error);
  showStatus("Could not load settings");
});
