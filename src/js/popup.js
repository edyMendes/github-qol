import { getSettings, saveSettings } from "./settings.js";

const reverseTimelineInput = document.getElementById("setting-reverse-timeline");
const collapseDescriptionInput = document.getElementById("setting-collapse-description");
const mergeboxBelowDescriptionInput = document.getElementById("setting-mergebox-below-description");
const commentBoxAtTopInput = document.getElementById("setting-comment-box-at-top");
const statusEl = document.getElementById("popup-status");

let statusTimeout = null;

function showStatus(message) {
  statusEl.textContent = message;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

async function persist() {
  await saveSettings({
    reverseTimeline: reverseTimelineInput.checked,
    collapsePrDescription: collapseDescriptionInput.checked,
    showMergeBoxBelowDescription: mergeboxBelowDescriptionInput.checked,
    commentBoxAtTop: commentBoxAtTopInput.checked,
  });
  showStatus("Saved");
}

reverseTimelineInput.addEventListener("change", persist);
collapseDescriptionInput.addEventListener("change", persist);
mergeboxBelowDescriptionInput.addEventListener("change", persist);
commentBoxAtTopInput.addEventListener("change", persist);

(async () => {
  const settings = await getSettings();
  reverseTimelineInput.checked = settings.reverseTimeline;
  collapseDescriptionInput.checked = settings.collapsePrDescription;
  mergeboxBelowDescriptionInput.checked = settings.showMergeBoxBelowDescription;
  commentBoxAtTopInput.checked = settings.commentBoxAtTop;
})().catch((error) => {
  console.error("GitHub QoL popup:", error);
  showStatus("Could not load settings");
});
