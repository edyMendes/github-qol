import { describe, it, expect, beforeEach } from "vitest";
import { findMovedCommentBox } from "../src/js/lib/placement.js";
import { MARKDOWN_BODY_SELECTOR } from "../src/js/lib/selectors.js";
import { COMMENT_BOX_MOVED_ATTR } from "../src/js/lib/selectors.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("findMovedCommentBox", () => {
  it("finds the direct child marked as the moved comment box", () => {
    const container = document.createElement("div");
    const box = document.createElement("div");
    box.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
    const other = document.createElement("div");
    container.append(document.createElement("div"), box, other);
    document.body.appendChild(container);

    expect(findMovedCommentBox(container)).toBe(box);
  });

  it("returns null when no direct child is marked", () => {
    const container = document.createElement("div");
    const nested = document.createElement("div");
    nested.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
    const wrapper = document.createElement("div");
    wrapper.appendChild(nested);
    container.appendChild(wrapper);
    document.body.appendChild(container);

    expect(findMovedCommentBox(container)).toBe(null);
  });

  it("returns null for a missing container", () => {
    expect(findMovedCommentBox(null)).toBe(null);
  });
});

describe("shared selectors", () => {
  it("exposes the markdown-body selector used across modules", () => {
    expect(MARKDOWN_BODY_SELECTOR).toBe(".markdown-body, .js-comment-body");
  });
});
