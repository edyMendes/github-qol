/**
 * Shared selectors and marker attributes used by more than one module.
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

// Saved original item order on the container, for exact restore.
export const TIMELINE_GIDS_ATTR = "data-gqol-timeline-gids";

// Marks the PR description's movable unit once the section-order engine
// owns it; the reversal excludes the marked wrapper from the item stream
// so "newest first" can never drag the description into the comments.
export const DESC_SECTION_ATTR = "data-gqol-desc-section";

// Rendered PR-description body elements, in preference order.
export const MARKDOWN_BODY_CLASSES = [".markdown-body", ".js-comment-body"];
export const MARKDOWN_BODY_SELECTOR = MARKDOWN_BODY_CLASSES.join(", ");

// GitHub's placeholder blocks for content still being fetched.
export const SKELETON_CLASS = ".Skeleton";
export const SKELETON_SELECTOR =
  `batch-deferred-content ${SKELETON_CLASS}, ` +
  `.commit-build-statuses ${SKELETON_CLASS}, ` +
  `.js-updatable-content ${SKELETON_CLASS}`;
