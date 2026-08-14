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
    for (const gid of gids) {
      const item = byGid.get(gid);
      if (item && container.lastElementChild !== item) {
        container.appendChild(item);
        changed = true;
      }
    }
  } else if (container.getAttribute("data-gqol-reverse") === "1") {
    if (items.length >= 2) {
      [...items].reverse().forEach((item) => container.appendChild(item));
      changed = true;
    }
  }

  container.removeAttribute("data-gqol-timeline-gids");
  container.removeAttribute("data-gqol-reverse");
  return changed;
}

/**
 * Reverse the container's timeline items (newest first). Saves the original
 * gid order on first reversal so it can be restored exactly. Returns false
 * when there are fewer than 2 items (nothing to do).
 */
export function reverseTimelineContainer(container, selector) {
  const items = getDirectTimelineItems(container, selector);
  if (items.length < 2) return false;

  if (!container.hasAttribute("data-gqol-reverse")) {
    saveTimelineGids(container, selector);
  }

  [...items].reverse().forEach((item) => container.appendChild(item));
  container.setAttribute("data-gqol-reverse", "1");
  return true;
}
