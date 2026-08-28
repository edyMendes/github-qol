import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import reverseTimelineFeature from "../src/js/content/features/reverse-timeline.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";
import { cancelPostChangeRetries } from "../src/js/content/hydration.js";
import {
  clearStatusCard,
  setProgressProvider,
} from "../src/js/content/status.js";
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
  setProgressProvider(null);
  clearStatusCard();
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
    expect(reverseTimelineFeature.status({ timelineOrder: "oldest" })).toBe(null);
  });

  it("returns null once the timeline is reversed", async () => {
    buildPage();
    await reverseTimelineFeature.apply(SETTINGS);
    expect(reverseTimelineFeature.status(SETTINGS)).toBe(null);
  });

  it("reports waiting while fewer than two items are rendered", () => {
    buildPage({ itemCount: 1 });
    const descriptor = reverseTimelineFeature.status(SETTINGS);
    expect(descriptor.label).toBe("Waiting for timeline…");
    expect(descriptor.indeterminate).toBe(true);
  });

  it("reports loading while deferred content sits outside the description", () => {
    buildPage({ skeleton: true });
    const descriptor = reverseTimelineFeature.status(SETTINGS);
    expect(descriptor.label).toBe("Loading timeline activity…");
  });

  it("reports preparing on a quiet, not-yet-reversed timeline", () => {
    buildPage();
    const descriptor = reverseTimelineFeature.status(SETTINGS);
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

  it("applies VISUAL reversal to the nested .TimelineItem stream", async () => {
    const { inner } = buildReactPage();
    const result = await reverseTimelineFeature.apply(SETTINGS);
    expect(result).toBe(true);
    // React-owned DOM: document order must be untouched; the display
    // flips via the reversal class (column-reverse).
    expect(inner.classList.contains("gqol-timeline-reversed")).toBe(true);
    expect(inner.getAttribute(REVERSED_ATTR)).toBe("1");
    const gidsInDom = [...inner.children].map((el) =>
      el.getAttribute("data-gid"),
    );
    expect(gidsInDom).toEqual(["1", "2", "3"]);
  });

  it("reports no work after visual reversal", async () => {
    buildReactPage();
    await reverseTimelineFeature.apply(SETTINGS);
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(false);
  });

  it("undo removes the visual reversal without touching order", async () => {
    const { inner } = buildReactPage();
    await reverseTimelineFeature.apply(SETTINGS);
    reverseTimelineFeature.reset();
    const gidsInDom = [...inner.children].map((el) =>
      el.getAttribute("data-gid"),
    );
    expect(gidsInDom).toEqual(["1", "2", "3"]);
    expect(inner.classList.contains("gqol-timeline-reversed")).toBe(false);
    expect(inner.hasAttribute(REVERSED_ATTR)).toBe(false);
  });

  it("re-heals when React wipes the class but leaves the attribute", async () => {
    const { inner } = buildReactPage();
    await reverseTimelineFeature.apply(SETTINGS);
    inner.classList.remove("gqol-timeline-reversed");
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(true);
    await reverseTimelineFeature.apply(SETTINGS);
    expect(inner.classList.contains("gqol-timeline-reversed")).toBe(true);
  });
});

describe("reverse-timeline: grouped React stream (comments + commit log)", () => {
  function buildGroupedPage() {
    document.body.innerHTML = "";
    const flow = document.createElement("div");
    flow.className = "js-discussion";

    const container = document.createElement("rails-partial");
    container.setAttribute(
      "data-partial-name",
      "pullRequestsConversationsRoute.Timeline",
    );
    const region = document.createElement("div");

    const logGroup = document.createElement("div");
    const logItem = document.createElement("div");
    logItem.className = "TimelineItem";
    logItem.textContent = "added 19 commits";
    logGroup.appendChild(logItem);

    const commentsGroup = document.createElement("div");
    for (let i = 1; i <= 3; i++) {
      const item = document.createElement("div");
      item.className = "TimelineItem";
      item.setAttribute("data-gid", String(i));
      item.textContent = `comment ${i}`;
      commentsGroup.appendChild(item);
    }

    region.append(logGroup, commentsGroup);
    container.appendChild(region);
    flow.appendChild(container);
    document.body.appendChild(flow);
    resetDomCache();
    return { flow, container, region, logGroup, commentsGroup };
  }

  it("classes the region AND every group; document order untouched", async () => {
    const { region, logGroup, commentsGroup } = buildGroupedPage();
    const result = await reverseTimelineFeature.apply(SETTINGS);
    expect(result).toBe(true);
    for (const holder of [region, logGroup, commentsGroup]) {
      expect(holder.classList.contains("gqol-timeline-reversed")).toBe(true);
      expect(holder.getAttribute(REVERSED_ATTR)).toBe("1");
    }
    // React-owned DOM: no node moves.
    expect(region.children[0]).toBe(logGroup);
    expect(region.children[1]).toBe(commentsGroup);
    expect(logGroup.children[0].textContent).toBe("added 19 commits");
  });

  it("heals a group GitHub streams in after the first apply", async () => {
    const { container, region, commentsGroup } = buildGroupedPage();
    await reverseTimelineFeature.apply(SETTINGS);
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(false);

    // A new review group lands inside the region, unclassed.
    const reviewGroup = document.createElement("div");
    const reviewItem = document.createElement("div");
    reviewItem.className = "TimelineItem";
    reviewItem.textContent = "approved";
    reviewGroup.appendChild(reviewItem);
    region.insertBefore(reviewGroup, commentsGroup);
    resetDomCache();

    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(true);
    await reverseTimelineFeature.apply(SETTINGS);
    expect(reviewGroup.classList.contains("gqol-timeline-reversed")).toBe(true);
    expect(container.classList.contains("gqol-timeline-reversed")).toBe(false);
  });

  it("undo removes every class and attribute without touching order", async () => {
    const { region, logGroup, commentsGroup } = buildGroupedPage();
    await reverseTimelineFeature.apply(SETTINGS);
    reverseTimelineFeature.reset();
    for (const holder of [region, logGroup, commentsGroup]) {
      expect(holder.classList.contains("gqol-timeline-reversed")).toBe(false);
      expect(holder.hasAttribute(REVERSED_ATTR)).toBe(false);
    }
    expect(region.children[0]).toBe(logGroup);
    expect(region.children[1]).toBe(commentsGroup);
  });
});

