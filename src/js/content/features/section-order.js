/**
 * Feature: user-configurable section order around the PR timeline.
 *
 * One engine, one ordering mechanism. Per-section DOM knowledge lives in
 * ./sections/ descriptors (resolve/isPlaced/place/cleanup); this feature
 * decides WHERE each section goes based on settings.sectionOrder:
 * ids ranked before "timeline" sit serially above the first timeline
 * item (in user order), ids ranked after sit serially below the last
 * item. The description is an orderable section like any other (its
 * default rank is the top); the Copilot banner is NOT orderable — it is
 * shown/hidden by the hide-copilot feature.
 *
 * Zone layout runs INSIDE-OUT: the before-zone places sections from the
 * rank closest to the timeline upwards (each new section is inserted
 * immediately before the previous one's outer element); the after-zone
 * mirrors it outwards from the last timeline item. Inserting against an
 * already-correct anchor keeps one pass correct for fresh pages; a
 * within-zone rank swap can need a follow-up pass, which needsWork
 * reports and the orchestrator's retry ladder re-applies.
 */

import { getDirectTimelineItems } from "../../lib/timeline.js";
import { TIMELINE_ITEM_SELECTOR } from "../../lib/selectors.js";
import {
  findFirstTimelineItemChild,
  findTimelineContainer,
  resetDomCache,
} from "../dom-cache.js";
import descriptionDescriptor from "./sections/description.js";
import mergeboxDescriptor from "./sections/mergebox.js";
import commentBoxDescriptor from "./sections/comment-box.js";

const DESCRIPTORS = new Map(
  [descriptionDescriptor, mergeboxDescriptor, commentBoxDescriptor].map(
    (descriptor) => [descriptor.id, descriptor],
  ),
);

function rankedIds(order, mode) {
  const timelineIndex = order.indexOf("timeline");
  return mode === "before"
    ? order.slice(0, timelineIndex)
    : order.slice(timelineIndex + 1);
}

function descriptorFor(id) {
  return DESCRIPTORS.get(id) ?? null;
}

/**
 * A zone's section ids in visit order. The before-zone walks ranks from
 * LAST to FIRST (the rank closest to the timeline places first, against
 * the first timeline item itself); the after-zone walks FIRST to LAST
 * from the last timeline item. Both run inside-out, keeping the previous
 * section's outer element as the insertion anchor.
 */
function zoneIds(order, mode) {
  const ids = rankedIds(order, mode);
  return mode === "before" ? [...ids].reverse() : ids;
}

/** The anchor a zone starts from: the first (before) or last (after)
 *  direct timeline item — null when the stream has not rendered yet. */
function zoneStartAnchor(container, mode) {
  if (mode === "before") return findFirstTimelineItemChild(container);
  const items = getDirectTimelineItems(container, TIMELINE_ITEM_SELECTOR);
  return items[items.length - 1] ?? null;
}

/**
 * One walk per zone, shared by apply and needsWork so the two can never
 * drift apart. For each section in visit order: resolve it, check
 * isPlaced against the running anchor, and — when applying — place it.
 *
 * place() returns the outer element now occupying the slot (it may
 * differ from the resolved element, e.g. the mergebox row wrap); the
 * walk always advances the anchor with that value, never a stale
 * pre-place reference. In check mode (place=false) the first pending or
 * misplaced section short-circuits to true.
 *
 * Returns whether work happened (apply) or remains (check).
 */
function runZone(container, order, mode, place) {
  let didWork = false;
  let anchor = zoneStartAnchor(container, mode);

  for (const id of zoneIds(order, mode)) {
    const descriptor = descriptorFor(id);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) {
      // An absent section is pending work only while GitHub may still
      // be swapping the restored page in (descriptor.pendingWhenMissing).
      if (!place && descriptor.pendingWhenMissing?.()) return true;
      continue;
    }
    if (descriptor.isPlaced(el, container, mode, anchor)) {
      anchor = el;
      continue;
    }
    if (!place) return true;
    didWork = true;
    anchor = descriptor.place(el, container, mode, anchor);
  }
  return didWork;
}

function applySectionOrder(settings) {
  const container = findTimelineContainer();
  if (!container) return false;

  let didWork = runZone(container, settings.sectionOrder, "after", true);
  didWork = runZone(container, settings.sectionOrder, "before", true) || didWork;

  resetDomCache();
  return didWork;
}

function needsWorkSectionOrder(settings) {
  const container = findTimelineContainer();
  if (!container) return false;

  return (
    runZone(container, settings.sectionOrder, "before", false) ||
    runZone(container, settings.sectionOrder, "after", false)
  );
}

function resetSectionOrder() {
  for (const descriptor of DESCRIPTORS.values()) {
    descriptor.cleanup();
  }
  resetDomCache();
}

function expectedRecovery(settings) {
  return [...DESCRIPTORS.values()].some(
    (descriptor) => descriptor.recovery?.expectedWhen(settings),
  );
}

function recoveryPresent(settings) {
  // Landmarks are native elements (description container, merge box
  // partial, comment form) — they resolve whether or not anything has
  // been laid out yet, so a page whose expected sections never rendered
  // reads as "not present" from the very first probe and can never be
  // mistaken for a dropped subtree.
  return [...DESCRIPTORS.values()].every(
    (descriptor) =>
      !descriptor.recovery?.expectedWhen(settings) ||
      Boolean(descriptor.recovery.landmark()),
  );
}

export default {
  name: "section-order",
  apply: applySectionOrder,
  needsWork: needsWorkSectionOrder,
  reset: resetSectionOrder,
  recovery: {
    // A seen-and-expected section that vanishes with the DOM settled
    // means GitHub dropped our moved subtree — the orchestrator reloads.
    expectedWhen: expectedRecovery,
    isPresent: recoveryPresent,
  },
};
