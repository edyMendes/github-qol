/**
 * GitHub QoL — content script for GitHub pull request conversation pages.
 *
 * Features:
 * - Reverse PR timeline (newest first)
 * - Collapse long PR descriptions
 * - Merge status box below the PR description
 * - Comment box at the top of the timeline
 */

// ---------------------------------------------------------------------------
// Settings (kept self-contained so the content bundle stays a single IIFE)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "githubQolSettings";

const DEFAULT_SETTINGS = {
  reverseTimeline: true,
  collapsePrDescription: true,
  showMergeBoxBelowDescription: true,
  commentBoxAtTop: true,
};

function normalizeSettings(raw = {}) {
  return {
    reverseTimeline:
      raw.reverseTimeline !== undefined
        ? Boolean(raw.reverseTimeline)
        : DEFAULT_SETTINGS.reverseTimeline,
    collapsePrDescription:
      raw.collapsePrDescription !== undefined
        ? Boolean(raw.collapsePrDescription)
        : DEFAULT_SETTINGS.collapsePrDescription,
    showMergeBoxBelowDescription:
      raw.showMergeBoxBelowDescription !== undefined
        ? Boolean(raw.showMergeBoxBelowDescription)
        : DEFAULT_SETTINGS.showMergeBoxBelowDescription,
    commentBoxAtTop:
      raw.commentBoxAtTop !== undefined
        ? Boolean(raw.commentBoxAtTop)
        : DEFAULT_SETTINGS.commentBoxAtTop,
  };
}

function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(items);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Selectors and constants
// ---------------------------------------------------------------------------

const TIMELINE_ITEM_SELECTOR = ".js-timeline-item";
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

const DESC_COLLAPSED_CLASS = "gqol-desc-collapsed";
const DESC_WRAP_CLASS = "gqol-desc-wrap";
const DESC_BLOCK_CLASS = "gqol-desc-block";
const DESC_FOOTER_CLASS = "gqol-desc-footer";
const DESC_TOGGLE_CLASS = "gqol-desc-toggle";

const MERGEBOX_BELOW_DESC_CLASS = "gqol-mergebox-below-desc";
const MERGEBOX_MOVED_ATTR = "data-gqol-mergebox-moved";
const MERGEBOX_TIMELINE_ROW_CLASS = "gqol-mergebox-timeline-row";
const MERGE_ANCHOR_ATTR = "data-gqol-merge-anchor";
const STRIPPED_MERGE_CLASSES_ATTR = "data-gqol-stripped-merge-classes";
const STRIPPED_CLASS_PREFIXES = ["tmp-ml-", "tmp-pl-", "tmp-mr-", "tmp-pr-"];

const COMMENT_BOX_MOVED_ATTR = "data-gqol-comment-box-moved";
const COMMENT_BOX_AT_TOP_CLASS = "gqol-comment-box-at-top";

const INITIAL_RETRY_DELAYS = [0, 800, 2000, 5000, 10000, 20000, 45000];
const POST_CHANGE_RETRY_DELAYS = [0, 200, 800, 2000];

const SKELETON_SELECTOR =
  "batch-deferred-content .Skeleton, .commit-build-statuses .Skeleton, .js-updatable-content .Skeleton";

const TIMELINE_STATUS_ID = "gqol-timeline-status";

// ---------------------------------------------------------------------------
// Mutable state
// ---------------------------------------------------------------------------

const mergeBoxAnchors = new WeakMap();
const commentBoxAnchors = new WeakMap();

let timelineMutationObserver = null;
let timelineMutationTimeout = null;

let descriptionObserver = null;

let revalidateTimeout = null;
let initialRetryTimeouts = [];
let postChangeRetryTimeouts = [];

let observedTimelineContainer = null;
let globalMutationObserver = null;
let globalObserverStartedAt = 0;

let cachedSettings = null;
let lastUrl = "";
let isApplying = false;
let isReversing = false;

let lastDescriptionNudgeAt = 0;
let timelinePhase = null; // null | "hydrating" | "reversing"
let hydrationStartedAt = 0;
let statusRefreshInterval = null;

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function isPullRequestPage() {
  return /^\/[^/]+\/[^/]+\/pull\/\d+/.test(location.pathname);
}

function getDiscussionRoot() {
  return (
    document.querySelector(DISCUSSION_SELECTOR) ??
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ??
    document.body
  );
}

