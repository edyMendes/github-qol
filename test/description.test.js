import { describe, it, expect, beforeEach } from "vitest";
import {
  isMarkdownLoaded,
  isDescriptionLoading,
  isDescriptionBodyLoading,
  isTallBody,
} from "../src/js/content/description.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

beforeEach(() => {
  document.body.innerHTML = "";
  resetDomCache();
});

function bodyWith(content) {
  const body = document.createElement("div");
  body.className = "markdown-body";
  if (typeof content === "string") {
    body.textContent = content;
  } else if (content) {
    body.appendChild(content);
  }
  document.body.appendChild(body);
  return body;
}

describe("isMarkdownLoaded", () => {
  it("is true for rendered text content", () => {
    expect(isMarkdownLoaded(bodyWith("Hello world"))).toBe(true);
  });

  it("is true for structural content even without text", () => {
    expect(isMarkdownLoaded(bodyWith(document.createElement("pre")))).toBe(true);
  });

  it("is false while skeletons remain", () => {
    const body = bodyWith("");
    const skeleton = document.createElement("div");
    skeleton.className = "Skeleton";
    body.appendChild(skeleton);
    expect(isMarkdownLoaded(body)).toBe(false);
  });

  it("is false for disconnected or missing bodies", () => {
    expect(isMarkdownLoaded(null)).toBe(false);
    const orphan = document.createElement("div");
    orphan.className = "markdown-body";
    orphan.textContent = "x";
    expect(isMarkdownLoaded(orphan)).toBe(false);
  });
});

describe("isDescriptionLoading", () => {
  function description(children) {
    const desc = document.createElement("div");
    desc.setAttribute("data-testid", "pull-request-description");
    for (const child of children) desc.appendChild(child);
    document.body.appendChild(desc);
    return desc;
  }

  it("is false for a fully rendered description", () => {
    const body = bodyWith("All good");
    const desc = description([body]);
    expect(isDescriptionLoading(desc)).toBe(false);
  });

  it("is true when the body still shows skeletons", () => {
    const body = bodyWith("");
    body.appendChild(document.createElement("div")).className = "Skeleton";
    const desc = description([body]);
    expect(isDescriptionLoading(desc)).toBe(true);
  });

  it("is true while only a skeleton placeholder exists (no body)", () => {
    const skeleton = document.createElement("div");
    skeleton.className = "Skeleton";
    const desc = description([skeleton]);
    expect(isDescriptionLoading(desc)).toBe(true);
  });

  it("is false for a disconnected element", () => {
    const desc = document.createElement("div");
    expect(isDescriptionLoading(desc)).toBe(false);
  });
});

describe("isDescriptionBodyLoading", () => {
  it("treats a missing body as loading", () => {
    expect(isDescriptionBodyLoading(null)).toBe(true);
  });

  it("is false once the markdown is rendered", () => {
    expect(isDescriptionBodyLoading(bodyWith("rendered"))).toBe(false);
  });
});

describe("isTallBody", () => {
  it("restores constrained inline styles even when measurement throws", () => {
    const body = bodyWith("tall content");
    body.style.maxHeight = "100px";
    body.style.overflow = "hidden";
    Object.defineProperty(body, "scrollHeight", {
      get() {
        throw new Error("reflow failed");
      },
    });

    expect(() => isTallBody(body)).toThrow("reflow failed");
    // The lift must be rolled back — the page keeps its styles.
    expect(body.style.maxHeight).toBe("100px");
    expect(body.style.overflow).toBe("hidden");
  });
});
