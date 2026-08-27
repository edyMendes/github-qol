/**
 * Shared placement mechanics for section descriptors. Both sides of the
 * descriptor contract — isPlaced and place — speak in "mode + ref"
 * terms: mode "before" anchors a section against its successor (the
 * first timeline item or the previously placed section), mode "after"
 * against its predecessor. A null ref means the corresponding end of
 * the container.
 */

import { findTimelineContainer } from "../../dom-cache.js";
import { isPendingPostNavSwap } from "../../page.js";

/**
 * True when `el` is a connected child of `container` sitting immediately
 * before ("before" mode) or after ("after" mode) `ref`.
 */
export function isAdjacentTo(el, container, mode, ref) {
  if (!el?.isConnected || el.parentElement !== container) return false;
  return mode === "before" ? el.nextSibling === ref : el.previousSibling === ref;
}

/** Insert `el` into `container` relative to `ref` per the zone mode. */
export function insertRelativeTo(el, container, mode, ref) {
  if (mode === "before") {
    container.insertBefore(el, ref ?? null);
  } else if (ref) {
    ref.after(el);
  } else {
    container.appendChild(el);
  }
}

/**
 * The default "absent section → pending work" policy: a section that
 * has not rendered counts as pending only while the post-navigation
 * swap may still be in flight and the conversation itself is rendered.
 * The engine applies this to any descriptor that does not override
 * pendingWhenMissing.
 */
export function pendingWhenPostNavSwap() {
  return Boolean(findTimelineContainer()) && isPendingPostNavSwap();
}