function findTimelineContainer() {
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

function getTimelineItems() {
  const root =
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ??
    document.querySelector(DISCUSSION_SELECTOR) ??
    document.body;
  return [...root.querySelectorAll(TIMELINE_ITEM_SELECTOR)];
}

function getDirectTimelineItems(container) {
  return [...container.children].filter((child) =>
    child.matches(TIMELINE_ITEM_SELECTOR),
  );
}

// ---------------------------------------------------------------------------
// Lazy content hydration
// ---------------------------------------------------------------------------

function forceLazyHydration(root) {
  const descEl = getDescriptionElement();
  const descBody = descEl?.querySelector(".markdown-body, .js-comment-body");
  const preserveDescription =
    descEl && descBody && isMarkdownLoaded(descBody) && descEl.contains(descBody);

  root.querySelectorAll("batch-deferred-content").forEach((el) => {
    if (preserveDescription && descEl.contains(el)) return;
    if (el.querySelector(".markdown-body, .js-comment-body")) return;
    el.replaceWith(el.cloneNode(true));
  });

  root.querySelectorAll("include-fragment[loading='lazy']").forEach((el) => {
    if (preserveDescription && descEl.contains(el)) return;
    const src = el.getAttribute("src");
    if (!src) return;
    const clone = el.cloneNode(false);
    clone.setAttribute("src", src);
    el.replaceWith(clone);
  });
}

function schedulePostChangeRetries(container) {
  for (const timeout of postChangeRetryTimeouts) clearTimeout(timeout);
  postChangeRetryTimeouts = [];

  for (const delay of POST_CHANGE_RETRY_DELAYS) {
    postChangeRetryTimeouts.push(
      setTimeout(() => {
        forceLazyHydration(container);
        window.dispatchEvent(new Event("scroll"));
        scheduleRevalidate();
      }, delay),
    );
  }
}

function timelineHasLoadingContent(container) {
  return (
    container.querySelectorAll(SKELETON_SELECTOR).length > 0 &&
    !(
      getTimelineItems().length >= 2 &&
      allSkeletonsInsideDescription(container)
    )
  );
}

function allSkeletonsInsideDescription(container) {
  const descEl = getDescriptionElement();
  if (!descEl || !container.contains(descEl)) return false;
  const skeletons = container.querySelectorAll(SKELETON_SELECTOR);
  return skeletons.length !== 0 && [...skeletons].every((el) => descEl.contains(el));
}

function timelineNeedsHydration(container) {
  if (!container) return false;
  if (timelineHasLoadingContent(container)) return true;

  const deferred = container.querySelectorAll(
    "batch-deferred-content, include-fragment[loading]",
  );
  if (deferred.length === 0) return false;

  const descEl = getDescriptionElement();
  return !(descEl && getTimelineItems().length >= 2) ||
    ![...deferred].every((el) => descEl.contains(el));
}

// ---------------------------------------------------------------------------
// Reverse timeline
// ---------------------------------------------------------------------------

function undoReverseTimeline() {
  if (timelineMutationObserver) {
    timelineMutationObserver.disconnect();
    timelineMutationObserver = null;
  }
  if (timelineMutationTimeout) {
    clearTimeout(timelineMutationTimeout);
    timelineMutationTimeout = null;
  }

  for (const timeout of postChangeRetryTimeouts) clearTimeout(timeout);
  postChangeRetryTimeouts = [];
  observedTimelineContainer = null;
  timelinePhase = null;
  hydrationStartedAt = 0;

  document.querySelectorAll('[data-gqol-reverse="1"]').forEach((container) => {
    restoreTimelineOrder(container);
  });
}

function restoreTimelineOrder(container) {
  const savedGids = container.getAttribute("data-gqol-timeline-gids");
  const items = getDirectTimelineItems(container);

  if (savedGids) {
    const gids = savedGids.split("|");
    const byGid = new Map(
      items.map((item) => [item.getAttribute("data-gid") ?? "", item]),
    );
    for (const gid of gids) {
      const item = byGid.get(gid);
      if (item) container.appendChild(item);
    }
  } else if (container.getAttribute("data-gqol-reverse") === "1") {
    if (items.length >= 2) {
      [...items].reverse().forEach((item) => container.appendChild(item));
    }
  }

  container.removeAttribute("data-gqol-timeline-gids");
  container.removeAttribute("data-gqol-reverse");
  schedulePostChangeRetries(container);
}

function observeTimelineContainer(container) {
  if (!container) return;
  if (observedTimelineContainer === container && timelineMutationObserver) return;

  if (timelineMutationObserver) timelineMutationObserver.disconnect();

  observedTimelineContainer = container;
  timelineMutationObserver = new MutationObserver((mutations) => {
    if (container.getAttribute("data-gqol-reverse") !== "1") return;

    const addedItems = mutations
      .flatMap((mutation) => [...mutation.addedNodes])
      .filter(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          node.matches?.(TIMELINE_ITEM_SELECTOR),
      );

    if (addedItems.length === 0) return;

    if (timelineMutationTimeout) clearTimeout(timelineMutationTimeout);
    timelineMutationTimeout = setTimeout(() => {
      timelineMutationTimeout = null;
      const firstItem = getDirectTimelineItems(container)[0];
      for (const item of addedItems) {
        if (firstItem && item !== firstItem) {
          container.insertBefore(item, firstItem);
        }
      }
      schedulePostChangeRetries(container);
    }, 400);
  });

  timelineMutationObserver.observe(container, { childList: true });
}

function hydrateTimeline(container, onProgress) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    hydrationStartedAt = startedAt;

    const tick = () => {
      onProgress?.();
      if (container.isConnected && timelineHasLoadingContent(container)) {
        if (Date.now() - startedAt >= 12000) {
          resolve();
        } else {
          setTimeout(tick, 250);
        }
      } else {
        resolve();
      }
    };

    tick();
  });
}

function reverseContainer(container) {
  const items = getDirectTimelineItems(container);
  if (items.length < 2) return false;

  if (!container.hasAttribute("data-gqol-reverse")) {
    const gids = items.map((item) => item.getAttribute("data-gid") ?? "").join("|");
    container.setAttribute("data-gqol-timeline-gids", gids);
  }

  [...items].reverse().forEach((item) => container.appendChild(item));
  container.setAttribute("data-gqol-reverse", "1");
  schedulePostChangeRetries(container);
  return true;
}

