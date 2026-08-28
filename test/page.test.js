import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isPullRequestPage,
  pageKey,
  markNavigationAt,
  isPendingPostNavSwap,
} from "../src/js/content/page.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

// isPendingPostNavSwap: an absent feature element counts as pending work
// only while the post-navigation swap may still be in flight AND the
// conversation itself is rendered.

function buildConversation() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  container.appendChild(desc);
  for (let i = 0; i < 2; i++) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    container.appendChild(item);
  }
  document.body.appendChild(container);
  resetDomCache();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);
  history.pushState(null, "", "/owner/repo/pull/42");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isPullRequestPage", () => {
  it("accepts the conversation tab only", () => {
    history.pushState(null, "", "/owner/repo/pull/42");
    expect(isPullRequestPage()).toBe(true);
    history.pushState(null, "", "/owner/repo/pull/42/files");
    expect(isPullRequestPage()).toBe(false);
  });
});

describe("isPendingPostNavSwap", () => {
  it("is true inside the swap window when the conversation is rendered", () => {
    buildConversation();
    markNavigationAt();
    expect(isPendingPostNavSwap()).toBe(true);
  });

  it("is false when the conversation is not rendered", () => {
    document.body.innerHTML = "";
    resetDomCache();
    markNavigationAt();
    expect(isPendingPostNavSwap()).toBe(false);
  });

  it("is false once the swap window has passed", () => {
    buildConversation();
    markNavigationAt();
    vi.setSystemTime(91000);
    expect(isPendingPostNavSwap()).toBe(false);
  });
});

describe("pageKey", () => {
  it("ignores hash-only changes", () => {
    history.pushState(null, "", "/owner/repo/pull/42");
    const key = pageKey();
    history.pushState(null, "", "/owner/repo/pull/42#discussion_r1");
    expect(pageKey()).toBe(key);
  });
});
