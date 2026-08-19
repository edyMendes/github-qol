/**
 * Feature: collapse long PR descriptions behind a Show more toggle.
 */

import { chevronDownIcon, chevronUpIcon } from "../../lib/icons.js";
import {
  getDescriptionBody,
  getDescriptionElement,
  resetDomCache,
} from "../dom-cache.js";
import { isDescriptionBodyLoading, isDescriptionLoading, isTallBody } from "../description.js";
import { nudgeDescription } from "../hydration.js";
import { requestRevalidate } from "../bus.js";
import { MARKDOWN_BODY_SELECTOR } from "../../lib/selectors.js";

const DESC_COLLAPSED_CLASS = "gqol-desc-collapsed";
const DESC_WRAP_CLASS = "gqol-desc-wrap";
const DESC_BLOCK_CLASS = "gqol-desc-block";
const DESC_FOOTER_CLASS = "gqol-desc-footer";
const DESC_TOGGLE_CLASS = "gqol-desc-toggle";

const DESC_PROCESSED_ATTR = "data-gqol-desc-processed";
const DESC_EXPANDED_ATTR = "data-gqol-desc-expanded";

let descriptionObserver = null;
let descriptionObservedEl = null;

function renderToggleButton(button, expanded) {
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  button.innerHTML = expanded
    ? `${chevronUpIcon("gqol-desc-toggle-icon")}<span>Show less</span>`
    : `${chevronDownIcon("gqol-desc-toggle-icon")}<span>Show more</span>`;
}

function alignFooterText(block, body) {
  const footer = block.querySelector(`.${DESC_FOOTER_CLASS}`);
  if (!footer) return;

  const firstBlockChild =
    body.querySelector(
      ":scope > p, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3, :scope > pre, :scope > blockquote, :scope > div",
    ) ?? body;
  const blockRect = block.getBoundingClientRect();
  const indent = Math.max(
    0,
    Math.round(firstBlockChild.getBoundingClientRect().left - blockRect.left),
  );
  footer.style.paddingLeft = `${indent}px`;
  footer.style.paddingInlineStart = `${indent}px`;
}

