/**
 * Shared collapsible-block mechanics for markdown bodies (PR
 * description, timeline comments). Builds the Primer-structured Show
 * more / Show less toggle and the block/wrap skeleton; features pass
 * their own marker attribute, hook classes (for tests/scoping) and a
 * per-toggle callback for behavior beyond the generic expand/collapse.
 */

import { chevronDownIcon, chevronUpIcon } from "../lib/icons.js";

const COLLAPSE_BLOCK_CLASS = "gqol-collapse-block";
const COLLAPSE_WRAP_CLASS = "gqol-collapse-wrap";
const COLLAPSE_COLLAPSED_CLASS = "gqol-collapse-collapsed";
export const COLLAPSE_FOOTER_CLASS = "gqol-collapse-footer";
const COLLAPSE_EXPANDED_CLASS = "gqol-collapse-block--expanded";

const BTN_ICON_CLASS = "gqol-btn__icon";

/**
 * The Show more / Show less toggle, structured like GitHub's Primer
 * button (data-component spans) but with our own stable classes styled
 * from GitHub's design tokens — Primer's hashed CSS-module classes
 * rotate across deploys, so they must never be hardcoded.
 */
function buildToggleButton({ expanded = false, toggleClass = "" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.component = "Button";
  button.dataset.size = "small";
  button.dataset.variant = "default";
  button.className = ["gqol-btn", toggleClass].filter(Boolean).join(" ");

  const content = document.createElement("span");
  content.dataset.component = "buttonContent";
  content.dataset.align = "center";
  content.className = "gqol-btn__content";

  const visual = document.createElement("span");
  visual.dataset.component = "leadingVisual";
  visual.className = "gqol-btn__visual";

  const label = document.createElement("span");
  label.dataset.component = "text";
  label.className = "gqol-btn__label";

  content.append(visual, label);
  button.appendChild(content);
  renderToggleButton(button, expanded);
  return button;
}

/** Sync the toggle's aria state, chevron direction and label. */
function renderToggleButton(button, expanded) {
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  const visual = button.querySelector("[data-component='leadingVisual']");
  const label = button.querySelector("[data-component='text']");
  if (visual) {
    visual.innerHTML = expanded
      ? chevronUpIcon(BTN_ICON_CLASS)
      : chevronDownIcon(BTN_ICON_CLASS);
  }
  if (label) label.textContent = expanded ? "Show less" : "Show more";
}

/**
 * Wrap `body` in block > wrap(body) + footer(toggle) and collapse it.
 * Hook classes ride alongside the shared ones (features keep their
 * test/CSS hooks without the toggle logic knowing them individually).
 * Returns the block element.
 */
export function createCollapseBlock(
  body,
  {
    expandedAttr,
    toggleClass = "",
    blockHookClass = "",
    wrapHookClass = "",
    collapsedHookClass = "",
    onToggle,
  } = {},
) {
  const block = document.createElement("div");
  block.className = [COLLAPSE_BLOCK_CLASS, blockHookClass]
    .filter(Boolean)
    .join(" ");

  const wrap = document.createElement("div");
  wrap.className = [COLLAPSE_WRAP_CLASS, wrapHookClass].filter(Boolean).join(" ");

  const parent = body.parentNode;
  parent?.insertBefore(block, body);
  block.appendChild(wrap);
  wrap.appendChild(body);

  const collapsedClasses = [
    COLLAPSE_COLLAPSED_CLASS,
    collapsedHookClass,
  ].filter(Boolean);
  body.classList.add(...collapsedClasses);
  wrap.classList.add(...collapsedClasses);
  body.setAttribute(expandedAttr, "false");

  const footer = document.createElement("div");
  footer.className = COLLAPSE_FOOTER_CLASS;

  const toggle = buildToggleButton({ expanded: false, toggleClass });
  toggle.addEventListener("click", () => {
    const expanding = body.getAttribute(expandedAttr) !== "true";
    body.setAttribute(expandedAttr, expanding ? "true" : "false");
    block.classList.toggle(COLLAPSE_EXPANDED_CLASS, expanding);
    for (const el of [body, wrap]) {
      el.classList.toggle(COLLAPSE_COLLAPSED_CLASS, !expanding);
      if (collapsedHookClass) el.classList.toggle(collapsedHookClass, !expanding);
    }
    renderToggleButton(toggle, expanding);
    onToggle?.(expanding, block);
  });

  footer.appendChild(toggle);
  block.appendChild(footer);
  return block;
}

/**
 * Put the original body element back in place of our block/wrap
 * container and strip the shared collapse state. `fallbackToFirstChild`
 * covers bare wraps (body may be the container's first child); blocks
 * resolve the body through their inner wrap instead. Returns the
 * restored body (or null when the container is simply removed).
 */
function unwrapCollapseBlock(
  container,
  { expandedAttr, bodySelector, fallbackToFirstChild = false } = {},
) {
  const wrapped =
    container.querySelector(`.${COLLAPSE_WRAP_CLASS}`)?.firstElementChild;
  const body =
    container.querySelector(bodySelector) ??
    (fallbackToFirstChild ? container.firstElementChild : wrapped);

  if (body) {
    body.classList.remove(COLLAPSE_COLLAPSED_CLASS);
    body.removeAttribute(expandedAttr);
    container.replaceWith(body);
    return body;
  }

  container.remove();
  return null;
}

/**
 * Undo every collapse structure tagged with the feature's hook classes:
 * blocks first (their body resolves through the inner wrap), then bare
 * wraps (body may be the container's first child), with `restoreBody`
 * stripping the feature's own markers from each restored body. Footers
 * left outside any collapse block are removed — footers inside another
 * feature's still-standing block belong to it and are left alone.
 */
export function unwrapAllCollapseBlocks({
  blockSelector,
  wrapSelector,
  expandedAttr,
  bodySelector,
  restoreBody = () => {},
} = {}) {
  document.querySelectorAll(blockSelector).forEach((block) => {
    restoreBody(unwrapCollapseBlock(block, { expandedAttr, bodySelector }));
  });

  document.querySelectorAll(`.${COLLAPSE_FOOTER_CLASS}`).forEach((footer) => {
    if (!footer.closest(`.${COLLAPSE_BLOCK_CLASS}`)) footer.remove();
  });

  document.querySelectorAll(wrapSelector).forEach((wrap) => {
    if (wrap.closest(`.${COLLAPSE_BLOCK_CLASS}`)) return;
    restoreBody(
      unwrapCollapseBlock(wrap, {
        expandedAttr,
        bodySelector,
        fallbackToFirstChild: true,
      }),
    );
  });
}
