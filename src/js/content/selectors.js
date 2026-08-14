/**
 * Selectors and attributes shared by more than one feature module.
 * Feature-private constants stay inside their feature.
 */

export const TIMELINE_ITEM_SELECTOR = ".js-timeline-item";

// The merge-box feature inserts its row before the (already moved) comment
// box, so the marker attribute is shared rather than comment-box-private.
export const COMMENT_BOX_MOVED_ATTR = "data-gqol-comment-box-moved";
