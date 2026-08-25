/**
 * Section descriptor: the PR description. Purely positional — collapse
 * styling belongs to the collapse-description feature; this descriptor
 * only moves the description's top-level wrapper when the user ranks it
 * away from its native top spot. Marked with DESC_SECTION_ATTR so the
 * reversal feature excludes it from the item stream.
 */

import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import {
  DESC_SECTION_ATTR,
  TIMELINE_FLOW_STOP_SELECTOR,
} from "../../../lib/selectors.js";
import {
  findDescriptionContainer,
  findTimelineContainer,
  resetDomCache,
} from "../../dom-cache.js";
import { isPendingPostNavSwap } from "../../page.js";

const descAnchors = new WeakMap();

/**
 * The description's outermost wrapper that is a direct child of the
 * flow container, or null when the description lives elsewhere in the
 * DOM (or is not rendered yet).
 */
function resolveDescription(container) {
  if (!container) return null;
  const marked = container.querySelector(`:scope > [${DESC_SECTION_ATTR}="1"]`);
  if (marked) return marked;

  const descContainer = findDescriptionContainer();
  if (!descContainer?.isConnected) return null;

  let node = descContainer;
  while (node.parentElement && node.parentElement !== container) {
    if (
      node.parentElement === document.body ||
      node.parentElement.matches?.(TIMELINE_FLOW_STOP_SELECTOR)
    ) {
      return null;
    }
    node = node.parentElement;
  }
  return node.parentElement === container ? node : null;
}

function isDescriptionPlacedAt(el, container, mode, ref) {
  if (
    !el?.isConnected ||
    el.parentElement !== container ||
    el.getAttribute(DESC_SECTION_ATTR) !== "1"
  ) {
    return false;
  }
  return mode === "before" ? el.nextSibling === ref : el.previousSibling === ref;
}

function placeDescription(el, container, mode, ref) {
  anchorBefore(descAnchors, el, el, "gqol-desc-anchor");
  if (mode === "before") {
    container.insertBefore(el, ref ?? null);
  } else if (ref) {
    ref.after(el);
  } else {
    container.appendChild(el);
  }
  el.setAttribute(DESC_SECTION_ATTR, "1");
  return el;
}

function cleanupDescription() {
  let changed = false;
  document
    .querySelectorAll(`[${DESC_SECTION_ATTR}="1"]`)
    .forEach((unit) => {
      restoreAtAnchor(descAnchors, unit, unit);
      unit.removeAttribute(DESC_SECTION_ATTR);
      changed = true;
    });
  resetDomCache();
  return changed;
}

export default {
  id: "description",
  resolve: resolveDescription,
  isPlaced: isDescriptionPlacedAt,
  place: placeDescription,
  cleanup: cleanupDescription,
  pendingWhenMissing: () =>
    Boolean(findTimelineContainer()) && isPendingPostNavSwap(),
  recovery: {
    // The description always exists on a rendered PR page; a seen one
    // that vanishes with the DOM settled means GitHub dropped our moved
    // subtree — the orchestrator reloads once.
    expectedWhen: () => true,
    landmark: () => findDescriptionContainer(),
  },
};
