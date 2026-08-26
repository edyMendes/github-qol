import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import reverseTimelineFeature, {
  timelineStatus,
} from "../src/js/content/features/reverse-timeline.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";
import { cancelPostChangeRetries } from "../src/js/content/hydration.js";
import { resetStatus } from "../src/js/content/status.js";
import { REVERSED_ATTR } from "../src/js/lib/selectors.js";

const SETTINGS = { timelineOrder: "newest" };

/**
 * Mirrors the PR conversation layout: description item plus timeline
 * items carrying gids (the exact-restore currency), one flow container.
 */
function buildPage({ itemCount = 3, skeleton = false } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

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
  container.appendChild(descWrap);

  for (let i = 1; i <= itemCount; i++) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    item.setAttribute("data-gid", String(i));
    item.textContent = `item ${i}`;
    container.appendChild(item);
  }
  if (skeleton) {
    const host = document.createElement("div");
    host.className = "js-updatable-content";
    host.appendChild(document.createElement("div")).className = "Skeleton";
    container.appendChild(host);
  }
  document.body.appendChild(container);
  resetDomCache();
  return { container };
}

function gids(container) {
  return [...container.querySelectorAll(":scope > .js-timeline-item")].map(
    (el) => el.getAttribute("data-gid"),
  );
}

beforeEach(() => {
  history.pushState(null, "", "/owner/repo/pull/42");
});

afterEach(() => {
  reverseTimelineFeature.reset();
  cancelPostChangeRetries();
  resetDomCache();
  resetStatus();
  document.body.innerHTML = "";
});

describe("reverse-timeline", () => {
  it("reverses the item order and marks the container", async () => {
    const { container } = buildPage();
    const result = await reverseTimelineFeature.apply(SETTINGS);
    expect(result).toBe(true);
    expect(gids(container)).toEqual(["3", "2", "1"]);
    expect(container.getAttribute(REVERSED_ATTR)).toBe("1");
  });

  it("reports no work once reversed", async () => {
    buildPage();
    await reverseTimelineFeature.apply(SETTINGS);
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("reports work while not reversed", () => {
    buildPage();
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(true);
  });

  it("restores the exact original order on reset", async () => {
    const { container } = buildPage();
    await reverseTimelineFeature.apply(SETTINGS);
    reverseTimelineFeature.reset();
    expect(gids(container)).toEqual(["1", "2", "3"]);
    expect(container.hasAttribute(REVERSED_ATTR)).toBe(false);
  });

  it("undoes and reports markers removed when disabled", async () => {
    const { container } = buildPage();
    await reverseTimelineFeature.apply(SETTINGS);
    const result = await reverseTimelineFeature.apply({
      timelineOrder: "oldest",
    });
    expect(result).toBe(false);
    expect(gids(container)).toEqual(["1", "2", "3"]);
  });

  it("waits for loading content up to the timeout, then reverses anyway", async () => {
    vi.useFakeTimers();
    try {
      const { container } = buildPage({ skeleton: true });
      const promise = reverseTimelineFeature.apply(SETTINGS);
      // Still loading well before the timeout: nothing reversed yet.
      await vi.advanceTimersByTimeAsync(2000);
      expect(container.hasAttribute(REVERSED_ATTR)).toBe(false);
      await vi.advanceTimersByTimeAsync(11000);
      await promise;
      expect(container.getAttribute(REVERSED_ATTR)).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("timelineStatus descriptor", () => {
  it("returns null when the feature setting is off", () => {
    buildPage();
    expect(timelineStatus({ timelineOrder: "oldest" })).toBe(null);
  });

  it("returns null once the timeline is reversed", async () => {
    buildPage();
    await reverseTimelineFeature.apply(SETTINGS);
    expect(timelineStatus(SETTINGS)).toBe(null);
  });

  it("reports waiting while fewer than two items are rendered", () => {
    buildPage({ itemCount: 1 });
    const descriptor = timelineStatus(SETTINGS);
    expect(descriptor.label).toBe("Waiting for timeline…");
    expect(descriptor.indeterminate).toBe(true);
  });

  it("reports loading while deferred content sits outside the description", () => {
    buildPage({ skeleton: true });
    const descriptor = timelineStatus(SETTINGS);
    expect(descriptor.label).toBe("Loading timeline activity…");
  });

  it("reports preparing on a quiet, not-yet-reversed timeline", () => {
    buildPage();
    const descriptor = timelineStatus(SETTINGS);
    expect(descriptor.label).toBe("Preparing timeline…");
  });
});

describe("reverse-timeline: React-era stream shape", () => {
  function buildReactPage({ itemCount = 3 } = {}) {
    document.body.innerHTML = "";
    const flow = document.createElement("div");
    flow.className = "js-discussion";

    const descGroup = document.createElement("div");
    descGroup.className = "timeline-comment-group TimelineItem-body";
    const desc = document.createElement("div");
    desc.setAttribute("data-testid", "pull-request-description");
    descGroup.appendChild(desc);
    const descWrap = document.createElement("div");
    descWrap.className = "TimelineItem js-comment-container";
    descWrap.appendChild(descGroup);
    const descPartial = document.createElement("rails-partial");
    descPartial.setAttribute(
      "data-partial-name",
      "pullRequestsConversationsRoute.Description",
    );
    descPartial.appendChild(descWrap);
    flow.appendChild(descPartial);

    const container = document.createElement("rails-partial");
    container.setAttribute(
      "data-partial-name",
      "pullRequestsConversationsRoute.Timeline",
    );
    const focus = document.createElement("div");
    focus.className =
      "js-timeline-item js-timeline-progressive-focus-container";
    const inner = document.createElement("div");
    for (let i = 1; i <= itemCount; i++) {
      const item = document.createElement("div");
      item.className = "TimelineItem";
      item.setAttribute("data-gid", String(i));
      item.textContent = `item ${i}`;
      inner.appendChild(item);
    }
    focus.appendChild(inner);
    container.appendChild(focus);
    flow.appendChild(container);

    document.body.appendChild(flow);
    resetDomCache();
    return { flow, container, inner };
  }

  it("reverses the nested .TimelineItem stream and marks its parent", async () => {
    const { inner } = buildReactPage();
    const result = await reverseTimelineFeature.apply(SETTINGS);
    expect(result).toBe(true);
    expect(inner.getAttribute(REVERSED_ATTR)).toBe("1");
    const gidsInDom = [...inner.children].map((el) =>
      el.getAttribute("data-gid"),
    );
    expect(gidsInDom).toEqual(["3", "2", "1"]);
  });

  it("reports no work after reversing the nested stream", async () => {
    buildReactPage();
    await reverseTimelineFeature.apply(SETTINGS);
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("restores the nested stream order on reset", async () => {
    const { inner } = buildReactPage();
    await reverseTimelineFeature.apply(SETTINGS);
    reverseTimelineFeature.reset();
    const gidsInDom = [...inner.children].map((el) =>
      el.getAttribute("data-gid"),
    );
    expect(gidsInDom).toEqual(["1", "2", "3"]);
    expect(inner.hasAttribute(REVERSED_ATTR)).toBe(false);
  });
});
