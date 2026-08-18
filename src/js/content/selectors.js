/**
 * Selectors and attributes shared by more than one feature module.
 * Feature-private constants stay inside their feature.
 */

export const TIMELINE_ITEM_SELECTOR = ".js-timeline-item";

// Climbing past these landmarks would escape the PR conversation flow, so
// wrapper searches (comment box, merge box unit) stop at them.
export const TIMELINE_FLOW_STOP_SELECTOR =
  "main, [data-turbo-body], [data-turbo-permanent], .js-discussion, .pull-discussion-timeline";

// The merge-box feature inserts its row before the (already moved) comment
// box, so the marker attribute is shared rather than comment-box-private.
export const COMMENT_BOX_MOVED_ATTR = "data-gqol-comment-box-moved";

// Set on the timeline container while its items are newest-first; read by
// the reverse feature, its mutation observer and the status module.
export const REVERSED_ATTR = "data-gqol-reverse";