async function applyReverseTimeline(enabled, settings) {
  if (!enabled) {
    undoReverseTimeline();
    clearStatus();
    return false;
  }

  const container =
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ?? findTimelineContainer();
  if (!container || getTimelineItems().length < 2) {
    updateStatus(settings);
    return false;
  }

  if (container.getAttribute("data-gqol-reverse") === "1") {
    observeTimelineContainer(container);
    updateStatus(settings);
    return true;
  }

  if (isReversing) {
    updateStatus(settings);
    return false;
  }

  isReversing = true;
  timelinePhase = "hydrating";
  updateStatus(settings);

  try {
    await hydrateTimeline(container, () => {
      updateStatus(settings);
    });

    timelinePhase = "reversing";
    updateStatus(settings);

    return reverseContainer(container)
      ? (observeTimelineContainer(container), true)
      : false;
  } finally {
    timelinePhase = null;
    hydrationStartedAt = 0;
    isReversing = false;
    updateStatus(settings);
  }
}

// ---------------------------------------------------------------------------
// Timeline status UI
// ---------------------------------------------------------------------------

function getStatusDescriptor(settings) {
  if (!settings.reverseTimeline || !isPullRequestPage()) return null;

  const container =
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ?? findTimelineContainer();
  const items = getTimelineItems();

  if (container?.getAttribute("data-gqol-reverse") === "1") return null;

  if (timelinePhase === "reversing") {
    return {
      label: "Sorting timeline newest first…",
      progress: 92,
      indeterminate: false,
    };
  }

  if (timelinePhase === "hydrating" || (container && timelineHasLoadingContent(container))) {
    const elapsed = hydrationStartedAt ? Date.now() - hydrationStartedAt : 0;
    const ratio = Math.min(1, elapsed / 12000);
    return {
      label: "Loading timeline activity…",
      progress: 34 + 48 * ratio,
      indeterminate: ratio < 0.08,
    };
  }

  return items.length < 2
    ? {
        label: "Waiting for timeline…",
        progress: items.length === 0 ? 14 : 26,
        indeterminate: true,
      }
    : container && timelineNeedsHydration(container)
      ? {
          label: "Loading deferred timeline items…",
          progress: 38,
          indeterminate: true,
        }
      : { label: "Preparing timeline…", progress: 84, indeterminate: false };
}

function clearStatus() {
  if (statusRefreshInterval) {
    clearInterval(statusRefreshInterval);
    statusRefreshInterval = null;
  }
  document.getElementById(TIMELINE_STATUS_ID)?.remove();
}

function updateStatus(settings) {
  const descriptor = getStatusDescriptor(settings);
  if (!descriptor) {
    timelinePhase = null;
    hydrationStartedAt = 0;
    clearStatus();
    return;
  }

  let statusEl = document.getElementById(TIMELINE_STATUS_ID);
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = TIMELINE_STATUS_ID;
    statusEl.className = "gqol-timeline-status";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    statusEl.innerHTML = `
    <div class="gqol-timeline-status__inner">
      <p class="gqol-timeline-status__label"></p>
      <div class="gqol-timeline-status__track" aria-hidden="true">
        <div class="gqol-timeline-status__bar"></div>
      </div>
    </div>
  `;
    document.body.appendChild(statusEl);
  }

  const labelEl = statusEl.querySelector(".gqol-timeline-status__label");
  const barEl = statusEl.querySelector(".gqol-timeline-status__bar");
  const trackEl = statusEl.querySelector(".gqol-timeline-status__track");

  if (!labelEl || !barEl || !trackEl) return;

  labelEl.textContent = descriptor.label;
  barEl.style.width = `${Math.round(Math.min(98, Math.max(8, descriptor.progress)))}%`;
  trackEl.classList.toggle(
    "gqol-timeline-status__track--indeterminate",
    descriptor.indeterminate,
  );

  if (!statusRefreshInterval) {
    statusRefreshInterval = setInterval(() => {
      getCachedSettings()
        .then((current) => updateStatus(current))
        .catch(() => {});
    }, 200);
  }
}

// ---------------------------------------------------------------------------
// PR description helpers
// ---------------------------------------------------------------------------

function getDescriptionElement() {
  const root = getDiscussionRoot();
  const direct =
    root.querySelector(PR_DESCRIPTION_TESTID_SELECTOR) ??
    root.querySelector(PR_DESCRIPTION_ID_SELECTOR);
  if (direct) return direct;

  const firstItem = getTimelineItems()[0];
  if (firstItem) {
    return (
      firstItem.querySelector(PR_DESCRIPTION_TESTID_SELECTOR) ??
      firstItem.querySelector(PR_DESCRIPTION_ID_SELECTOR) ??
      firstItem
    );
  }
  return document.querySelector(PR_DESCRIPTION_TESTID_SELECTOR);
}

