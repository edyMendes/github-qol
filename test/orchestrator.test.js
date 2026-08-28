import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { init, onNavigation, setReloadForTests } from "../src/js/content/orchestrator.js";
import { hasExternalMutations } from "../src/js/lib/mutations.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";
import { invalidateCachedSettings } from "../src/js/content/settings-cache.js";
import { requestRevalidate } from "../src/js/content/bus.js";
import { STORAGE_KEY, DEFAULT_SETTINGS } from "../src/js/settings.js";

/**
 * Back-navigation lifecycle: GitHub restores the cached conversation DOM
 * instantly, the first scheduled pass settles against it, and the fresh
 * server render then swaps the DOM back to native positions. The swap
 * must always trigger a compensated revalidation pass, even when it lands
 * while another pass is held in flight by timeline hydration.
 */

const PR_URL = "/owner/repo/pull/42";
const COMMITS_URL = "/owner/repo/pull/42/commits";
// Past the reverse feature's post-change retries (last revalidate ~2600ms)
// so only the global mutation observer can catch the swap.
const PRE_SWAP_DRAIN_MS = 3000;
// Covers the observer callback → 600ms revalidate debounce → 250ms settle
// probe → reapply.
const SWAP_SETTLE_MS = 1500;
// Settle probe length (must mirror SETTLE_PROBE_MS) + margin.
const PROBE_MS = 400;

/**
 * Native, unmodified GitHub conversation DOM in one flow container.
 * `options.skeleton` adds deferred content that never resolves (stale
 * fragment after back-navigation); `options.container` swaps the children
 * in place (React-style reconciliation that keeps the container element).
 */
function buildConversationDom({ skeleton = false, itemCount = 2, container = null } = {}) {
  if (!container) {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.className = "js-discussion";
    document.body.appendChild(container);
  } else {
    container.innerHTML = "";
  }

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  const descBody = document.createElement("div");
  descBody.className = "markdown-body";
  descBody.textContent = "PR description";
  desc.appendChild(descBody);
  descGroup.appendChild(desc);

  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);

  const stack = document.createElement("div");
  stack.className = "Stack";
  const mergeBox = document.createElement("div");
  mergeBox.setAttribute("data-testid", "mergebox-partial");
  stack.appendChild(mergeBox);

  const commentWrapper = document.createElement("div");
  const form = document.createElement("form");
  form.className = "js-new-comment-form";
  const field = document.createElement("textarea");
  field.id = "new_comment_field";
  form.appendChild(field);
  commentWrapper.appendChild(form);

  container.append(descWrap, stack);
  for (let i = 1; i <= itemCount; i++) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    item.setAttribute("data-gid", String(i));
    container.appendChild(item);
  }
  if (skeleton) {
    const deferred = document.createElement("div");
    deferred.className = "js-updatable-content";
    deferred.appendChild(document.createElement("div")).className = "Skeleton";
    container.appendChild(deferred);
  }
  container.appendChild(commentWrapper);

  resetDomCache();
  return { container };
}

/** Navigate away and back, ending with a settled pass on the cached DOM. */
async function navigateAwayAndBack() {
  history.pushState(null, "", COMMITS_URL);
  onNavigation();
  await vi.advanceTimersByTimeAsync(PROBE_MS);

  history.pushState(null, "", PR_URL);
  buildConversationDom(); // GitHub restores the cached conversation DOM.
  onNavigation();
  await vi.advanceTimersByTimeAsync(PROBE_MS); // First pass settles on cached DOM.
  // The fresh fetch lands a few seconds later (post-change retries spent).
  await vi.advanceTimersByTimeAsync(PRE_SWAP_DRAIN_MS);
}

/** bfcache restore signal: pageshow with persisted=true. */
function persistedPageshow() {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  return event;
}

describe("hasExternalMutations", () => {
  const record = (target) => ({ target });

  it("ignores mutations inside extension-owned UI (status card, sort row)", () => {
    const status = document.createElement("div");
    status.id = "gqol-timeline-status";
    const label = document.createElement("p");
    status.appendChild(label);
    const sortRow = document.createElement("div");
    sortRow.className = "gqol-sort-row";

    expect(hasExternalMutations([record(label), record(sortRow)])).toBe(false);
  });

  it("revalidates on GitHub-owned mutations even alongside owned ones", () => {
    const timeline = document.createElement("div");
    timeline.className = "js-discussion";
    const sortLabel = document.createElement("span");
    sortLabel.className = "gqol-sort-button__label";

    expect(hasExternalMutations([record(sortLabel), record(timeline)])).toBe(true);
  });

  it("treats non-element targets (text nodes, documents) as external", () => {
    expect(hasExternalMutations([record(document)])).toBe(true);
  });
});

/** GitHub swaps the cached DOM for the fresh server render. */
function swapInFreshRender() {
  buildConversationDom();
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  globalThis.__resetChromeStorage();
  invalidateCachedSettings();
  sessionStorage.clear();
});

