import { describe, it, expect, beforeEach } from "vitest";
import {
  findTimelineItemFor,
  findCommentWrapper,
  findMergeBoxUnit,
  findElementsByText,
} from "../src/js/lib/placement.js";

const ITEM_SELECTOR = ".js-timeline-item";

beforeEach(() => {
  document.body.innerHTML = "";
});

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

describe("findTimelineItemFor", () => {
  it("climbs to the closest timeline item", () => {
    const item = el("div", "js-timeline-item TimelineItem");
    const inner = el("div", "comment-body");
    item.appendChild(inner);
    document.body.appendChild(item);

    expect(findTimelineItemFor(inner, ITEM_SELECTOR)).toBe(item);
  });

  it("falls back to generic TimelineItem wrapper", () => {
    const item = el("div", "TimelineItem");
    const inner = el("div", "comment-body");
    item.appendChild(inner);
    document.body.appendChild(item);

    expect(findTimelineItemFor(inner, ITEM_SELECTOR)).toBe(item);
  });

  it("returns null for disconnected nodes", () => {
    const orphan = el("div", "comment-body");
    expect(findTimelineItemFor(orphan, ITEM_SELECTOR)).toBe(null);
  });
});

describe("findCommentWrapper", () => {
  function buildPage() {
    const container = el("div", "js-timeline-container");
    const item = el("div", "js-timeline-item");
    container.appendChild(item);

    const composerSection = el("div", "composer-section");
    const form = el("form", "js-new-comment-form");
    const field = el("textarea");
    field.id = "new_comment_field";
    form.appendChild(field);
    composerSection.appendChild(form);

    const page = el("div", "page");
    page.appendChild(container);
    page.appendChild(composerSection);
    document.body.appendChild(page);

    return { container, item, form, composerSection, page };
  }

  it("climbs to the node just below the parent containing the timeline container", () => {
    const { container, form, composerSection } = buildPage();
    const wrapper = findCommentWrapper(form, { timelineContainer: container });
    expect(wrapper).toBe(composerSection);
  });

  it("stops at a stopSelector match", () => {
    const { form } = buildPage();
    document.querySelector(".composer-section").className += " pull-discussion-timeline";
    const wrapper = findCommentWrapper(form, {
      stopSelector: "main, .pull-discussion-timeline",
    });
    expect(wrapper).toBe(form);
  });

  it("stops before a parent containing a timeline item", () => {
    const { item, form } = buildPage();
    const wrapper = findCommentWrapper(form, { timelineItem: item });
    expect(wrapper).toBe(form.closest(".composer-section"));
  });

  it("stops before a parent containing the merge box outside the current node", () => {
    const { form, page } = buildPage();
    const mergeBox = el("div");
    mergeBox.setAttribute("data-testid", "mergebox-partial");
    page.appendChild(mergeBox);

    const wrapper = findCommentWrapper(form, { mergeBox });
    expect(wrapper).toBe(form.closest(".composer-section"));
  });

  it("climbs through a node that contains the merge box itself", () => {
    const { container, form } = buildPage();
    const mergeBox = el("div");
    mergeBox.setAttribute("data-testid", "mergebox-partial");
    form.appendChild(mergeBox);

    const wrapper = findCommentWrapper(form, { timelineContainer: container, mergeBox });
    expect(wrapper).toBe(form.closest(".composer-section"));
  });

  it("stops at document.body", () => {
    const form = el("form");
    document.body.appendChild(form);
    expect(findCommentWrapper(form)).toBe(form);
  });

  it("returns null for a disconnected form", () => {
    const form = el("form");
    expect(findCommentWrapper(form)).toBe(null);
  });
});

