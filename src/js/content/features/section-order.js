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
 * Before-zone: iterate ranks from LAST to FIRST, keeping the previous
 * iteration's outer element as the insertion anchor (successor anchor).
 * place() returns the outer element now in the slot (it may differ from
 * the resolved element, e.g. the mergebox row wrap) — always advance the
 * anchor with that return value, never a stale pre-place reference.
 */
function applyBeforeZone(container, order) {
  let didWork = false;
  let anchor = findFirstTimelineItemChild(container);

  for (let i = rankedIds(order, "before").length - 1; i >= 0; i--) {
    const descriptor = descriptorFor(rankedIds(order, "before")[i]);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) continue;
    if (!descriptor.isPlaced(el, container, "before", anchor)) {
      descriptor.place(el, container, "before", anchor);
      didWork = true;
    }
    // Re-resolve: place may have wrapped the element (row).
    anchor = descriptor.resolve(container) ?? anchor;
  }
  return didWork;
}

/**
 * After-zone: iterate ranks from FIRST to LAST, keeping the previous
 * iteration's outer element as the insertion anchor (predecessor
 * anchor), starting at the last timeline item.
 */
function applyAfterZone(container, order) {
  let didWork = false;
  const items = getDirectTimelineItems(container, TIMELINE_ITEM_SELECTOR);
  let anchor = items[items.length - 1] ?? null;

  for (const id of rankedIds(order, "after")) {
    const descriptor = descriptorFor(id);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) continue;
    if (!descriptor.isPlaced(el, container, "after", anchor)) {
      descriptor.place(el, container, "after", anchor);
      didWork = true;
    }
    anchor = descriptor.resolve(container) ?? anchor;
  }
  return didWork;
}

function applySectionOrder(settings) {
  const container = findTimelineContainer();
  if (!container) return false;

  let didWork = applyAfterZone(container, settings.sectionOrder);
  didWork = applyBeforeZone(container, settings.sectionOrder) || didWork;

  resetDomCache();
  return didWork;
}

function needsWorkSectionOrder(settings) {
  const container = findTimelineContainer();
  if (!container) return false;

  let anchor = findFirstTimelineItemChild(container);
  for (let i = rankedIds(settings.sectionOrder, "before").length - 1; i >= 0; i--) {
    const descriptor = descriptorFor(rankedIds(settings.sectionOrder, "before")[i]);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) {
      if (descriptor.pendingWhenMissing?.()) return true;
      continue;
    }
    if (!descriptor.isPlaced(el, container, "before", anchor)) return true;
    anchor = el;
  }

  const items = getDirectTimelineItems(container, TIMELINE_ITEM_SELECTOR);
  anchor = items[items.length - 1] ?? null;
  for (const id of rankedIds(settings.sectionOrder, "after")) {
    const descriptor = descriptorFor(id);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) {
      if (descriptor.pendingWhenMissing?.()) return true;
      continue;
    }
    if (!descriptor.isPlaced(el, container, "after", anchor)) return true;
    anchor = el;
  }

  return false;
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