function getDescriptionBody() {
  const root = getDiscussionRoot();
  const candidates = [
    root.querySelector(`${PR_DESCRIPTION_TESTID_SELECTOR} .markdown-body`),
    root.querySelector(`${PR_DESCRIPTION_TESTID_SELECTOR} .js-comment-body`),
    root.querySelector(`${PR_DESCRIPTION_ID_SELECTOR} .markdown-body`),
    root.querySelector(`${PR_DESCRIPTION_ID_SELECTOR} .js-comment-body`),
    root.querySelector('[id^="pullrequest-"] .markdown-body'),
    root.querySelector('[id^="pullrequest-"] .js-comment-body'),
  ];
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  const firstItem = getTimelineItems()[0];
  if (firstItem) {
    const body =
      firstItem.querySelector(`${PR_DESCRIPTION_TESTID_SELECTOR} .markdown-body`) ??
      firstItem.querySelector(`${PR_DESCRIPTION_TESTID_SELECTOR} .js-comment-body`) ??
      firstItem.querySelector('[id^="pullrequest-"] .markdown-body') ??
      firstItem.querySelector('[id^="pullrequest-"] .js-comment-body');
    if (body) return body;
  }

  return null;
}

function isMarkdownLoaded(body) {
  return (
    Boolean(body?.isConnected) &&
    !body.querySelector(".Skeleton") &&
    (Boolean(
      body.querySelector("img, pre, table, ul, ol, blockquote, h1, h2, h3, p"),
    ) ||
      body.textContent.trim().length > 0)
  );
}

function isDescriptionLoading(descEl) {
  if (!descEl?.isConnected) return false;
  const body = descEl.querySelector(".markdown-body, .js-comment-body");
  if (!body || !isMarkdownLoaded(body)) {
    if (body) {
      return Boolean(body.querySelector(".Skeleton"));
    }
    return Boolean(
      descEl.querySelector(
        ".Skeleton, batch-deferred-content .Skeleton, include-fragment[loading]",
      ),
    );
  }
  return false;
}

function isDescriptionBodyLoading(body) {
  if (!body?.isConnected) return true;
  if (isMarkdownLoaded(body)) return false;
  if (body.querySelector(".Skeleton")) return true;

  const descRoot =
    body.closest(
      `${PR_DESCRIPTION_TESTID_SELECTOR}, ${PR_DESCRIPTION_ID_SELECTOR}`,
    ) ?? getDescriptionElement();
  return Boolean(descRoot && isDescriptionLoading(descRoot));
}

function measureFullHeight(el) {
  if (!el?.isConnected) return 0;
  const saved = {
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
    height: el.style.height,
  };
  el.style.maxHeight = "none";
  el.style.overflow = "visible";
  el.style.height = "auto";
  const fullHeight = el.scrollHeight;
  el.style.maxHeight = saved.maxHeight;
  el.style.overflow = saved.overflow;
  el.style.height = saved.height;
  return fullHeight;
}

function isTallBody(body) {
  return measureFullHeight(body) > 144;
}

function nudgeDescription() {
  const descEl = getDescriptionElement();
  if (!descEl || descEl.querySelector(".markdown-body, .js-comment-body")) return;

  const now = Date.now();
  if (now - lastDescriptionNudgeAt < 3000) return;
  lastDescriptionNudgeAt = now;

  forceLazyHydration(descEl);
  descEl.querySelectorAll("include-fragment[src]").forEach((el) => {
    const src = el.getAttribute("src");
    if (!src) return;
    const clone = el.cloneNode(false);
    clone.setAttribute("src", src);
    el.replaceWith(clone);
  });
  window.dispatchEvent(new Event("scroll"));
}

// ---------------------------------------------------------------------------
// Collapse PR description
// ---------------------------------------------------------------------------

function undoCollapseDescription() {
  document.querySelectorAll(`.${DESC_BLOCK_CLASS}`).forEach((block) => {
    const body =
      block.querySelector(".markdown-body, .js-comment-body") ??
      block.querySelector(`.${DESC_WRAP_CLASS}`)?.firstElementChild;
    if (body) {
      body.classList.remove(DESC_COLLAPSED_CLASS);
      body.removeAttribute("data-gqol-desc-processed");
      body.removeAttribute("data-gqol-desc-expanded");
      block.replaceWith(body);
    } else {
      block.remove();
    }
  });

  document.querySelectorAll(`.${DESC_TOGGLE_CLASS}`).forEach((el) => el.remove());

  document.querySelectorAll(`.${DESC_WRAP_CLASS}`).forEach((wrap) => {
    if (wrap.closest(`.${DESC_BLOCK_CLASS}`)) return;
    const body =
      wrap.querySelector(".markdown-body, .js-comment-body") ??
      wrap.firstElementChild;
    if (body) {
      body.classList.remove(DESC_COLLAPSED_CLASS);
      body.removeAttribute("data-gqol-desc-processed");
      body.removeAttribute("data-gqol-desc-expanded");
      wrap.replaceWith(body);
    } else {
      wrap.remove();
    }
  });
}

const CHEVRON_DOWN_SVG =
  '<svg class="gqol-desc-toggle-icon" aria-hidden="true" height="16" width="16" viewBox="0 0 16 16"><path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/></svg>';
const CHEVRON_UP_SVG =
  '<svg class="gqol-desc-toggle-icon" aria-hidden="true" height="16" width="16" viewBox="0 0 16 16"><path d="M3.22 10.53a.749.749 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.06 0l4.25 4.25a.749.749 0 1 1-1.06 1.06L8 6.811 4.28 10.53a.749.749 0 0 1-1.06 0Z"/></svg>';