describe("findMergeBoxUnit", () => {
  function mergeBox() {
    const box = el("div");
    box.setAttribute("data-testid", "mergebox-partial");
    return box;
  }

  it("climbs from the partial to its top-level wrapper (React Stack)", () => {
    const container = el("div");
    const stack = el("div", "tmp-py-2 tmp-px-3 border bgColor-muted rounded-2 mt-2 Stack");
    const inner = el("div", "inner");
    const box = mergeBox();
    inner.appendChild(box);
    stack.appendChild(inner);
    container.appendChild(stack);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    expect(findMergeBoxUnit(box, container, ITEM_SELECTOR)).toBe(stack);
  });

  it("stops at the timeline item that wraps the merge box", () => {
    const container = el("div");
    const item = el("div", "js-timeline-item");
    const box = mergeBox();
    item.appendChild(box);
    container.appendChild(item);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    expect(findMergeBoxUnit(box, container, ITEM_SELECTOR)).toBe(item);
  });

  it("returns the partial itself when it is a direct child of the container", () => {
    const container = el("div");
    const box = mergeBox();
    container.appendChild(box);
    container.appendChild(el("div", "js-timeline-item"));
    document.body.appendChild(container);

    expect(findMergeBoxUnit(box, container, ITEM_SELECTOR)).toBe(box);
  });

  it("climbs wrappers even without sibling timeline items until the container", () => {
    const container = el("div");
    const wrapper = el("div", "wrapper");
    const box = mergeBox();
    wrapper.appendChild(box);
    container.appendChild(wrapper);
    document.body.appendChild(container);

    expect(findMergeBoxUnit(box, container, ITEM_SELECTOR)).toBe(wrapper);
  });

  it("returns null for a disconnected box or missing container", () => {
    const box = mergeBox();
    expect(findMergeBoxUnit(box, document.body, ITEM_SELECTOR)).toBe(null);
    document.body.appendChild(box);
    expect(findMergeBoxUnit(box, null, ITEM_SELECTOR)).toBe(null);
  });
});

describe("findElementsByText", () => {
  const PATTERN = /Remember,\s+contributions|ProTip!.*\.patch/i;

  function footer(text, className = "text-small color-fg-muted d-flex") {
    const node = el("div", className);
    node.textContent = text;
    return node;
  }

  it("finds sibling footer texts (guidelines + protip)", () => {
    const root = el("div");
    root.appendChild(footer("Remember, contributions to this repository should follow our GitHub Community Guidelines."));
    root.appendChild(footer("ProTip! Add .patch or .diff to the end of URLs for Git’s plaintext views."));
    document.body.appendChild(root);

    expect(findElementsByText(root, PATTERN, ".text-small")).toHaveLength(2);
  });

  it("collapses nested matches to the outermost element", () => {
    const root = el("div");
    const outer = footer("");
    const inner = el("span", "text-small");
    inner.textContent = "Remember, contributions to this repository";
    outer.appendChild(inner);
    root.appendChild(outer);
    document.body.appendChild(root);

    const found = findElementsByText(root, PATTERN, ".text-small");
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(outer);
  });

  it("ignores elements whose text does not match", () => {
    const root = el("div");
    root.appendChild(footer("Some other helper text"));
    document.body.appendChild(root);

    expect(findElementsByText(root, PATTERN, ".text-small")).toEqual([]);
  });

  it("returns empty for a missing root", () => {
    expect(findElementsByText(null, PATTERN, ".text-small")).toEqual([]);
  });

  it("excludeContaining drops guard matches before collapsing", () => {
    const root = el("div");
    const form = el("form");
    const textarea = el("textarea");
    const protip = el("p");
    protip.textContent = "ProTip! Add .patch links.";
    form.append(textarea, protip);
    root.appendChild(form);
    document.body.appendChild(root);

    // Without the guard the form absorbs the ProTip match; with it, the
    // form is dropped and the inner text element is returned.
    expect(findElementsByText(root, PATTERN, "*", { excludeContaining: "form, textarea" })).toEqual([protip]);
  });

  it("excludeContaining keeps a shared form-free footer container", () => {
    const root = el("div");
    const form = el("form");
    form.appendChild(el("textarea"));
    const footer = el("div", "footer");
    const a = el("p");
    a.textContent = "Remember, contributions to this repository";
    const b = el("p");
    b.textContent = "ProTip! Be kind.";
    footer.append(a, b);
    root.append(form, footer);
    document.body.appendChild(root);

    expect(findElementsByText(root, PATTERN, "*", { excludeContaining: "form, textarea" })).toEqual([footer]);
  });
});
