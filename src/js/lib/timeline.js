/**
 * Pure timeline DOM helpers. All functions take explicit elements/selectors
 * so they can be unit-tested without the content script's globals.
 */

export function collectTimelineItems(root, selector) {
  return [...root.querySelectorAll(selector)];
}

export function getDirectTimelineItems(container, selector) {
  return [...container.children].filter((child) => child.matches(selector));
}

export function saveTimelineGids(container, selector) {
  const items = getDirectTimelineItems(container, selector);
  const gids = items
    .map((item) => item.getAttribute("data-gid") ?? "")
    .join("|");
  container.setAttribute("data-gqol-timeline-gids", gids);
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
  const savedGids = container.getAttribute("data-gqol-timeline-gids");
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
  } else if (container.getAttribute("data-gqol-reverse") === "1") {
    if (items.length >= 2) {
      placeItemsInOrder(container, [...items].reverse(), selector);
      changed = true;
    }
  }

  container.removeAttribute("data-gqol-timeline-gids");
  container.removeAttribute("data-gqol-reverse");
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

  if (!container.hasAttribute("data-gqol-reverse")) {
    saveTimelineGids(container, selector);
  }

  placeItemsInOrder(container, [...items].reverse(), selector);
  container.setAttribute("data-gqol-reverse", "1");
  return true;
}
