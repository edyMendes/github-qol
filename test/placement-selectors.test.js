import { describe, it, expect, beforeEach } from "vitest";
import { MARKDOWN_BODY_SELECTOR } from "../src/js/lib/selectors.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("shared selectors", () => {
  it("exposes the markdown-body selector used across modules", () => {
    expect(MARKDOWN_BODY_SELECTOR).toBe(".markdown-body, .js-comment-body");
  });
});
