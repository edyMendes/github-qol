/**
 * Anchor-based DOM moves: record where an element came from (a comment
 * node left in its place) so it can later be restored exactly, even after
 * other moves shuffled the neighbourhood.
 *
 * `key` is the WeakMap key (usually the moving element itself); the anchor
 * is inserted before `referenceEl`, which may differ (e.g. the merge box
 * feature keys by the partial but anchors next to its wrapper row).
 */

export function anchorBefore(anchors, key, referenceEl, label) {
  if (anchors.has(key)) return;
  const anchor = document.createComment(label);
  referenceEl.parentNode?.insertBefore(anchor, referenceEl);
  anchors.set(key, anchor);
}

/** Put `el` back at its anchor's position; true when a restore happened. */
export function restoreAtAnchor(anchors, key, el) {
  const anchor = anchors.get(key);
  const restored = Boolean(anchor?.parentNode);
  if (restored) {
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    anchor.remove();
  }
  anchors.delete(key);
  return restored;
}
