/**
 * Per-pass DOM cache.
 *
 * One revalidation pass used to re-query the same nodes (timeline items,
 * container, description, merge box) 3-5 times each. The cache collapses
 * that to one lookup per feature; it is reset whenever the DOM may have
 * changed (start of pass, after each feature, hydration ticks, navigation,
 * storage changes).
 */

import { collectTimelineItems } from "../lib/timeline.js";
import { TIMELINE_ITEM_SELECTOR } from "./selectors.js";

const TIMELINE_PARTIAL_SELECTOR =
  'rails-partial[data-partial-name="pullRequestsConversationsRoute.Timeline"]';
const DISCUSSION_SELECTOR = ".js-discussion";
const PR_DESCRIPTION_ID_SELECTOR = '[id^="pullrequest-"]';
const PR_DESCRIPTION_TESTID_SELECTOR =
  '[data-testid="pull-request-description"]';
const MERGEBOX_SELECTOR = '[data-testid="mergebox-partial"]';
const COMMENT_FIELD_SELECTOR = "#new_comment_field";
const COMMENT_FORM_SELECTOR =
  "form.js-new-comment-form, form#new_comment_form, form[data-testid='new-comment-form']";

export { PR_DESCRIPTION_ID_SELECTOR, PR_DESCRIPTION_TESTID_SELECTOR };

let domCache = null;

export function resetDomCache() {
  domCache = null;
}

function getDomCache() {
  if (domCache) return domCache;

  const discussionRoot =
    document.querySelector(DISCUSSION_SELECTOR) ??
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ??
    document.body;

  const timelineRoot =
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ??
    document.querySelector(DISCUSSION_SELECTOR) ??
    document.body;

  domCache = {
    discussionRoot,
    timelineItems: collectTimelineItems(timelineRoot, TIMELINE_ITEM_SELECTOR),
    timelineContainer: findTimelineContainerUncached(),
  };
  return domCache;
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
  return best ?? items[0].parentElement;
}

export function findTimelineContainer() {
  return getDomCache().timelineContainer;
}

export function getTimelineItems() {
  return getDomCache().timelineItems;
}

export function findFirstTimelineItemChild(container) {
  return [...(container?.children ?? [])].find((child) =>
    child.matches(TIMELINE_ITEM_SELECTOR),
  );
}

// ---------------------------------------------------------------------------
// Description accessors
// ---------------------------------------------------------------------------

export function getDescriptionElement() {
  const cache = getDomCache();
  return cache.descriptionEl ?? computeDescriptionElement(cache);
}

function computeDescriptionElement(cache) {
  const root = cache.discussionRoot;
  const direct =
    root.querySelector(PR_DESCRIPTION_TESTID_SELECTOR) ??
    root.querySelector(PR_DESCRIPTION_ID_SELECTOR);
  if (direct) {
    cache.descriptionEl = direct;
    return direct;
  }

  const firstItem = cache.timelineItems[0];
  const fromItem = firstItem
    ? (firstItem.querySelector(PR_DESCRIPTION_TESTID_SELECTOR) ??
        firstItem.querySelector(PR_DESCRIPTION_ID_SELECTOR) ??
        firstItem)
    : document.querySelector(PR_DESCRIPTION_TESTID_SELECTOR);
  if (fromItem) {
    cache.descriptionEl = fromItem;
  }
  return fromItem;
}

export function getDescriptionBody() {
  const cache = getDomCache();
  if (cache.descriptionBody !== undefined) return cache.descriptionBody;
  cache.descriptionBody = computeDescriptionBody();
  return cache.descriptionBody;
}

function findBodyIn(root) {
  return (
    root.querySelector(`${PR_DESCRIPTION_TESTID_SELECTOR} .markdown-body`) ??
    root.querySelector(`${PR_DESCRIPTION_TESTID_SELECTOR} .js-comment-body`) ??
    root.querySelector(`${PR_DESCRIPTION_ID_SELECTOR} .markdown-body`) ??
    root.querySelector(`${PR_DESCRIPTION_ID_SELECTOR} .js-comment-body`)
  );
}

function computeDescriptionBody() {
  const direct = findBodyIn(getDiscussionRoot());
  if (direct) return direct;

  const firstItem = getTimelineItems()[0];
  return firstItem ? findBodyIn(firstItem) : null;
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
  let descEl =
    root.querySelector(PR_DESCRIPTION_TESTID_SELECTOR) ??
    root.querySelector(PR_DESCRIPTION_ID_SELECTOR);

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
