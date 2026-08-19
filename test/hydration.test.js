import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  nudgeDescription,
  registerProtectedRegion,
  resetNudgeTimer,
  schedulePostChangeRetries,
  cancelPostChangeRetries,
  timelineHasLoadingContent,
  timelineNeedsHydration,
} from "../src/js/content/hydration.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

/**
 * nudgeDescription restarts the description's deferred content. Each
 * include-fragment must be re-created (cloned) exactly once per nudge —
 * a second synchronous clone cancels the fetch the first clone started.
 */

let cloneCount;
let originalCloneNode;

function countClones(fn) {
  const original = Node.prototype.cloneNode;
  let count = 0;
  Node.prototype.cloneNode = function (...args) {
    count++;
    return original.apply(this, args);
  };
  try {
    fn();
  } finally {
    Node.prototype.cloneNode = original;
  }
  return count;
}

function buildDescription() {
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  document.body.appendChild(desc);
  return desc;
}

beforeEach(() => {
  document.body.innerHTML = "";
  resetDomCache();
  resetNudgeTimer();
});

afterEach(() => {
  resetDomCache();
});

describe("nudgeDescription", () => {
  it("clones a lazy include-fragment exactly once per nudge", () => {
    const desc = buildDescription();
    const lazy = document.createElement("include-fragment");
    lazy.setAttribute("loading", "lazy");
    lazy.setAttribute("src", "https://github.test/description");
    desc.appendChild(lazy);

    const count = countClones(() => nudgeDescription());

    expect(count).toBe(1);
    expect(desc.querySelector("include-fragment")).not.toBe(lazy);
  });

  it("still refetches eager include-fragments once", () => {
    const desc = buildDescription();
    const eager = document.createElement("include-fragment");
    eager.setAttribute("src", "https://github.test/eager");
    desc.appendChild(eager);

    const count = countClones(() => nudgeDescription());

    expect(count).toBe(1);
    expect(desc.querySelector("include-fragment")).not.toBe(eager);
  });

  it("does nothing when the description body is already rendered", () => {
    const desc = buildDescription();
    const body = document.createElement("div");
    body.className = "markdown-body";
    body.textContent = "Already here";
    desc.appendChild(body);

    const count = countClones(() => nudgeDescription());

    expect(count).toBe(0);
  });
});

describe("timeline loading predicates", () => {
  function buildTimeline({ skeleton = false, deferred = false } = {}) {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    container.className = "js-discussion";
    for (let i = 0; i < 2; i++) {
      const item = document.createElement("div");
      item.className = "js-timeline-item";
      container.appendChild(item);
    }
    if (skeleton) {
      const host = document.createElement("div");
      host.className = "js-updatable-content";
      host.appendChild(document.createElement("div")).className = "Skeleton";
      container.appendChild(host);
    }
    if (deferred) {
      container.appendChild(document.createElement("batch-deferred-content"));
    }
    document.body.appendChild(container);
    resetDomCache();
    return container;
  }

  it("reports loading content when skeletons exist outside the description", () => {
    const container = buildTimeline({ skeleton: true });
    expect(timelineHasLoadingContent(container)).toBe(true);
  });

  it("reports no loading content on a quiet timeline", () => {
    const container = buildTimeline();
    expect(timelineHasLoadingContent(container)).toBe(false);
    expect(timelineNeedsHydration(container)).toBe(false);
  });

  it("reports hydration needed for deferred content outside the description", () => {
    const container = buildTimeline({ deferred: true });
    expect(timelineNeedsHydration(container)).toBe(true);
  });

  it("accepts a precomputed skeleton list with identical results", () => {
    const container = buildTimeline({ skeleton: true });
    const skeletons = container.querySelectorAll(
      "batch-deferred-content .Skeleton, .commit-build-statuses .Skeleton, .js-updatable-content .Skeleton",
    );
    expect(skeletons.length).toBeGreaterThan(0);
    expect(timelineHasLoadingContent(container, skeletons)).toBe(
      timelineHasLoadingContent(container),
    );
  });

  it("accepts a precomputed loading verdict in timelineNeedsHydration", () => {
    const container = buildTimeline({ deferred: true });
    expect(timelineNeedsHydration(container, false)).toBe(true);
    expect(timelineNeedsHydration(container, true)).toBe(true);
  });

  it("returns false for a missing container", () => {
    expect(timelineNeedsHydration(null)).toBe(false);
  });
});

describe("protected regions", () => {
  function deferred(parent) {
    const el = document.createElement("batch-deferred-content");
    parent.appendChild(el);
    return el;
  }

  function runRetriesOnce() {
    vi.useFakeTimers();
    try {
      schedulePostChangeRetries(document.body);
      vi.advanceTimersByTime(0);
    } finally {
      cancelPostChangeRetries();
      vi.useRealTimers();
    }
  }

  it("does not clone deferred content inside a registered region", () => {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.appendChild(container);

    const box = document.createElement("div");
    box.setAttribute("data-gqol-comment-box-moved", "1");
    container.appendChild(box);
    const protectedEl = deferred(box);

    const plain = deferred(container);

    registerProtectedRegion(() =>
      document.querySelector("[data-gqol-comment-box-moved='1']"),
    );
    runRetriesOnce();

    expect(protectedEl.isConnected).toBe(true);
    // The unprotected element WAS re-created (cloned); the protected one
    // must be the exact same node.
    expect(document.querySelector("batch-deferred-content")).toBeDefined();
    expect(box.contains(protectedEl)).toBe(true);
    expect(container.contains(plain)).toBe(false);
  });
});