function scrollDescriptionIntoView(target) {
  if (target?.isConnected) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function recheckCollapseEligibility(body) {
  // Cheap connected/closest checks first; isTallBody forces a reflow so it
  // only runs when everything else says the body might still need collapsing.
  if (!body?.isConnected) return false;
  if (isDescriptionBodyLoading(body)) return false;
  if (body.closest(`.${DESC_BLOCK_CLASS}`)) return false;
  if (!isTallBody(body)) return false;
  body.removeAttribute(DESC_PROCESSED_ATTR);
  return true;
}

function collapseDescription(body) {
  if (body.closest(`.${DESC_BLOCK_CLASS}`)) return true;

  if (
    body.getAttribute(DESC_PROCESSED_ATTR) === "1" &&
    !recheckCollapseEligibility(body)
  ) {
    return true;
  }

  if (isDescriptionBodyLoading(body)) return false;

  if (!isTallBody(body)) {
    requestAnimationFrame(() => {
      if (!body.isConnected || isDescriptionBodyLoading(body)) return;
      if (isTallBody(body)) {
        collapseDescription(body);
      } else {
        body.setAttribute(DESC_PROCESSED_ATTR, "1");
      }
    });
    return false;
  }

  const block = document.createElement("div");
  block.className = DESC_BLOCK_CLASS;

  const wrap = document.createElement("div");
  wrap.className = DESC_WRAP_CLASS;

  const parent = body.parentNode;
  parent?.insertBefore(block, body);
  block.appendChild(wrap);
  wrap.appendChild(body);

  body.classList.add(DESC_COLLAPSED_CLASS);
  wrap.classList.add(DESC_COLLAPSED_CLASS);
  body.setAttribute(DESC_PROCESSED_ATTR, "1");
  body.setAttribute(DESC_EXPANDED_ATTR, "false");

  const footer = document.createElement("div");
  footer.className = DESC_FOOTER_CLASS;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = DESC_TOGGLE_CLASS;
  renderToggleButton(toggle, false);

  toggle.addEventListener("click", () => {
    const expanded = body.getAttribute(DESC_EXPANDED_ATTR) !== "true";
    body.setAttribute(DESC_EXPANDED_ATTR, expanded ? "true" : "false");
    block.classList.toggle("gqol-desc-block--expanded", expanded);

    if (expanded) {
      body.classList.remove(DESC_COLLAPSED_CLASS);
      wrap.classList.remove(DESC_COLLAPSED_CLASS);
    } else {
      body.classList.add(DESC_COLLAPSED_CLASS);
      wrap.classList.add(DESC_COLLAPSED_CLASS);
      requestAnimationFrame(() => scrollDescriptionIntoView(block));
    }

    renderToggleButton(toggle, expanded);
  });

  footer.appendChild(toggle);
  block.appendChild(footer);

  requestAnimationFrame(() => {
    alignFooterText(block, body);
    requestAnimationFrame(() => alignFooterText(block, body));
  });

  resetDomCache();
  return true;
}

function restoreBodyElement(body) {
  body.classList.remove(DESC_COLLAPSED_CLASS);
  body.removeAttribute(DESC_PROCESSED_ATTR);
  body.removeAttribute(DESC_EXPANDED_ATTR);
}

/**
 * Put the original body element back in place of our block/wrap container.
 * `fallbackToFirstChild` covers bare wraps (body may be the first child);
 * blocks resolve the body through their inner wrap instead.
 */
function unwrapCollapsedContainer(container, fallbackToFirstChild) {
  const wrapped = container.querySelector(`.${DESC_WRAP_CLASS}`)?.firstElementChild;
  const body =
    container.querySelector(MARKDOWN_BODY_SELECTOR) ??
    (fallbackToFirstChild ? container.firstElementChild : wrapped);
  if (body) {
    restoreBodyElement(body);
    container.replaceWith(body);
  } else {
    container.remove();
  }
}

function undoCollapseDescription() {
  document.querySelectorAll(`.${DESC_BLOCK_CLASS}`).forEach((block) => {
    unwrapCollapsedContainer(block, false);
  });

  document.querySelectorAll(`.${DESC_TOGGLE_CLASS}`).forEach((el) => el.remove());

  document.querySelectorAll(`.${DESC_WRAP_CLASS}`).forEach((wrap) => {
    if (wrap.closest(`.${DESC_BLOCK_CLASS}`)) return;
    unwrapCollapsedContainer(wrap, true);
  });
  resetDomCache();
}

function stopDescriptionObserver() {
  descriptionObserver?.disconnect();
  descriptionObserver = null;
  descriptionObservedEl = null;
}

function ensureDescriptionObserver(descEl) {
  // Reuse the existing observer when it already watches this element —
  // revalidation passes run many times per page load.
  if (descriptionObserver && descriptionObservedEl === descEl) return;
  descriptionObserver?.disconnect();
  descriptionObserver = new MutationObserver(() => {
    requestRevalidate();
  });
  descriptionObserver.observe(descEl, { childList: true, subtree: true });
  descriptionObservedEl = descEl;
}

function applyCollapseDescription(enabled) {
  if (!enabled) {
    undoCollapseDescription();
    stopDescriptionObserver();
    return false;
  }

  const descEl = getDescriptionElement();
  if (descEl) {
    ensureDescriptionObserver(descEl);
  }

  nudgeDescription();

  const body = getDescriptionBody();
  if (!body) return false;
  return collapseDescription(body);
}

function needsWorkCollapseDescription(settings) {
  if (!settings.collapsePrDescription) return false;
  const descEl = getDescriptionElement();
  const body = getDescriptionBody();
  if (!descEl && !body) return false;
  if (!body) return isDescriptionLoading(descEl);
  if (isDescriptionBodyLoading(body)) return true;
  // Cheap closest() before the reflow-forcing height measurement.
  return !body.closest(`.${DESC_BLOCK_CLASS}`) && isTallBody(body);
}

function resetCollapseDescription() {
  undoCollapseDescription();
  stopDescriptionObserver();
}

export default {
  name: "collapse-description",
  apply: (settings) => applyCollapseDescription(settings.collapsePrDescription),
  needsWork: needsWorkCollapseDescription,
  reset: resetCollapseDescription,
};
