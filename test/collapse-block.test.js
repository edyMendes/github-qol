import { describe, it, expect, beforeEach } from "vitest";
import {
  COLLAPSE_FOOTER_CLASS,
  createCollapseBlock,
  unwrapAllCollapseBlocks,
} from "../src/js/content/collapse-block.js";

const EXPANDED_ATTR = "data-gqol-test-expanded";

function buildBody() {
  const body = document.createElement("div");
  body.className = "markdown-body";
  body.textContent = "tall body";
  document.body.appendChild(body);
  return body;
}

function toggleIn(block) {
  return block.querySelector(`.${COLLAPSE_FOOTER_CLASS} .gqol-btn`);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collapse block", () => {
  it("builds a Primer-structured toggle with stable classes", () => {
    const body = buildBody();
    const block = createCollapseBlock(body, {
      expandedAttr: EXPANDED_ATTR,
      toggleClass: "gqol-hook",
    });
    const button = toggleIn(block);
    expect(button).not.toBeNull();
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

  it("flips label and aria state through the toggle", () => {
    const body = buildBody();
    const block = createCollapseBlock(body, { expandedAttr: EXPANDED_ATTR });
    const button = toggleIn(block);

    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.querySelector("[data-component='text']").textContent).toBe(
      "Show less",
    );

    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector("[data-component='text']").textContent).toBe(
      "Show more",
    );
  });

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

    expect(block.classList.contains("gqol-collapse-block")).toBe(true);
    expect(block.classList.contains("gqol-block-hook")).toBe(true);
    const wrap = block.querySelector(".gqol-collapse-wrap");
    expect(wrap.classList.contains("gqol-wrap-hook")).toBe(true);
    expect(wrap.contains(body)).toBe(true);
    expect(body.classList.contains("gqol-collapse-collapsed")).toBe(true);
    expect(body.classList.contains("gqol-collapsed-hook")).toBe(true);
    expect(body.getAttribute(EXPANDED_ATTR)).toBe("false");

    const button = toggleIn(block);
    button.click();
    expect(toggled).toBe(true);
  });

  it("expands and re-collapses through the toggle", () => {
    const body = buildBody();
    const block = createCollapseBlock(body, {
      expandedAttr: EXPANDED_ATTR,
      onToggle: () => {},
    });
    const button = toggleIn(block);

    button.click();
    expect(body.getAttribute(EXPANDED_ATTR)).toBe("true");
    expect(body.classList.contains("gqol-collapse-collapsed")).toBe(false);
    expect(block.classList.contains("gqol-collapse-block--expanded")).toBe(true);

    button.click();
    expect(body.getAttribute(EXPANDED_ATTR)).toBe("false");
    expect(body.classList.contains("gqol-collapse-collapsed")).toBe(true);
  });

  it("unwrap restores the body and strips state", () => {
    const body = buildBody();
    const block = createCollapseBlock(body, { expandedAttr: EXPANDED_ATTR });

    unwrapAllCollapseBlocks({
      blockSelector: ".gqol-collapse-block",
      wrapSelector: ".gqol-collapse-wrap",
      expandedAttr: EXPANDED_ATTR,
      bodySelector: ".markdown-body",
    });

    expect(document.querySelector(".gqol-collapse-block")).toBeNull();
    expect(body.isConnected).toBe(true);
    expect(body.parentElement).toBe(document.body);
    expect(body.classList.contains("gqol-collapse-collapsed")).toBe(false);
    expect(body.hasAttribute(EXPANDED_ATTR)).toBe(false);
  });
});
