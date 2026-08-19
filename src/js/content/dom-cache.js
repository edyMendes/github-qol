/**
 * Per-pass DOM cache.
 *
 * One revalidation pass used to re-query the same nodes (timeline items,
 * container, description, merge box) 3-5 times each. The cache collapses
 * that to one lookup per feature; it is reset whenever the DOM may have
 * changed (start of pass, after each feature, hydration ticks, navigation,
 * storage changes).
 */

import {
  MARKDOWN_BODY_CLASSES,
  TIMELINE_ITEM_SELECTOR,
} from "../lib/selectors.js";

const TIMELINE_PARTIAL_SELECTOR =
  'rails-partial[data-partial-name="pullRequestsConversationsRoute.Timeline"]';
const DISCUSSION_SELECTOR = ".js-discussion";
export const PR_DESCRIPTION_ID_SELECTOR = '[id^="pullrequest-"]';
export const PR_DESCRIPTION_TESTID_SELECTOR =
  '[data-testid="pull-request-description"]';
const MERGEBOX_SELECTOR = '[data-testid="mergebox-partial"]';
const COMMENT_FIELD_SELECTOR = "#new_comment_field";
const COMMENT_FORM_SELECTOR =
  "form.js-new-comment-form, form#new_comment_form, form[data-testid='new-comment-form']";

let domCache = null;

export function resetDomCache() {
  domCache = null;
}

function getDomCache() {
  // Eager fields only; expensive lookups (timeline items, container) are
  // computed lazily on first use — many passes touch just the merge box
  // or comment form and must not pay for full-subtree timeline scans.
  if (domCache) return domCache;
  domCache = { discussionRoot: getDiscussionRootUncached() };
  return domCache;
}

/** First matching element for the selectors, else document.body. */
function firstOf(...selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return document.body;
}

function getDiscussionRootUncached() {
  // Discussion reads prefer the legacy root, timeline reads the React
  // partial — both fall through to the other, then the whole document.
  return firstOf(DISCUSSION_SELECTOR, TIMELINE_PARTIAL_SELECTOR);
}

function getTimelineRootUncached() {
  return firstOf(TIMELINE_PARTIAL_SELECTOR, DISCUSSION_SELECTOR);
}

function getDiscussionRoot() {
  return getDomCache().discussionRoot;
}

function findTimelineContainerUncached() {
  const partial = document.querySelector(TIMELINE_PARTIAL_SELECTOR);
  if (partial) return partial;

  const items = document.querySelectorAll(TIMELINE_ITEM_SELECTOR);
  if (items.length === 0) return null;

  const parentCounts = new Map();
  for (const item of items) {
    const parent = item.parentElement;
    if (parent) {
      parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
    }
  }

  let best = null;
  let bestCount = 0;
  for (const [parent, count] of parentCounts) {
    if (count > bestCount) {
      bestCount = count;
      best = parent;
    }
  }
  return best;
}

export function findTimelineContainer() {
  const cache = getDomCache();
  if (cache.timelineContainer === undefined) {
    cache.timelineContainer = findTimelineContainerUncached();
  }
  return cache.timelineContainer;
}

export function getTimelineItems() {
  const cache = getDomCache();
  if (cache.timelineItems === undefined) {
    cache.timelineItems = [
      ...getTimelineRootUncached().querySelectorAll(TIMELINE_ITEM_SELECTOR),
    ];
  }
  return cache.timelineItems;
}

export function findFirstTimelineItemChild(container) {
  return container?.querySelector(`:scope > ${TIMELINE_ITEM_SELECTOR}`);
}

/** True when the description and at least two timeline items are rendered. */
export function isConversationRendered() {
  return Boolean(findDescriptionContainer()) && getTimelineItems().length >= 2;
}

// ---------------------------------------------------------------------------
// Description accessors
// ---------------------------------------------------------------------------

export function getDescriptionElement() {
  const cache = getDomCache();
  return cache.descriptionEl ?? computeDescriptionElement(cache);
}

/** Direct desc element inside `root`, else null. */
function findDescElementIn(root) {
  return (
    root.querySelector(PR_DESCRIPTION_TESTID_SELECTOR) ??
    root.querySelector(PR_DESCRIPTION_ID_SELECTOR)
  );
}

function computeDescriptionElement(cache) {
  // Discussion root first; else the first timeline item (the PR body item —
  // falling back to the item itself); else anywhere in the document.
  const firstItem = getTimelineItems()[0];
  const el =
    findDescElementIn(cache.discussionRoot) ??
    (firstItem
      ? (findDescElementIn(firstItem) ?? firstItem)
      : document.querySelector(PR_DESCRIPTION_TESTID_SELECTOR));
  if (el) cache.descriptionEl = el;
  return el;
}

export function getDescriptionBody() {
  const cache = getDomCache();
  if (cache.descriptionBody !== undefined) return cache.descriptionBody;
  cache.descriptionBody = computeDescriptionBody();
  return cache.descriptionBody;
}

// Cascade in priority order — NOT one comma selector: querySelector returns
// document order, not selector priority, so each root/class pair must be
// probed in sequence to preserve the fallback semantics.
function findBodyIn(root) {
  for (const descSelector of [
    PR_DESCRIPTION_TESTID_SELECTOR,
    PR_DESCRIPTION_ID_SELECTOR,
  ]) {
    for (const bodyClass of MARKDOWN_BODY_CLASSES) {
      const body = root.querySelector(`${descSelector} ${bodyClass}`);
      if (body) return body;
    }
  }
  return null;
}

function computeDescriptionBody() {
  const firstItem = getTimelineItems()[0];
  return (
    findBodyIn(getDiscussionRoot()) ??
    (firstItem ? findBodyIn(firstItem) : null)
  );
}

// ---------------------------------------------------------------------------
// Merge box / comment form accessors
// ---------------------------------------------------------------------------

export function findMergeBox() {
  const cache = getDomCache();
  if (cache.mergeBox !== undefined) return cache.mergeBox;
  cache.mergeBox = document.querySelector(MERGEBOX_SELECTOR) ?? null;
  return cache.mergeBox;
}

export function findDescriptionContainer() {
  const cache = getDomCache();
  if (cache.descContainer !== undefined) return cache.descContainer;
  cache.descContainer = computeDescriptionContainer();
  return cache.descContainer;
}

function computeDescriptionContainer() {
  const root = getDiscussionRoot();
  let descEl = findDescElementIn(root);

  if (!descEl) {
    const body = getDescriptionBody();
    descEl = body?.closest(`${PR_DESCRIPTION_TESTID_SELECTOR}, ${PR_DESCRIPTION_ID_SELECTOR}`);
  }

  if (!descEl?.isConnected) return null;

  const commentGroup =
    descEl.closest(".timeline-comment-group.TimelineItem-body") ??
    descEl.closest(".timeline-comment-group");
  if (commentGroup) return commentGroup;

  return (
    descEl.closest(".TimelineItem.js-comment-container, .js-timeline-item") ||
    descEl
  );
}

export function findCommentForm() {
  const cache = getDomCache();
  if (cache.commentForm !== undefined) return cache.commentForm;
  const field = document.querySelector(COMMENT_FIELD_SELECTOR);
  const form = field?.closest("form") ?? document.querySelector(COMMENT_FORM_SELECTOR);
  cache.commentForm = form ?? null;
  return cache.commentForm;
}