function renderToggleButton(button, expanded) {
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  button.innerHTML = expanded
    ? `${CHEVRON_UP_SVG}<span>Show less</span>`
    : `${CHEVRON_DOWN_SVG}<span>Show more</span>`;
}

function alignFooterText(block, body) {
  const footer = block.querySelector(`.${DESC_FOOTER_CLASS}`);
  if (!footer) return;

  const firstBlockChild =
    body.querySelector(
      ":scope > p, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3, :scope > pre, :scope > blockquote, :scope > div",
    ) ?? body;
  const blockRect = block.getBoundingClientRect();
  const indent = Math.max(
    0,
    Math.round(firstBlockChild.getBoundingClientRect().left - blockRect.left),
  );
  footer.style.paddingLeft = `${indent}px`;
  footer.style.paddingInlineStart = `${indent}px`;
}

function scrollDescriptionIntoView(target) {
  const el = target ?? getDescriptionElement() ?? getDescriptionBody();
  if (el?.isConnected) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function recheckCollapseEligibility(body) {
  return !(
    !body?.isConnected ||
    isDescriptionBodyLoading(body) ||
    !isTallBody(body) ||
    body.closest(`.${DESC_BLOCK_CLASS}`) ||
    (body.removeAttribute("data-gqol-desc-processed"), 0)
  );
}

function collapseDescription(body) {
  if (body.closest(`.${DESC_BLOCK_CLASS}`)) return true;

  if (
    body.getAttribute("data-gqol-desc-processed") === "1" &&
    !recheckCollapseEligibility(body)
  ) {
    return true;
  }

  if (isDescriptionBodyLoading(body)) return false;

  if (!isTallBody(body)) {
    requestAnimationFrame(() => {
      if (!body.isConnected || isDescriptionBodyLoading(body)) return;
      if (isTallBody(body)) {
        collapseDescription(body);
      } else {
        body.setAttribute("data-gqol-desc-processed", "1");
      }
    });
    return false;
  }

  const block = document.createElement("div");
  block.className = DESC_BLOCK_CLASS;

  const wrap = document.createElement("div");
  wrap.className = DESC_WRAP_CLASS;

  const parent = body.parentNode;
  parent?.insertBefore(block, body);
  block.appendChild(wrap);
  wrap.appendChild(body);

  body.classList.add(DESC_COLLAPSED_CLASS);
  wrap.classList.add(DESC_COLLAPSED_CLASS);
  body.setAttribute("data-gqol-desc-processed", "1");
  body.setAttribute("data-gqol-desc-expanded", "false");

  const footer = document.createElement("div");
  footer.className = DESC_FOOTER_CLASS;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = DESC_TOGGLE_CLASS;
  renderToggleButton(toggle, false);

  toggle.addEventListener("click", () => {
    const expanded = body.getAttribute("data-gqol-desc-expanded") !== "true";
    body.setAttribute("data-gqol-desc-expanded", expanded ? "true" : "false");
    block.classList.toggle("gqol-desc-block--expanded", expanded);

    if (expanded) {
      body.classList.remove(DESC_COLLAPSED_CLASS);
      wrap.classList.remove(DESC_COLLAPSED_CLASS);
    } else {
      body.classList.add(DESC_COLLAPSED_CLASS);
      wrap.classList.add(DESC_COLLAPSED_CLASS);
      requestAnimationFrame(() => scrollDescriptionIntoView(block));
    }

    renderToggleButton(toggle, expanded);
  });

  footer.appendChild(toggle);
  block.appendChild(footer);

  requestAnimationFrame(() => {
    alignFooterText(block, body);
    requestAnimationFrame(() => alignFooterText(block, body));
  });

  return true;
}

function stopDescriptionObserver() {
  descriptionObserver?.disconnect();
  descriptionObserver = null;
}

function applyCollapseDescription(enabled) {
  if (!enabled) {
    undoCollapseDescription();
    stopDescriptionObserver();
    return false;
  }

  const descEl = getDescriptionElement();
  if (descEl) {
    if (descriptionObserver) descriptionObserver.disconnect();
    descriptionObserver = new MutationObserver(() => {
      scheduleRevalidate();
    });
    descriptionObserver.observe(descEl, { childList: true, subtree: true });
  }

  nudgeDescription();

  const body = getDescriptionBody();
  if (!body || isDescriptionBodyLoading(body)) return false;

  if (isTallBody(body)) {
    return collapseDescription(body);
  }

  requestAnimationFrame(() => {
    if (body.isConnected && !isDescriptionBodyLoading(body)) {
      collapseDescription(body);
    }
  });
  return false;
}

// ---------------------------------------------------------------------------
// Merge box below description
// ---------------------------------------------------------------------------

function findMergeBox() {
  return document.querySelector(MERGEBOX_SELECTOR);
}

function findTimelineItemFor(el) {
  if (!el?.isConnected) return null;
  return (
    el.closest(".TimelineItem.js-comment-container") ??
    el.closest(TIMELINE_ITEM_SELECTOR) ??
    el.closest(".TimelineItem")
  );
}

function findDescriptionContainer() {
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

function unwrapMergeRow(row) {
  const mergeBox = row.querySelector(MERGEBOX_SELECTOR);
  if (mergeBox) {
    row.replaceWith(mergeBox);
  } else {
    row.remove();
  }
}

function stripMergeSpacingClasses(mergeBox) {
  const stripped = new Set(
    (mergeBox.getAttribute(STRIPPED_MERGE_CLASSES_ATTR) ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  for (const cls of mergeBox.classList) {
    if (STRIPPED_CLASS_PREFIXES.some((prefix) => cls.startsWith(prefix))) {
      stripped.add(cls);
      mergeBox.classList.remove(cls);
    }
  }
  if (stripped.size > 0) {
    mergeBox.setAttribute(STRIPPED_MERGE_CLASSES_ATTR, [...stripped].join(" "));
  }
}

function restoreStrippedClasses(mergeBox) {
  const attr = mergeBox.getAttribute(STRIPPED_MERGE_CLASSES_ATTR);
  if (!attr) return;
  attr
    .split(/\s+/)
    .filter(Boolean)
    .forEach((cls) => mergeBox.classList.add(cls));
  mergeBox.removeAttribute(STRIPPED_MERGE_CLASSES_ATTR);
}

function positionMergeBoxStyles(descContainer, row, mergeBox) {
  const anchorItem = findTimelineItemFor(row) ?? findTimelineItemFor(descContainer);

  if (descContainer?.isConnected && descContainer !== anchorItem) {
    descContainer.removeAttribute(MERGE_ANCHOR_ATTR);
    descContainer.style.removeProperty("--gqol-merge-timeline-gap");
  }
  if (anchorItem) anchorItem.setAttribute(MERGE_ANCHOR_ATTR, "1");

  requestAnimationFrame(() => {
    if (!row.isConnected || !mergeBox.isConnected) return;

    const mergeabilityIcon =
      mergeBox.querySelector("[data-testid='mergeability-icon-wrapper']") ??
      mergeBox.querySelector("[class*='mergeabilityIcon']");
    const rowRect = row.getBoundingClientRect();
    const avatar =
      anchorItem?.querySelector(".TimelineItem-avatar") ??
      row.closest(".pull-discussion-timeline")?.querySelector(".TimelineItem-avatar");

    if (avatar) {
      const avatarRect = avatar.getBoundingClientRect();
      const railX = avatarRect.left + avatarRect.width / 2 - rowRect.left - 1;
      row.style.setProperty(
        "--gqol-timeline-rail-x",
        `${Math.max(0, Math.round(railX))}px`,
      );
    } else {
      row.style.removeProperty("--gqol-timeline-rail-x");
    }

    if (mergeabilityIcon) {
      const iconRect = mergeabilityIcon.getBoundingClientRect();
      const centerY = iconRect.top + iconRect.height / 2 - rowRect.top;
      row.style.setProperty(
        "--gqol-merge-badge-center-y",
        `${Math.max(0, Math.round(centerY))}px`,
      );
    } else {
      row.style.removeProperty("--gqol-merge-badge-center-y");
    }

    const statusBottom = mergeBox.getBoundingClientRect().bottom - rowRect.top;
    row.style.setProperty(
      "--gqol-merge-status-bottom-y",
      `${Math.max(0, Math.round(statusBottom))}px`,
    );

    if (anchorItem?.isConnected) {
      const anchorBottom = anchorItem.getBoundingClientRect().bottom - rowRect.top;
      anchorItem.style.setProperty(
        "--gqol-merge-timeline-gap",
        `${Math.max(0, Math.round(anchorBottom))}px`,
      );
    }
  });
}

function isMergeBoxPlaced(mergeBox, descContainer) {
  const row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`) ?? mergeBox;
  return Boolean(
    descContainer &&
      mergeBox &&
      row.parentElement === descContainer &&
      descContainer.lastElementChild === row,
  );
}

function restoreMergeBox(mergeBox) {
  const row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  const node = row ?? mergeBox;
  const anchor = mergeBoxAnchors.get(mergeBox);

  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(node, anchor.nextSibling);
    anchor.remove();
  } else if (row) {
    unwrapMergeRow(row);
  }

  mergeBoxAnchors.delete(mergeBox);
  mergeBox.removeAttribute(MERGEBOX_MOVED_ATTR);
  restoreStrippedClasses(mergeBox);
  mergeBox.classList.remove(MERGEBOX_BELOW_DESC_CLASS);
  row?.style.removeProperty("--gqol-merge-badge-center-y");
  row?.style.removeProperty("--gqol-merge-status-bottom-y");
}

function restoreAllMergeBoxes() {
  document.querySelectorAll(`[${MERGEBOX_MOVED_ATTR}="1"]`).forEach((mergeBox) => {
    restoreMergeBox(mergeBox);
  });
  document.querySelectorAll(`[${MERGE_ANCHOR_ATTR}="1"]`).forEach((anchor) => {
    anchor.removeAttribute(MERGE_ANCHOR_ATTR);
    anchor.style.removeProperty("--gqol-merge-timeline-gap");
  });
  document.querySelectorAll(`.${MERGEBOX_TIMELINE_ROW_CLASS}`).forEach((row) => {
    unwrapMergeRow(row);
  });
}

function applyMergeBoxBelowDescription(enabled) {
  if (!enabled) {
    restoreAllMergeBoxes();
    return false;
  }

  const mergeBox = findMergeBox();
  const descContainer = findDescriptionContainer();
  if (!mergeBox || !descContainer) return false;

  let row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (!row) {
    row = document.createElement("div");
    row.className = MERGEBOX_TIMELINE_ROW_CLASS;
    mergeBox.parentNode?.insertBefore(row, mergeBox);
    row.appendChild(mergeBox);
  }

  if (isMergeBoxPlaced(mergeBox, descContainer)) {
    mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
    mergeBox.classList.add(MERGEBOX_BELOW_DESC_CLASS);
    stripMergeSpacingClasses(mergeBox);
    positionMergeBoxStyles(descContainer, row, mergeBox);
    return true;
  }

  if (!mergeBoxAnchors.has(mergeBox)) {
    const anchor = document.createComment("gqol-mergebox-anchor");
    row.parentNode?.insertBefore(anchor, row);
    mergeBoxAnchors.set(mergeBox, anchor);
  }

  descContainer.appendChild(row);
  mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
  mergeBox.classList.add(MERGEBOX_BELOW_DESC_CLASS);
  stripMergeSpacingClasses(mergeBox);
  positionMergeBoxStyles(descContainer, row, mergeBox);
  return true;
}

// ---------------------------------------------------------------------------
// Comment box at top
// ---------------------------------------------------------------------------

function findCommentForm() {
  const field = document.querySelector(COMMENT_FIELD_SELECTOR);
  const form = field?.closest("form");
  if (form) return form;
  return document.querySelector(COMMENT_FORM_SELECTOR);
}

/**
 * Climb from the comment form to its top-level wrapper: the section that holds
 * the whole composer and sits as a sibling of the timeline container. Stops
 * before climbing into anything that also contains the timeline items, the
 * merge box, or a known page container.
 */
function findCommentWrapper(form) {
  if (!form?.isConnected) return null;

  let node = form;
  while (node.parentElement) {
    const parent = node.parentElement;
    if (
      parent === document.body ||
      parent.matches(
        "main, [data-turbo-body], [data-turbo-permanent], .js-discussion, .pull-discussion-timeline",
      ) ||
      parent.querySelector(TIMELINE_ITEM_SELECTOR) ||
      (parent.querySelector(MERGEBOX_SELECTOR) &&
        !node.querySelector(MERGEBOX_SELECTOR))
    ) {
      break;
    }
    node = parent;
  }
  return node;
}

function isCommentBoxPlaced(wrapper, container) {
  if (!wrapper?.isConnected || wrapper.parentElement !== container) return false;
  let sibling = wrapper.previousElementSibling;
  while (sibling) {
    if (sibling.matches(TIMELINE_ITEM_SELECTOR)) return false;
    sibling = sibling.previousElementSibling;
  }
  return true;
}

function restoreCommentBox(wrapper) {
  const anchor = commentBoxAnchors.get(wrapper);
  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
    anchor.remove();
  }
  commentBoxAnchors.delete(wrapper);
  wrapper.removeAttribute(COMMENT_BOX_MOVED_ATTR);
  wrapper.classList.remove(COMMENT_BOX_AT_TOP_CLASS);
}

function restoreAllCommentBoxes() {
  document
    .querySelectorAll(`[${COMMENT_BOX_MOVED_ATTR}="1"]`)
    .forEach((wrapper) => restoreCommentBox(wrapper));
}

function applyCommentBoxAtTop(enabled) {
  if (!enabled) {
    restoreAllCommentBoxes();
    return false;
  }

  const form = findCommentForm();
  const container =
    document.querySelector(TIMELINE_PARTIAL_SELECTOR) ?? findTimelineContainer();
  if (!form || !container) return false;

  const wrapper = findCommentWrapper(form);
  if (!wrapper) return false;

  if (isCommentBoxPlaced(wrapper, container)) {
    wrapper.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
    wrapper.classList.add(COMMENT_BOX_AT_TOP_CLASS);
    return true;
  }

  if (!commentBoxAnchors.has(wrapper)) {
    const anchor = document.createComment("gqol-comment-box-anchor");
    wrapper.parentNode?.insertBefore(anchor, wrapper);
    commentBoxAnchors.set(wrapper, anchor);
  }

  const firstItem = [...container.children].find((child) =>
    child.matches(TIMELINE_ITEM_SELECTOR),
  );
  if (firstItem) {
    container.insertBefore(wrapper, firstItem);
  } else {
    container.prepend(wrapper);
  }

  wrapper.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
  wrapper.classList.add(COMMENT_BOX_AT_TOP_CLASS);
  return true;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function getCachedSettings() {
  if (cachedSettings) return cachedSettings;
  try {
    cachedSettings = await (async () => {
      try {
        const stored = (await storageGet("sync", STORAGE_KEY))[STORAGE_KEY];
        return stored && typeof stored === "object"
          ? normalizeSettings(stored)
          : { ...DEFAULT_SETTINGS };
      } catch {
        const stored = (await storageGet("local", STORAGE_KEY))[STORAGE_KEY];
        return stored && typeof stored === "object"
          ? normalizeSettings(stored)
          : { ...DEFAULT_SETTINGS };
      }
    })();
  } catch (error) {
    console.warn("GitHub QoL: could not read settings, using defaults.", error);
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

function needsWork(settings) {
  if (!isPullRequestPage()) return false;

  if (settings.reverseTimeline) {
    const container =
      document.querySelector(TIMELINE_PARTIAL_SELECTOR) ?? findTimelineContainer();
    if (getTimelineItems().length >= 2) {
      if (container && container.getAttribute("data-gqol-reverse") !== "1") {
        return true;
      }
    } else if (container && timelineNeedsHydration(container)) {
      return true;
    }
  }

  if (settings.collapsePrDescription) {
    const descEl = getDescriptionElement();
    const body = getDescriptionBody();
    if (!descEl && !body) return false;
    if (!body) return Boolean(descEl && isDescriptionLoading(descEl));
    if (isDescriptionBodyLoading(body)) return true;
    if (isTallBody(body) && !body.closest(`.${DESC_BLOCK_CLASS}`)) return true;
  }

  if (settings.showMergeBoxBelowDescription) {
    const mergeBox = findMergeBox();
    const descContainer = findDescriptionContainer();
    if (mergeBox && descContainer && !isMergeBoxPlaced(mergeBox, descContainer)) {
      return true;
    }
  }

  if (settings.commentBoxAtTop) {
    const form = findCommentForm();
    const container =
      document.querySelector(TIMELINE_PARTIAL_SELECTOR) ?? findTimelineContainer();
    if (form && container) {
      const wrapper = findCommentWrapper(form);
      if (wrapper && !isCommentBoxPlaced(wrapper, container)) return true;
    }
  }

  return false;
}

function stopGlobalObserver() {
  globalMutationObserver?.disconnect();
  globalMutationObserver = null;
  globalObserverStartedAt = 0;
}

function ensureGlobalObserver() {
  if (!isPullRequestPage()) {
    stopGlobalObserver();
    return;
  }

  getCachedSettings()
    .then((settings) => {
      if (needsWork(settings)) {
        if (!globalMutationObserver) {
          globalObserverStartedAt = Date.now();
          globalMutationObserver = new MutationObserver(() => {
            if (Date.now() - globalObserverStartedAt > 60000) {
              stopGlobalObserver();
            } else {
              scheduleRevalidate();
            }
          });
          globalMutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        }
      } else {
        stopGlobalObserver();
      }
    })
    .catch(() => {});
}

function runFeature(name, fn) {
  try {
    return fn();
  } catch (error) {
    console.warn(`GitHub QoL: ${name} failed.`, error);
    return false;
  }
}

async function applyAll() {
  if (isApplying) return false;
  isApplying = true;
  try {
    if (!isPullRequestPage()) {
      runFeature("reverse-timeline reset", undoReverseTimeline);
      runFeature("description reset", undoCollapseDescription);
      stopDescriptionObserver();
      runFeature("mergebox reset", restoreAllMergeBoxes);
      runFeature("comment-box reset", restoreAllCommentBoxes);
      stopGlobalObserver();
      clearStatus();
      document.documentElement.removeAttribute("data-gqol-active");
      return false;
    }

    document.documentElement.setAttribute("data-gqol-active", "1");
    const settings = await getCachedSettings();

    nudgeDescription();
    updateStatus(settings);

    const collapsed = runFeature("collapse-description", () =>
      applyCollapseDescription(settings.collapsePrDescription),
    );
    const mergeBoxDone = runFeature("mergebox-below-description", () =>
      applyMergeBoxBelowDescription(settings.showMergeBoxBelowDescription),
    );
    const commentBoxDone = runFeature("comment-box-at-top", () =>
      applyCommentBoxAtTop(settings.commentBoxAtTop),
    );
    const reversed = await runFeature("reverse-timeline", () =>
      applyReverseTimeline(settings.reverseTimeline, settings),
    );

    if (needsWork(settings)) {
      ensureGlobalObserver();
      updateStatus(settings);
    } else {
      stopGlobalObserver();
      updateStatus(settings);
    }

    return reversed || collapsed || mergeBoxDone || commentBoxDone;
  } finally {
    isApplying = false;
  }
}

function scheduleRevalidate() {
  if (revalidateTimeout) return;
  revalidateTimeout = setTimeout(() => {
    revalidateTimeout = null;
    applyAll().catch((error) => console.warn("GitHub QoL:", error));
  }, 600);
}

function scheduleInitialPasses() {
  for (const timeout of initialRetryTimeouts) clearTimeout(timeout);
  initialRetryTimeouts = [];

  for (const delay of INITIAL_RETRY_DELAYS) {
    initialRetryTimeouts.push(
      setTimeout(() => {
        applyAll().catch((error) => console.warn("GitHub QoL:", error));
      }, delay),
    );
  }
}

function onNavigation() {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    lastDescriptionNudgeAt = 0;
    undoReverseTimeline();
    undoCollapseDescription();
    stopDescriptionObserver();
    restoreAllMergeBoxes();
    restoreAllCommentBoxes();
    stopGlobalObserver();
  }
  scheduleInitialPasses();
  ensureGlobalObserver();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

lastUrl = location.href;
document.documentElement.setAttribute("data-gqol-loaded", "1");
scheduleInitialPasses();
ensureGlobalObserver();

document.addEventListener("turbo:load", onNavigation);
document.addEventListener("pjax:end", onNavigation);

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area !== "sync" && area !== "local") || !changes.githubQolSettings) return;
  cachedSettings = null;
  scheduleRevalidate();
});
