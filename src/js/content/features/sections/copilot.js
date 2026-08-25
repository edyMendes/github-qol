/**
 * Section descriptor: the Copilot banner rendered under the PR
 * description. Purely positional — the banner keeps its native look.
 *
 * The banner is optional content (repo/user settings may hide Copilot),
 * so a missing banner never counts as pending work and never declares
 * recovery.
 */

import { findMergeBoxUnit } from "../../../lib/placement.js";
import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import { TIMELINE_ITEM_SELECTOR } from "../../../lib/selectors.js";

// Candidate selectors for the banner landmark, probed in order. Verify
// against a live PR page (see plan Task 11) — updating this list changes
// no logic.
const COPILOT_BANNER_SELECTORS = [
  '[data-testid="copilot-pull-request-summaries"]',
  "copilot-pull-request-summaries",
  '[data-testid="copilot-pr-summary"]',
];

const COPILOT_MOVED_ATTR = "data-gqol-copilot-moved";

const copilotAnchors = new WeakMap();

function findCopilotBanner() {
  for (const selector of COPILOT_BANNER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function resolveCopilot(container) {
  const banner = findCopilotBanner();
  if (!banner?.isConnected || !container) return null;
  return (
    findMergeBoxUnit(banner, container, TIMELINE_ITEM_SELECTOR) ?? banner
  );
}

function isCopilotPlacedAt(el, container, mode, ref) {
  if (
    !el?.isConnected ||
    el.parentElement !== container ||
    el.getAttribute(COPILOT_MOVED_ATTR) !== "1"
  ) {
    return false;
  }
  return mode === "before" ? el.nextSibling === ref : el.previousSibling === ref;
}

function placeCopilot(el, container, mode, ref) {
  anchorBefore(copilotAnchors, el, el, "gqol-copilot-anchor");
  if (mode === "before") {
    container.insertBefore(el, ref ?? null);
  } else if (ref) {
    ref.after(el);
  } else {
    container.appendChild(el);
  }
  el.setAttribute(COPILOT_MOVED_ATTR, "1");
  return el;
}

function cleanupCopilot() {
  let changed = false;
  document
    .querySelectorAll(`[${COPILOT_MOVED_ATTR}="1"]`)
    .forEach((unit) => {
      restoreAtAnchor(copilotAnchors, unit, unit);
      unit.removeAttribute(COPILOT_MOVED_ATTR);
      changed = true;
    });
  return changed;
}

export default {
  id: "copilot",
  resolve: resolveCopilot,
  isPlaced: isCopilotPlacedAt,
  place: placeCopilot,
  cleanup: cleanupCopilot,
};
