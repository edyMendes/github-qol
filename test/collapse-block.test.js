import { describe, it, expect, beforeEach } from "vitest";
import {
  buildToggleButton,
  COLLAPSE_BLOCK_CLASS,
  COLLAPSE_COLLAPSED_CLASS,
  COLLAPSE_FOOTER_CLASS,
  COLLAPSE_WRAP_CLASS,
  createCollapseBlock,
  renderToggleButton,
  unwrapCollapseBlock,
} from "../src/js/content/collapse-block.js";

const EXPANDED_ATTR = "data-gqol-test-expanded";

function buildBody() {
  const body = document.createElement("div");
  body.className = "markdown-body";
  body.textContent = "tall body";
  document.body.appendChild(body);
  return body;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("buildToggleButton", () => {
  it("mirrors GitHub's Primer button structure with stable classes", () => {
    const button = buildToggleButton({ toggleClass: "gqol-hook" });
    expect(button.dataset.component).toBe("Button");
    expect(button.dataset.size).toBe("small");
    expect(button.dataset.variant).toBe("default");
    expect(button.classList.contains("gqol-btn")).toBe(true);
    expect(button.classList.contains("gqol-hook")).toBe(true);

    const content = button.querySelector("[data-component='buttonContent']");
    const visual = button.querySelector("[data-component='leadingVisual']");
    const label = button.querySelector("[data-component='text']");
    expect(content).not.toBeNull();
    expect(visual).not.toBeNull();
    expect(label?.textContent).toBe("Show more");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("flips label, chevron and aria state on renderToggleButton", () => {
    const button = buildToggleButton({ expanded: true });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.querySelector("[data-component='text']").textContent).toBe(
      "Show less",
    );
    renderToggleButton(button, false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector("[data-component='text']").textContent).toBe(
      "Show more",
    );
  });
});

describe("createCollapseBlock", () => {
  it("wraps the body in block > wrap and collapses it", () => {
    const body = buildBody();
    let toggled = null;
    const block = createCollapseBlock(body, {
      expandedAttr: EXPANDED_ATTR,
      toggleClass: "gqol-hook",
      blockHookClass: "gqol-block-hook",
      wrapHookClass: "gqol-wrap-hook",
      collapsedHookClass: "gqol-collapsed-hook",
      onToggle: (expanded) => {
        toggled = expanded;
      },
    });

    expect(block.classList.contains(COLLAPSE_BLOCK_CLASS)).toBe(true);
    expect(block.classList.contains("gqol-block-hook")).toBe(true);
    const wrap = block.querySelector(`.${COLLAPSE_WRAP_CLASS}`);
    expect(wrap.classList.contains("gqol-wrap-hook")).toBe(true);
    expect(wrap.contains(body)).toBe(true);
    expect(body.classList.contains(COLLAPSE_COLLAPSED_CLASS)).toBe(true);
    expect(body.classList.contains("gqol-collapsed-hook")).toBe(true);
    expect(body.getAttribute(EXPANDED_ATTR)).toBe("false");
    expect(block.querySelector(`.${COLLAPSE_FOOTER_CLASS} .gqol-btn`)).not.toBeNull();
  });

  it("expands and re-collapses through the toggle, firing onToggle", () => {
    const body = buildBody();
    const block = createCollapseBlock(body, {
      expandedAttr: EXPANDED_ATTR,
      onToggle: () => {},
    });
    const toggle = block.querySelector(".gqol-btn");

    toggle.click();
    expect(body.getAttribute(EXPANDED_ATTR)).toBe("true");
    expect(body.classList.contains(COLLAPSE_COLLAPSED_CLASS)).toBe(false);
    expect(block.classList.contains("gqol-collapse-block--expanded")).toBe(true);

    toggle.click();
    expect(body.getAttribute(EXPANDED_ATTR)).toBe("false");
    expect(body.classList.contains(COLLAPSE_COLLAPSED_CLASS)).toBe(true);
  });

  it("unwrapCollapseBlock restores the body and strips state", () => {
    const body = buildBody();
    const block = createCollapseBlock(body, { expandedAttr: EXPANDED_ATTR });
    const restored = unwrapCollapseBlock(block, {
      expandedAttr: EXPANDED_ATTR,
      bodySelector: ".markdown-body",
    });

    expect(restored).toBe(body);
    expect(body.isConnected).toBe(true);
    expect(body.parentElement).toBe(document.body);
    expect(body.classList.contains(COLLAPSE_COLLAPSED_CLASS)).toBe(false);
    expect(body.hasAttribute(EXPANDED_ATTR)).toBe(false);
  });
});