afterEach(async () => {
  // Drain every pending pass on a non-PR URL so nothing leaks between tests.
  history.pushState(null, "", COMMITS_URL);
  onNavigation();
  await vi.advanceTimersByTimeAsync(45001);
  document.body.innerHTML = "";
  resetDomCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("orchestrator reapply lifecycle after back-navigation", () => {
  it("tears everything down when the master toggle turns off, and re-applies when it flips back on", async () => {
    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();
    expect(document.documentElement.getAttribute("data-gqol-active")).toBe("1");

    // Toggle off via storage (what the popup's switch writes) — the
    // storage listener invalidates the cache and revalidates.
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { ...DEFAULT_SETTINGS, enabled: false },
    });
    invalidateCachedSettings();
    requestRevalidate();
    await vi.advanceTimersByTimeAsync(1000);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).toBeNull();
    expect(document.querySelector("[data-gqol-reverse]")).toBeNull();
    expect(document.documentElement.getAttribute("data-gqol-active")).toBeNull();

    // Toggle back on: the revalidate pass applies everything again.
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { ...DEFAULT_SETTINGS },
    });
    invalidateCachedSettings();
    requestRevalidate();
    await vi.advanceTimersByTimeAsync(PROBE_MS + 1000);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();
    expect(document.documentElement.getAttribute("data-gqol-active")).toBe("1");
  });

  it("re-applies the merge box and comment box when the fresh render swaps the cached page", async () => {
    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();

    await navigateAwayAndBack();
    swapInFreshRender();
    await vi.advanceTimersByTimeAsync(SWAP_SETTLE_MS);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();
  });

  it("re-applies only the merge box in oldest-first mode", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: {
        ...DEFAULT_SETTINGS,
        timelineOrder: "oldest",
        sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"],
      },
    });

    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).toBeNull();

    await navigateAwayAndBack();
    swapInFreshRender();
    await vi.advanceTimersByTimeAsync(SWAP_SETTLE_MS);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).toBeNull();
  });

  it("re-applies when the fresh render lands inside a hydration hold that swallows every pass", async () => {
    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS); // Applies and settles; ladder retired.

    // First fresh render: a NEW container whose deferred content never
    // resolves — the revalidation pass enters a hydration hold on it.
    const { container } = buildConversationDom({ skeleton: true });
    await vi.advanceTimersByTimeAsync(SWAP_SETTLE_MS); // Pass → hold begins.

    // While held, the render finishes IN PLACE with still-unresolved
    // deferred content: further passes are dropped until the 12s timeout.
    buildConversationDom({ skeleton: true, itemCount: 1, container });
    await vi.advanceTimersByTimeAsync(13000);

    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();
  });

  it("forces a full teardown/reapply cycle on bfcache restores (pageshow persisted)", async () => {
    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();

    window.dispatchEvent(persistedPageshow());

    // The persisted restore bypasses the page-key guard: the synchronous
    // teardown strips the moves before the scheduled passes re-apply them.
    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBeNull();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();
  });

  it("defers the apply pass while GitHub is still swapping the DOM (settle probe)", async () => {
    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();

    // GitHub's restore reconciliation mutates inside the first probe
    // window; the delay-0 pass must not touch the DOM mid-swap.
    setTimeout(() => {
      const noise = document.createElement("div");
      noise.className = "js-timeline-item";
      document.body.appendChild(noise);
    }, 100);

    await vi.advanceTimersByTimeAsync(1500);
    // Once quiet, a later pass applied the moves.
    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();
  });

  it("reloads once when applied elements vanish with the DOM settled (corruption recovery)", async () => {
    const reload = vi.fn();
    setReloadForTests(reload);

    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS); // Applied; mergeBox seen.
    expect(document.querySelector(".gqol-mergebox-timeline-row")).not.toBeNull();

    // React unmounts the merge box subtree (the corrupted end state).
    document.querySelector(".gqol-mergebox-timeline-row").remove();

    await vi.advanceTimersByTimeAsync(50000);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("gqol-reloaded:/owner/repo/pull/42")).toBe("1");
  });

  it("reloads when the seen comment form vanishes with the DOM settled", async () => {
    const reload = vi.fn();
    setReloadForTests(reload);

    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(document.querySelector(".gqol-comment-box-at-top")).not.toBeNull();

    // The whole comment form wrapper disappears (React unmount).
    document.querySelector("[data-gqol-comment-box-moved='1']").remove();

    await vi.advanceTimersByTimeAsync(50000);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the status provider registered across non-PR teardowns", async () => {
    history.pushState(null, "", PR_URL);
    buildConversationDom({ skeleton: true });
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(document.getElementById("gqol-timeline-status")).not.toBeNull();

    // Let the hydration hold time out so the in-flight pass completes.
    await vi.advanceTimersByTimeAsync(13000);

    // Tab switch away: the non-PR teardown clears the card…
    history.pushState(null, "", COMMITS_URL);
    onNavigation();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(document.getElementById("gqol-timeline-status")).toBeNull();

    // …and back: the progress card must still be able to appear.
    history.pushState(null, "", PR_URL);
    buildConversationDom({ skeleton: true });
    onNavigation();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.getElementById("gqol-timeline-status")).not.toBeNull();
  });

  it("prunes old recovery markers so sessionStorage stays bounded", async () => {
    const reload = vi.fn();
    setReloadForTests(reload);

    // Simulate a long session: many pages already used their one reload.
    for (let i = 0; i < 30; i++) {
      sessionStorage.setItem(`gqol-reloaded:/owner/repo/pull/${i}`, "1");
    }

    history.pushState(null, "", PR_URL);
    buildConversationDom();
    init();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    document.querySelector(".gqol-mergebox-timeline-row").remove();
    await vi.advanceTimersByTimeAsync(50000);

    expect(reload).toHaveBeenCalledTimes(1);
    const keys = Object.keys(sessionStorage).filter((k) =>
      k.startsWith("gqol-reloaded:"),
    );
    expect(keys.length).toBeLessThanOrEqual(20);
    expect(sessionStorage.getItem("gqol-reloaded:/owner/repo/pull/42")).toBe("1");
  });
});
