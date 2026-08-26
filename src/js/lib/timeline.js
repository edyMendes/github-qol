/**
 * Timeline DOM helpers. All functions take explicit elements/selectors
 * so they can be unit-tested without the content script's globals.
 */

import {
  DESC_SECTION_ATTR,
  REVERSED_ATTR,
  TIMELINE_GIDS_ATTR,
  TIMELINE_REVERSED_CLASS,
} from "./selectors.js";

export function getDirectTimelineItems(container, selector) {
  return [...container.children].filter(
    (child) =>
      child.matches(selector) && !child.hasAttribute(DESC_SECTION_ATTR),
  );
}

/**
 * Item selectors probed in order: the legacy direct-child class first,
 * then the React-era item class. The FIRST selector whose items share a
 * parent wins, so legacy pages keep their exact-restore gids.
 */
export const TIMELINE_ITEM_SELECTORS = [".js-timeline-item", ".TimelineItem"];

/**
 * Leaf timeline items under `container` for a selector: matches that
 * contain no other match (group wrappers like the progressive-focus
 * container collapse away — their inner items are the real stream).
 * The marked description unit never counts.
 */
function leafTimelineItems(container, selector) {
  const matches = [...container.querySelectorAll(selector)];
  return matches.filter(
    (el) =>
      !el.hasAttribute(DESC_SECTION_ATTR) &&
      !matches.some((other) => other !== el && el.contains(other)),
  );
}

/**
 * Deepest common ancestor of the items, walking up no further than
 * `boundary` (or body). Null when the items share no in-page ancestor.
 */
function commonAncestor(items, boundary) {
  let chain = null;
  for (const item of items) {
    const set = new Set();
    for (let node = item.parentElement; node; node = node.parentElement) {
      set.add(node);
      if (node === boundary || node === document.body) break;
    }
    if (!chain) {
      chain = set;
    } else {
      chain = new Set([...chain].filter((el) => set.has(el)));
    }
  }
  return chain
    ? [...chain].find((el) => el !== document.body) ?? null
    : null;
}

function distinctParents(items) {
  const parents = [];
  for (const item of items) {
    if (item.parentElement && !parents.includes(item.parentElement)) {
      parents.push(item.parentElement);
    }
  }
  return parents;
}

/**
 * Locate the timeline stream for reversal.
 *
 * Legacy DOM: ≥2 items are direct children of the container → mutation
 * mode (reverseTimelineContainer, gid save/restore).
 *
 * React-era DOM: the stream is fragmented into per-group wrappers
 * (comments, reviews, the commits log, …). The region (deepest common
 * ancestor of all leaf items) flips GROUP order; each item parent flips
 * order INSIDE its group. Both are visual (CSS) — React reconciliation
 * reverts DOM reorders of its subtrees. The region is clamped to null
 * when it resolves to the container itself (or beyond): a container
 * flip would also invert our moved sections and GitHub's action bar,
 * so only per-group flips apply there.
 *
 * Returns null until at least two leaf items exist.
 */
export function resolveTimelineStreamRegion(container) {
  if (!container) return null;

  for (const selector of TIMELINE_ITEM_SELECTORS) {
    const items = getDirectTimelineItems(container, selector);
    if (items.length >= 2) {
      return { nested: false, parent: container, selector, items };
    }
  }

  for (const selector of TIMELINE_ITEM_SELECTORS) {
    const leaves = leafTimelineItems(container, selector);
    if (leaves.length < 2) continue;

    const ancestor = commonAncestor(leaves, container);
    const region =
      ancestor && ancestor !== container && container.contains(ancestor)
        ? ancestor
        : null;
    return {
      nested: true,
      region,
      itemParents: distinctParents(leaves),
      selector,
      items: leaves,
    };
  }
  return null;
}

/**
 * Visual newest-first for React-era streams: toggle the reversal class
 * (plus the shared state attribute) on the stream parent. No DOM moves —
 * React re-rendering cannot revert it, and items appended later display
 * at the top automatically under column-reverse. Returns whether
 * anything changed.
 */
export function setVisualReversal(parent, on) {
  if (!parent) return false;
  const hasAttr = parent.getAttribute(REVERSED_ATTR) === "1";
  const hasClass = parent.classList.contains(TIMELINE_REVERSED_CLASS);
  const changed = on ? !hasAttr || !hasClass : hasAttr || hasClass;

  if (on) {
    parent.setAttribute(REVERSED_ATTR, "1");
    parent.classList.add(TIMELINE_REVERSED_CLASS);
  } else {
    parent.removeAttribute(REVERSED_ATTR);
    parent.classList.remove(TIMELINE_REVERSED_CLASS);
  }
  return changed;
}

function saveTimelineGids(container, selector) {
  const items = getDirectTimelineItems(container, selector);
  const gids = items
    .map((item) => item.getAttribute("data-gid") ?? "")
    .join("|");
  container.setAttribute(TIMELINE_GIDS_ATTR, gids);
}

/**
 * Rewrite the container's item children in `orderedItems` order WITHOUT
 * moving them past non-item siblings: each item is inserted before the
 * current first item slot, so children before the block (e.g. the PR
 * description, callout hints) and after it (e.g. the footer/guidelines)
 * keep their native positions — only the order inside the block flips.
 */
function placeItemsInOrder(container, orderedItems, selector) {
  const first = getDirectTimelineItems(container, selector)[0];
  if (!first) return;
  for (const item of orderedItems) {
    if (item !== first) container.insertBefore(item, first);
  }
}

/**
 * Restore original order: prefer the saved gid sequence, fall back to
 * reversing again. Returns true if any reorder happened.
 */
export function restoreTimelineOrder(container, selector) {
  const savedGids = container.getAttribute(TIMELINE_GIDS_ATTR);
  const items = getDirectTimelineItems(container, selector);
  let changed = false;

  if (savedGids) {
    const gids = savedGids.split("|");
    const byGid = new Map(
      items.map((item) => [item.getAttribute("data-gid") ?? "", item]),
    );
    const ordered = gids
      .map((gid) => byGid.get(gid))
      .filter(Boolean);
    const before = items.map((item) => item.getAttribute("data-gid") ?? "");
    placeItemsInOrder(container, ordered, selector);
    const after = getDirectTimelineItems(container, selector).map(
      (item) => item.getAttribute("data-gid") ?? "",
    );
    changed = before.join("|") !== after.join("|");
  } else if (container.getAttribute(REVERSED_ATTR) === "1") {
    if (items.length >= 2) {
      placeItemsInOrder(container, [...items].reverse(), selector);
      changed = true;
    }
  }

  container.removeAttribute(TIMELINE_GIDS_ATTR);
  container.removeAttribute(REVERSED_ATTR);
  return changed;
}

/**
 * Reverse the container's timeline items (newest first) in place: the block
 * of items keeps its position among non-item siblings, only the order
 * within it flips. Saves the original gid order on first reversal so it can
 * be restored exactly. Returns false when there are fewer than 2 items.
 */
export function reverseTimelineContainer(container, selector) {
  const items = getDirectTimelineItems(container, selector);
  if (items.length < 2) return false;

  if (!container.hasAttribute(REVERSED_ATTR)) {
    saveTimelineGids(container, selector);
  }

  placeItemsInOrder(container, [...items].reverse(), selector);
  container.setAttribute(REVERSED_ATTR, "1");
  return true;
}