describe("reverse-timeline: commit rollup rows inside the log group", () => {
  function buildRollupPage() {
    document.body.innerHTML = "";
    const flow = document.createElement("div");
    flow.className = "js-discussion";

    const container = document.createElement("rails-partial");
    container.setAttribute(
      "data-partial-name",
      "pullRequestsConversationsRoute.Timeline",
    );
    const region = document.createElement("div");

    const logGroup = document.createElement("div");
    const logItem = document.createElement("div");
    logItem.className = "TimelineItem";
    // Realistic shape: a body wrapper between the item and the list —
    // the flip must land on the ROW LIST, never the wrapper (which also
    // contains the header).
    const bodyWrapper = document.createElement("div");
    const header = document.createElement("div");
    header.textContent = "edyMendes added 20 commits 3 days ago";
    const rowList = document.createElement("div");
    const shas = [
      "7e85c67", "c989b10", "cf22578", "1d40ec7", "47122fe", "8339203",
    ];
    for (const sha of shas) {
      const row = document.createElement("div");
      const title = document.createElement("span");
      title.textContent = `commit ${sha}`;
      const chip = document.createElement("span");
      chip.textContent = sha;
      row.append(title, chip);
      rowList.appendChild(row);
    }
    bodyWrapper.append(header, rowList);
    logItem.appendChild(bodyWrapper);
    logGroup.appendChild(logItem);

    const commentsGroup = document.createElement("div");
    for (let i = 1; i <= 2; i++) {
      const item = document.createElement("div");
      item.className = "TimelineItem";
      item.setAttribute("data-gid", String(i));
      item.textContent = `comment ${i}`;
      commentsGroup.appendChild(item);
    }

    region.append(logGroup, commentsGroup);
    container.appendChild(region);
    flow.appendChild(container);
    document.body.appendChild(flow);
    resetDomCache();
    return { region, logGroup, logItem, bodyWrapper, rowList, commentsGroup };
  }

  it("flips the rollup row list without moving any nodes", async () => {
    const { region, logGroup, bodyWrapper, rowList } = buildRollupPage();
    const result = await reverseTimelineFeature.apply(SETTINGS);
    expect(result).toBe(true);
    for (const holder of [region, logGroup, rowList]) {
      expect(holder.classList.contains("gqol-timeline-reversed")).toBe(true);
      expect(holder.getAttribute(REVERSED_ATTR)).toBe("1");
    }
    // The body wrapper also carries the header — it must NOT flip.
    expect(bodyWrapper.classList.contains("gqol-timeline-reversed")).toBe(false);
    // Document order untouched (React owns these nodes).
    const shasInDom = [...rowList.querySelectorAll("span")]
      .filter((el) => /^[0-9a-f]{7}$/.test(el.textContent))
      .map((el) => el.textContent);
    expect(shasInDom[0]).toBe("7e85c67");
    expect(shasInDom.at(-1)).toBe("8339203");
  });

  it("undo unstyles the rollup list too", async () => {
    const { rowList } = buildRollupPage();
    await reverseTimelineFeature.apply(SETTINGS);
    reverseTimelineFeature.reset();
    expect(rowList.classList.contains("gqol-timeline-reversed")).toBe(false);
    expect(rowList.hasAttribute(REVERSED_ATTR)).toBe(false);
  });

  it("re-heals when React wipes the rollup class", async () => {
    const { rowList } = buildRollupPage();
    await reverseTimelineFeature.apply(SETTINGS);
    rowList.classList.remove("gqol-timeline-reversed");
    expect(reverseTimelineFeature.needsWork(SETTINGS)).toBe(true);
    await reverseTimelineFeature.apply(SETTINGS);
    expect(rowList.classList.contains("gqol-timeline-reversed")).toBe(true);
  });

  it("never flips SHA-looking code inside comment markdown", async () => {
    const { commentsGroup } = buildRollupPage();
    // A comment quoting two SHAs in a code block — like the rollup, but
    // living in a comment item, not a commits-log item.
    const comment = commentsGroup.children[0];
    const md = document.createElement("div");
    for (const sha of ["abc1234", "def5678"]) {
      const p = document.createElement("p");
      const code = document.createElement("code");
      code.textContent = sha;
      p.appendChild(code);
      md.appendChild(p);
    }
    comment.appendChild(md);
    resetDomCache();

    await reverseTimelineFeature.apply(SETTINGS);
    expect(md.classList.contains("gqol-timeline-reversed")).toBe(false);
    expect(comment.classList.contains("gqol-timeline-reversed")).toBe(false);
    expect(commentsGroup.classList.contains("gqol-timeline-reversed")).toBe(true);
  });
});
