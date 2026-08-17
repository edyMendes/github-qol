import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  nudgeDescription,
  resetNudgeTimer,
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
