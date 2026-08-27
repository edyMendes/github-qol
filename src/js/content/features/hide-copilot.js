/**
 * Feature: hide the Copilot banner under the PR description.
 *
 * The banner ("Mention @copilot in a comment to make changes to this
 * pull request") is a text callout with no stable selector across
 * GitHub renders, so it is located by text (findElementsByText — the
 * same landmark technique as the comment-box footer callouts) and
 * hidden via an attribute the content CSS turns into display:none.
 * Once found and marked, the cheap marker lookup short-circuits the
 * text walk on later passes.
 */

import { findElementsByText } from "../../lib/placement.js";
import { findTimelineContainer, resetDomCache } from "../dom-cache.js";

const COPILOT_HINT_PATTERN = /Mention\s+@copilot\s+in\s+a\s+comment/i;
export const COPILOT_HIDDEN_ATTR = "data-gqol-copilot-hidden";

function findHiddenBanner() {
  return document.querySelector(`[${COPILOT_HIDDEN_ATTR}="1"]`);
}

/** The banner's top-level wrapper in the timeline flow, or null. */
function findBannerUnit(container) {
  const hidden = findHiddenBanner();
  if (hidden?.isConnected) return hidden;

  // Without a container the climb below can never terminate safely (the
  // climb must not escape to a body-level wrapper — hiding that could
  // blank the page), so skip the full-tree text walk entirely.
  if (!container) return null;

  const matches = findElementsByText(container, COPILOT_HINT_PATTERN, "*", {
    // Never capture containers with form controls — only the callout.
    excludeContaining: "form, textarea, [contenteditable]",
  });
  if (matches.length === 0) return null;

  // matches are collapsed to the outermost; climb that to the flow unit.
  let node = matches[0];
  while (node.parentElement && node.parentElement !== container) {
    if (node.parentElement === document.body) return null;
    node = node.parentElement;
  }
  return node.parentElement === container ? node : null;
}

function unhideAllBanners() {
  let changed = false;
  document
    .querySelectorAll(`[${COPILOT_HIDDEN_ATTR}="1"]`)
    .forEach((unit) => {
      unit.removeAttribute(COPILOT_HIDDEN_ATTR);
      changed = true;
    });
  return changed;
}

function applyHideCopilot(settings) {
  if (!settings.hideCopilotBanner) {
    const changed = unhideAllBanners();
    if (changed) resetDomCache();
    return changed;
  }

  const container = findTimelineContainer();
  const unit = findBannerUnit(container);
  if (!unit || unit.getAttribute(COPILOT_HIDDEN_ATTR) === "1") return false;

  unit.setAttribute(COPILOT_HIDDEN_ATTR, "1");
  resetDomCache();
  return true;
}

function needsWorkHideCopilot(settings) {
  const hidden = Boolean(findHiddenBanner());
  if (!settings.hideCopilotBanner) return hidden;
  if (hidden) return false;
  return Boolean(findBannerUnit(findTimelineContainer()));
}

function resetHideCopilot() {
  return unhideAllBanners();
}

export default {
  name: "hide-copilot",
  apply: applyHideCopilot,
  needsWork: needsWorkHideCopilot,
  reset: resetHideCopilot,
};
