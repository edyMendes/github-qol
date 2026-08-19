import { describe, it, expect, beforeEach } from "vitest";
import { anchorBefore, restoreAtAnchor } from "../src/js/lib/anchor.js";

/** Shared anchor move/restore primitive used by the mergebox and
 * comment-box features: a comment node marks the original spot so the
 * element can return exactly, even after the neighbourhood moved. */

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("anchor", () => {
  it("restores the element at its original position", () => {
    const parent = document.createElement("div");
    const a = document.createElement("span");
    const el = document.createElement("b");
    const c = document.createElement("span");
    parent.append(a, el, c);
    document.body.appendChild(parent);

    const anchors = new WeakMap();
    anchorBefore(anchors, el, el, "test-anchor");
    expect(anchors.get(el).textContent).toBe("test-anchor");

    document.body.appendChild(el); // move away
    expect(restoreAtAnchor(anchors, el, el)).toBe(true);
    expect([...parent.children]).toEqual([a, el, c]);
  });

  it("keys and reference can differ (restore a different element)", () => {
    const parent = document.createElement("div");
    const key = document.createElement("i");
    const row = document.createElement("div");
    const unit = document.createElement("u");
    row.appendChild(unit);
    parent.appendChild(row);
    document.body.appendChild(parent);

    const anchors = new WeakMap();
    anchorBefore(anchors, key, row, "row-anchor");

    expect(restoreAtAnchor(anchors, key, unit)).toBe(true);
    expect(unit.parentElement).toBe(parent);
    expect(row.isConnected).toBe(true); // row removal is the caller's job
    expect(anchors.has(key)).toBe(false);
  });

  it("creates the anchor only once per key", () => {
    const parent = document.createElement("div");
    const el = document.createElement("b");
    parent.appendChild(el);
    document.body.appendChild(parent);

    const anchors = new WeakMap();
    anchorBefore(anchors, el, el, "a1");
    const first = anchors.get(el);
    el.remove();
    parent.appendChild(el);
    anchorBefore(anchors, el, el, "a2");
    expect(anchors.get(el)).toBe(first);
    expect(parent.textContent).not.toContain("a2");
  });

  it("reports false and clears the entry when the anchor is detached", () => {
    const el = document.createElement("b");
    document.body.appendChild(el);
    const anchors = new WeakMap();
    anchorBefore(anchors, el, el, "gone");
    document.body.innerHTML = "";

    expect(restoreAtAnchor(anchors, el, el)).toBe(false);
    expect(anchors.has(el)).toBe(false);
  });
});
