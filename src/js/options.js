import { getSettings } from "./settings.js";
import {
  bindSettingCheckbox,
  createStatusFlash,
  saveSetting,
} from "./settings-ui.js";

const SECTION_LABELS = {
  description: "PR description",
  mergebox: "Merge status box",
  commentBox: "Comment box",
  timeline: "Comments & activity",
};

const statusEl = document.getElementById("options-status");
const listEl = document.getElementById("section-list");
const directionEl = document.getElementById("direction");

const showStatus = createStatusFlash(statusEl);

let saveTimeout = null;
let currentOrder = [];

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(
    () => saveSetting({ sectionOrder: currentOrder }, showStatus),
    300,
  );
}

function renderList() {
  listEl.innerHTML = "";
  currentOrder.forEach((id, index) => {
    const row = document.createElement("li");
    row.dataset.sectionId = id;
    row.className =
      "flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2";
    row.draggable = true;

    const handle = document.createElement("span");
    handle.className = "cursor-grab text-zinc-600 select-none";
    handle.textContent = "⠿";
    handle.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "flex-1 text-sm text-zinc-200";
    label.textContent = SECTION_LABELS[id] ?? id;

    const up = document.createElement("button");
    up.type = "button";
    up.dataset.move = "up";
    up.textContent = "↑";
    up.setAttribute("aria-label", `Move ${SECTION_LABELS[id]} up`);
    up.disabled = index === 0;
    up.className = "rounded px-2 text-zinc-400 disabled:opacity-30";
    up.addEventListener("click", () => moveSection(id, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.dataset.move = "down";
    down.textContent = "↓";
    down.setAttribute("aria-label", `Move ${SECTION_LABELS[id]} down`);
    down.disabled = index === currentOrder.length - 1;
    down.className = "rounded px-2 text-zinc-400 disabled:opacity-30";
    down.addEventListener("click", () => moveSection(id, 1));

    // HTML5 drag-and-drop: both paths call moveSectionTo, so buttons and
    // drags share one code path (buttons are the accessible floor).
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", id);
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      moveSectionTo(draggedId, index);
    });

    row.append(handle, label, up, down);
    listEl.appendChild(row);
  });
}

function moveSection(id, delta) {
  const index = currentOrder.indexOf(id);
  if (index === -1) return;
  moveSectionTo(id, index + delta);
}

function moveSectionTo(id, targetIndex) {
  const index = currentOrder.indexOf(id);
  if (index === -1) return;
  const clamped = Math.max(0, Math.min(currentOrder.length - 1, targetIndex));
  currentOrder.splice(clamped, 0, currentOrder.splice(index, 1)[0]);
  renderList();
  scheduleSave();
}

function renderDirection(timelineOrder) {
  for (const button of directionEl.querySelectorAll("[data-direction]")) {
    const active = button.dataset.direction === timelineOrder;
    button.classList.toggle("bg-blue-500/20", active);
    button.classList.toggle("border-blue-500", active);
    button.classList.toggle("text-zinc-100", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

for (const button of directionEl.querySelectorAll("[data-direction]")) {
  button.addEventListener("click", () => {
    renderDirection(button.dataset.direction);
    saveSetting({ timelineOrder: button.dataset.direction }, showStatus);
  });
}

// One generic binding for every checkbox the options page renders —
// the SETTING_DEFINITIONS table in settings.js stays the single source
// of truth for what exists.
const settingInputs = [...document.querySelectorAll("input[data-setting]")];
for (const input of settingInputs) {
  bindSettingCheckbox(input, showStatus);
}

(async () => {
  const settings = await getSettings();
  // Copy: getSettings may hand back the shared DEFAULT_SETTINGS order.
  currentOrder = [...settings.sectionOrder];
  renderList();
  renderDirection(settings.timelineOrder);
  for (const input of settingInputs) {
    input.checked = Boolean(settings[input.dataset.setting]);
  }
})().catch((error) => {
  console.error("GitHub QoL options:", error);
  showStatus("Could not load settings");
});
