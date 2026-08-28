# Section Order + Options Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded, boolean-driven section placement (merge box, comment box) and the in-page sort button with a user-configurable `sectionOrder` setting, a dedicated options page, and a single section-layout engine feature.

**Architecture:** Expand→migrate→contract on the settings model: new keys (`timelineOrder`, `sectionOrder`) are added alongside the legacy booleans while content features switch over, then legacy keys are removed. A new `section-order` content-script feature owns placement of all movable sections via a registry of per-section descriptors (ported verbatim from today's mergebox/comment-box features); `sort-row` is deleted; reverse-timeline keeps ordering items *inside* the stream. A new options page (HTML + JS, esbuild-bundled) owns the reorder UI; the popup slims to a direction toggle plus an "Open settings" link.

**Tech Stack:** Chrome MV3 extension, vanilla ESM JS, esbuild, Tailwind CSS v4, vitest + jsdom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-section-order-options-page-design.md`

## Global Constraints

- `npm test` (vitest, jsdom) must be green at the end of every task.
- No new npm dependencies.
- Content script bundles as IIFE (`src/js/content-github-pr.bundle.min.js`); popup/background/options bundle as ESM with `./settings.js` rewritten to the built `settings.min.js` (existing esbuild plugin).
- Section ids are exactly `SECTION_IDS = ["copilot", "mergebox", "commentBox", "timeline"]`; timeline orders exactly `TIMELINE_ORDERS = ["newest", "oldest"]`.
- Default `sectionOrder` is `["copilot", "mergebox", "commentBox", "timeline"]` (reproduces today's layout).
- Storage flow unchanged: single `STORAGE_KEY`, sync-first/local-fallback, `chrome.storage.onChanged` → `invalidateCachedSettings` in the content script.
- Existing marker attributes/classes keep their names (`data-gqol-mergebox-moved`, `gqol-mergebox-timeline-row`, `data-gqol-comment-box-moved`, `gqol-comment-box-at-top`, `data-gqol-comment-footer-moved`, `data-gqol-merge-anchor`) — orchestrator tests and CSS depend on them.
- The description is pinned above the stream; it is never orderable.

## File Map

- `src/js/settings.js` — typed `SETTING_DEFINITIONS`, enum/sectionOrder normalization, legacy migration (Tasks 1, 8)
- `src/js/content/features/reverse-timeline.js` — reads `timelineOrder` (Task 2)
- `src/js/content/features/sort-row.js`, `src/js/lib/sort-button.js` — deleted (Task 7)
- `src/js/content/features/sections/mergebox.js` — mergebox descriptor (Task 3, new)
- `src/js/content/features/sections/comment-box.js` — commentBox descriptor (Task 4, new)
- `src/js/content/features/sections/copilot.js` — copilot descriptor (Task 5, new)
- `src/js/content/features/section-order.js` — layout engine feature (Task 6, new; absorbs and deletes `features/mergebox.js` + `features/comment-box.js`)
- `src/options.html`, `src/js/options.js` — options page (Task 9, new)
- `src/popup.html`, `src/js/popup.js` — slim popup (Task 10)
- `build.mjs`, `manifest.json`, `src/css/github-pr.css`, `src/js/lib/icons.js`, `src/js/content-github-pr.js`, `src/js/content/settings-cache.js`, `README.md` — wiring/cleanup (Tasks 6–10)

Test files mirror sources under `test/`.

---

### Task 1: Settings model — add typed keys alongside legacy (expand phase)

**Files:**
- Modify: `src/js/settings.js`
- Test: `test/settings.test.js`

**Interfaces:**
- Produces: `SECTION_IDS`, `TIMELINE_ORDERS` (exported string arrays); `DEFAULT_SETTINGS` now contains six keys — `timelineOrder`, `sectionOrder`, `collapsePrDescription`, plus legacy `reverseTimeline`, `showMergeBoxBelowDescription`, `commentBoxAtTop` (mirrors, kept until Task 8). `SETTING_DEFINITIONS` entries gain `type: "boolean" | "enum" | "sectionOrder"` and enum/sectionOrder entries carry `values`.

Legacy behavior stays intact: existing features and their tests (which pass explicit settings literals) keep passing unchanged.

- [ ] **Step 1: Write the failing tests**

In `test/settings.test.js`, replace the `SETTING_DEFINITIONS` "marks which settings the popup renders controls for" test and add new describes. Import `SECTION_IDS` and `TIMELINE_ORDERS` at the top:

```js
import {
  STORAGE_KEY,
  SETTING_DEFINITIONS,
  DEFAULT_SETTINGS,
  SECTION_IDS,
  TIMELINE_ORDERS,
  normalizeSettings,
  getSettings,
  saveSettings,
  ensureDefaultSettings,
} from "../src/js/settings.js";
```

Replace the popupControlled test with:

```js
  it("keeps the popupControlled marking in sync with definitions", () => {
    const popupKeys = SETTING_DEFINITIONS.filter((d) => d.popupControlled);
    expect(popupKeys.map((d) => d.key)).toEqual([
      "collapsePrDescription",
      "showMergeBoxBelowDescription",
      "commentBoxAtTop",
    ]);
  });

  it("declares enum and sectionOrder values", () => {
    const timelineOrder = SETTING_DEFINITIONS.find((d) => d.key === "timelineOrder");
    expect(timelineOrder.type).toBe("enum");
    expect(timelineOrder.values).toEqual(["newest", "oldest"]);
    const sectionOrder = SETTING_DEFINITIONS.find((d) => d.key === "sectionOrder");
    expect(sectionOrder.type).toBe("sectionOrder");
    expect(sectionOrder.values).toEqual(SECTION_IDS);
  });
```

Add these describes (keep all existing legacy describes — they must keep passing):

```js
describe("normalizeSettings: timelineOrder", () => {
  it("keeps a valid enum value", () => {
    expect(normalizeSettings({ timelineOrder: "oldest" }).timelineOrder).toBe("oldest");
  });

  it("falls back to newest for an invalid value", () => {
    expect(normalizeSettings({ timelineOrder: "sideways" }).timelineOrder).toBe("newest");
  });

  it("migrates legacy reverseTimeline=false to oldest", () => {
    expect(normalizeSettings({ reverseTimeline: false }).timelineOrder).toBe("oldest");
    expect(normalizeSettings({ reverseTimeline: true }).timelineOrder).toBe("newest");
  });
});

describe("normalizeSettings: sectionOrder", () => {
  it("keeps a valid full ordering", () => {
    const order = ["timeline", "copilot", "commentBox", "mergebox"];
    expect(normalizeSettings({ sectionOrder: order }).sectionOrder).toEqual(order);
  });

  it("drops unknown ids, dedupes, and appends missing ids", () => {
    expect(
      normalizeSettings({ sectionOrder: ["bogus", "timeline", "timeline", "copilot"] })
        .sectionOrder,
    ).toEqual(["timeline", "copilot", "mergebox", "commentBox"]);
  });

  it("falls back to the default order for non-array input", () => {
    expect(normalizeSettings({ sectionOrder: "nope" }).sectionOrder).toEqual([
      "copilot", "mergebox", "commentBox", "timeline",
    ]);
  });

  it("migrates showMergeBoxBelowDescription=false by demoting mergebox", () => {
    expect(normalizeSettings({ showMergeBoxBelowDescription: false }).sectionOrder).toEqual([
      "copilot", "commentBox", "timeline", "mergebox",
    ]);
  });

  it("migrates commentBoxAtTop=false by demoting commentBox", () => {
    expect(normalizeSettings({ commentBoxAtTop: false }).sectionOrder).toEqual([
      "copilot", "mergebox", "timeline", "commentBox",
    ]);
  });

  it("migrates reverseTimeline=false by demoting commentBox", () => {
    expect(normalizeSettings({ reverseTimeline: false }).sectionOrder).toEqual([
      "copilot", "mergebox", "timeline", "commentBox",
    ]);
  });
});

describe("normalizeSettings: legacy mirrors (expand phase)", () => {
  it("derives legacy booleans from new keys", () => {
    const s = normalizeSettings({ timelineOrder: "oldest", sectionOrder: ["copilot", "timeline", "mergebox", "commentBox"] });
    expect(s.reverseTimeline).toBe(false);
    expect(s.showMergeBoxBelowDescription).toBe(false);
    expect(s.commentBoxAtTop).toBe(false);
  });

  it("derives new keys from legacy booleans", () => {
    const s = normalizeSettings({ reverseTimeline: true, showMergeBoxBelowDescription: false, commentBoxAtTop: true });
    expect(s.timelineOrder).toBe("newest");
    expect(s.sectionOrder).toEqual(["copilot", "commentBox", "mergebox", "timeline"]);
    expect(s.showMergeBoxBelowDescription).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/settings.test.js`
Expected: FAIL — `SECTION_IDS` is not exported.

- [ ] **Step 3: Implement in `src/js/settings.js`**

Replace the definitions/normalization section (keep `readStoredSettings`, `writeSettings`, `getSettings`, `writeWithFallback`, `saveSettings`, `ensureDefaultSettings` exactly as they are):

```js
export const STORAGE_KEY = "githubQolSettings";

export const SECTION_IDS = ["copilot", "mergebox", "commentBox", "timeline"];
export const TIMELINE_ORDERS = ["newest", "oldest"];

const DEFAULT_SECTION_ORDER = [...SECTION_IDS];

/**
 * The single source of truth for every setting: key, type, default,
 * allowed values (enum/sectionOrder), and whether the popup renders a
 * control for it. DEFAULT_SETTINGS derives from this list.
 *
 * Legacy boolean keys (reverseTimeline, showMergeBoxBelowDescription,
 * commentBoxAtTop) are temporary mirrors of timelineOrder/sectionOrder
 * kept until every consumer reads the new keys; normalizeSettings
 * derives them in both directions.
 */
export const SETTING_DEFINITIONS = [
  { key: "timelineOrder", type: "enum", values: TIMELINE_ORDERS, default: "newest", popupControlled: false },
  { key: "sectionOrder", type: "sectionOrder", values: SECTION_IDS, default: DEFAULT_SECTION_ORDER, popupControlled: false },
  { key: "collapsePrDescription", type: "boolean", default: true, popupControlled: true },
  { key: "reverseTimeline", type: "boolean", default: true, popupControlled: false },
  { key: "showMergeBoxBelowDescription", type: "boolean", default: true, popupControlled: true },
  { key: "commentBoxAtTop", type: "boolean", default: true, popupControlled: true },
];

export const DEFAULT_SETTINGS = Object.fromEntries(
  SETTING_DEFINITIONS.map(({ key, default: defaultValue }) => [
    key,
    Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
  ]),
);

/** Drop unknown ids, dedupe, append missing ids in canonical order. */
function normalizeSectionOrder(value) {
  const ids = Array.isArray(value)
    ? value.filter((id) => SECTION_IDS.includes(id))
    : [];
  const unique = [...new Set(ids)];
  for (const id of SECTION_IDS) {
    if (!unique.includes(id)) unique.push(id);
  }
  return unique;
}

/**
 * Cross-derive old and new keys so either shape produces both, until the
 * legacy keys are contracted away. New keys win when both are present.
 */
function deriveSettings(raw) {
  const next = { ...raw };

  if (next.timelineOrder === undefined && raw.reverseTimeline !== undefined) {
    next.timelineOrder = raw.reverseTimeline ? "newest" : "oldest";
  }

  if (next.sectionOrder === undefined) {
    const order = [...DEFAULT_SECTION_ORDER];
    const demote = (id) => {
      const index = order.indexOf(id);
      if (index !== -1) order.push(order.splice(index, 1)[0]);
    };
    if (raw.showMergeBoxBelowDescription === false) demote("mergebox");
    if (raw.commentBoxAtTop === false || raw.reverseTimeline === false) {
      demote("commentBox");
    }
    next.sectionOrder = order;
  }

  if (next.reverseTimeline === undefined && next.timelineOrder !== undefined) {
    next.reverseTimeline = next.timelineOrder === "newest";
  }
  if (next.showMergeBoxBelowDescription === undefined) {
    next.showMergeBoxBelowDescription =
      next.sectionOrder.indexOf("mergebox") < next.sectionOrder.indexOf("timeline");
  }
  if (next.commentBoxAtTop === undefined) {
    next.commentBoxAtTop =
      next.sectionOrder.indexOf("commentBox") < next.sectionOrder.indexOf("timeline");
  }
  return next;
}

export function normalizeSettings(raw = {}) {
  const derived = deriveSettings(raw);
  const normalized = {};
  for (const definition of SETTING_DEFINITIONS) {
    const value = derived[definition.key];
    if (definition.type === "enum") {
      normalized[definition.key] = definition.values.includes(value)
        ? value
        : definition.default;
    } else if (definition.type === "sectionOrder") {
      normalized[definition.key] = normalizeSectionOrder(value);
    } else {
      normalized[definition.key] =
        value !== undefined ? Boolean(value) : definition.default;
    }
  }
  return normalized;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (all files — legacy features/tests untouched, popup reads mirrors).

- [ ] **Step 5: Commit**

```bash
git add src/js/settings.js test/settings.test.js
git commit -m "feat: add timelineOrder and sectionOrder settings with legacy migration"
```

---

### Task 2: reverse-timeline + sort-row read `timelineOrder`

**Files:**
- Modify: `src/js/content/features/reverse-timeline.js:170,186,241`, `src/js/content/features/sort-row.js:75-76,85`
- Test: `test/reverse-timeline.test.js`, `test/status.test.js`

**Interfaces:**
- Consumes: `settings.timelineOrder: "newest" | "oldest"`.
- Produces: features no longer read `settings.reverseTimeline`.

- [ ] **Step 1: Update the test literals**

In `test/reverse-timeline.test.js` line 10 and every inline settings object, replace `reverseTimeline: true` with `timelineOrder: "newest"` and `reverseTimeline: false` (line ~104, ~130) with `timelineOrder: "oldest"`:

```js
const SETTINGS = { timelineOrder: "newest" };
```

```js
    const result = await reverseTimelineFeature.apply({ timelineOrder: "oldest" });
```

```js
    expect(timelineStatus({ timelineOrder: "oldest" })).toBe(null);
```

In `test/status.test.js` line 118, replace `{ reverseTimeline: false }` with `{ timelineOrder: "oldest" }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/reverse-timeline.test.js test/status.test.js`
Expected: FAIL — feature ignores `timelineOrder`, reversal never applies.

- [ ] **Step 3: Update the feature**

In `src/js/content/features/reverse-timeline.js`, replace the three `settings.reverseTimeline` reads:

Line 170 (`needsWorkReverseTimeline`):
```js
  if (settings.timelineOrder !== "newest") return false;
```

Line 186 (`timelineStatus`):
```js
  if (settings.timelineOrder !== "newest" || !isPullRequestPage()) return null;
```

Line 241 (default export):
```js
  apply: (settings) =>
    applyReverseTimeline(settings.timelineOrder === "newest", settings),
```

In `src/js/content/features/sort-row.js`, replace the three `settings.reverseTimeline` reads (lines 75, 76, 85) with `settings.timelineOrder === "newest"`, e.g.:

```js
  const newestFirst = settings.timelineOrder === "newest";
  const directionChanged =
    button.getAttribute("aria-pressed") !== String(newestFirst);
  setSortDirection(button, newestFirst);
```

(line 85, same substitution inside `needsWorkSortRow`; line 27's `saveSettings({ reverseTimeline: newestFirst })` stays as-is — it still writes the legacy key, which Task 1's normalize mirrors to `timelineOrder`. This file is deleted in Task 7.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/content/features/reverse-timeline.js src/js/content/features/sort-row.js test/reverse-timeline.test.js test/status.test.js
git commit -m "refactor: reverse-timeline and sort-row read timelineOrder"
```

---

### Task 3: Mergebox section descriptor

**Files:**
- Create: `src/js/content/features/sections/mergebox.js`
- Test: `test/section-descriptor-mergebox.test.js`

**Interfaces:**
- Consumes: `findMergeBox`, `findDescriptionContainer`, `findTimelineContainer`, `resetDomCache` from `../../dom-cache.js`; `findMergeBoxUnit` from `../../../lib/placement.js`; `anchorBefore`, `restoreAtAnchor` from `../../../lib/anchor.js`; `TIMELINE_ITEM_SELECTOR` from `../../../lib/selectors.js`.
- Produces: default-exported descriptor:

```js
{
  id: "mergebox",
  resolve(container),            // Element|null — existing row, or the unit to wrap
  isPlaced(el, container, mode, ref), // boolean; mode: "before"|"after"
  place(el, container, mode, ref),    // Element — the outer element now in the slot
  cleanup(),                     // boolean — true when anything was restored
  pendingWhenMissing(),          // boolean — isPendingPostNavSwap()
  recovery: { expectedWhen(settings), landmark() },
}
```

Every later descriptor (Tasks 4–5) implements this exact shape; the engine (Task 6) consumes it.

- [ ] **Step 1: Write the failing tests**

Create `test/section-descriptor-mergebox.test.js` — the old `test/mergebox.test.js` DOM builder plus descriptor-level placement checks:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mergeboxDescriptor from "../src/js/content/features/sections/mergebox.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const STACK_CLASSES =
  "tmp-py-2 tmp-px-3 border bgColor-muted rounded-2 mt-2 Stack";

function buildPage() {
  document.body.innerHTML = "";

  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  const descBody = document.createElement("div");
  descBody.className = "markdown-body";
  descBody.textContent = "PR description";
  desc.appendChild(descBody);
  descGroup.appendChild(desc);

  const descWrap = document.createElement("div");
  descWrap.className =
    "TimelineItem TimelineItem--condensed js-comment-container js-command-palette-pull-body";
  descWrap.appendChild(descGroup);

  const stack = document.createElement("div");
  stack.className = STACK_CLASSES;
  const mergeBox = document.createElement("div");
  mergeBox.setAttribute("data-testid", "mergebox-partial");
  stack.appendChild(mergeBox);

  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  const item3 = document.createElement("div");
  item3.className = "js-timeline-item";

  container.append(descWrap, stack, item2, item3);
  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, stack, mergeBox, item2, item3 };
}

beforeEach(() => {
  buildPage();
});

afterEach(() => {
  mergeboxDescriptor.cleanup();
  resetDomCache();
});

describe("mergebox descriptor", () => {
  it("resolves the stack unit when unwrapped, the row once wrapped", () => {
    const { container, stack } = buildPage();
    expect(mergeboxDescriptor.resolve(container)).toBe(stack);
    const row = mergeboxDescriptor.place(stack, container, "before", null);
    expect(mergeboxDescriptor.resolve(container)).toBe(row);
  });

  it("place before: wraps in a row, anchors, styles, marks the desc anchor", () => {
    const { container, stack, mergeBox, descWrap, item2 } = buildPage();
    const row = mergeboxDescriptor.place(stack, container, "before", item2);
    expect(row.classList.contains("gqol-mergebox-timeline-row")).toBe(true);
    expect(row.nextSibling).toBe(item2);
    expect(stack.parentElement).toBe(row);
    expect(stack.className).toBe("Stack");
    expect(mergeBox.classList.contains("gqol-mergebox-below-desc")).toBe(true);
    expect(descWrap.hasAttribute("data-gqol-merge-anchor")).toBe(true);
  });

  it("place after: puts the row directly after the ref", () => {
    const { container, stack, item3 } = buildPage();
    const row = mergeboxDescriptor.place(stack, container, "after", item3);
    expect(row.previousSibling).toBe(item3);
    expect(descWrapHasAnchor()).toBe(false);
  });

  function descWrapHasAnchor() {
    return document
      .querySelector('[data-testid="pull-request-description"]')
      .closest(".js-comment-container")
      .hasAttribute("data-gqol-merge-anchor");
  }

  it("isPlaced is false natively, true once placed before the ref", () => {
    const { container, stack, item2 } = buildPage();
    expect(mergeboxDescriptor.isPlaced(stack, container, "before", item2)).toBe(false);
    const row = mergeboxDescriptor.place(stack, container, "before", item2);
    expect(mergeboxDescriptor.isPlaced(row, container, "before", item2)).toBe(true);
  });

  it("cleanup restores classes, attributes and the original position", () => {
    const { container, descWrap, stack, mergeBox } = buildPage();
    const unit = mergeboxDescriptor.resolve(container);
    mergeboxDescriptor.place(unit, container, "before", null);
    mergeboxDescriptor.cleanup();

    expect([...stack.classList].sort()).toEqual(STACK_CLASSES.split(/\s+/).sort());
    expect(stack.parentElement).toBe(container);
    expect(stack.hasAttribute("data-gqol-stripped-merge-classes")).toBe(false);
    expect(mergeBox.classList.contains("gqol-mergebox-below-desc")).toBe(false);
    expect(descWrap.hasAttribute("data-gqol-merge-anchor")).toBe(false);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBe(null);
  });

  it("declares recovery with the mergebox landmark", () => {
    buildPage();
    expect(
      mergeboxDescriptor.recovery.expectedWhen({ sectionOrder: ["copilot", "mergebox", "commentBox", "timeline"] }),
    ).toBe(true);
    expect(mergeboxDescriptor.recovery.landmark()).not.toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/section-descriptor-mergebox.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the descriptor**

Create `src/js/content/features/sections/mergebox.js`. The move/styling/restore logic is ported verbatim from `src/js/content/features/mergebox.js` (lines 22–157); only the feature-object wrapper becomes the descriptor interface:

```js
/**
 * Section descriptor: the merge status box. All DOM knowledge for the
 * mergebox lives here; the section-order engine decides WHERE it goes.
 * Move/restore logic ported from the former mergebox feature.
 */

import {
  findMergeBoxUnit,
  findTimelineItemFor,
} from "../../../lib/placement.js";
import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import {
  findDescriptionContainer,
  findMergeBox,
  findTimelineContainer,
  resetDomCache,
} from "../../dom-cache.js";
import { isPendingPostNavSwap } from "../../page.js";
import { TIMELINE_ITEM_SELECTOR } from "../../../lib/selectors.js";

const MERGEBOX_BELOW_DESC_CLASS = "gqol-mergebox-below-desc";
const MERGEBOX_MOVED_ATTR = "data-gqol-mergebox-moved";
const MERGEBOX_TIMELINE_ROW_CLASS = "gqol-mergebox-timeline-row";
const MERGE_ANCHOR_ATTR = "data-gqol-merge-anchor";
const STRIPPED_MERGE_CLASSES_ATTR = "data-gqol-stripped-merge-classes";
const STRIPPED_CLASS_PREFIXES = ["tmp-ml-", "tmp-pl-", "tmp-mr-", "tmp-pr-"];
const STRIPPED_UNIT_CLASSES = [
  "border",
  "bgColor-muted",
  "rounded-2",
  "mt-2",
  "tmp-py-2",
  "tmp-px-3",
];

const mergeBoxAnchors = new WeakMap();

function unwrapMergeRow(row) {
  const unit = row.firstElementChild;
  if (unit) {
    row.replaceWith(unit);
  } else {
    row.remove();
  }
}

function stripMergeClasses(el, exactClasses = []) {
  const stripped = new Set(
    (el.getAttribute(STRIPPED_MERGE_CLASSES_ATTR) ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  for (const cls of [...el.classList]) {
    const matches =
      STRIPPED_CLASS_PREFIXES.some((prefix) => cls.startsWith(prefix)) ||
      exactClasses.includes(cls);
    if (matches) {
      stripped.add(cls);
      el.classList.remove(cls);
    }
  }
  if (stripped.size > 0) {
    el.setAttribute(STRIPPED_MERGE_CLASSES_ATTR, [...stripped].join(" "));
  }
}

function applyMergeBoxStyles(mergeBox, unit) {
  mergeBox.classList.add(MERGEBOX_BELOW_DESC_CLASS);
  stripMergeClasses(mergeBox);
  if (unit !== mergeBox) {
    stripMergeClasses(unit, STRIPPED_UNIT_CLASSES);
  }
}

function restoreStrippedClasses(mergeBox) {
  const attr = mergeBox.getAttribute(STRIPPED_MERGE_CLASSES_ATTR);
  if (!attr) return;
  attr
    .split(/\s+/)
    .filter(Boolean)
    .forEach((cls) => mergeBox.classList.add(cls));
  mergeBox.removeAttribute(STRIPPED_MERGE_CLASSES_ATTR);
}

function markMergeAnchor(descContainer, row) {
  const anchorItem =
    findTimelineItemFor(row, TIMELINE_ITEM_SELECTOR) ??
    findTimelineItemFor(descContainer, TIMELINE_ITEM_SELECTOR);
  if (descContainer?.isConnected && descContainer !== anchorItem) {
    descContainer.removeAttribute(MERGE_ANCHOR_ATTR);
  }
  if (anchorItem) anchorItem.setAttribute(MERGE_ANCHOR_ATTR, "1");
}

function restoreMergeBox(mergeBox) {
  const row = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  const unit = row?.firstElementChild ?? mergeBox;

  if (restoreAtAnchor(mergeBoxAnchors, mergeBox, unit)) {
    row?.remove();
  } else if (row) {
    unwrapMergeRow(row);
  }

  mergeBoxAnchors.delete(mergeBox);
  mergeBox.removeAttribute(MERGEBOX_MOVED_ATTR);
  restoreStrippedClasses(unit);
  restoreStrippedClasses(mergeBox);
  mergeBox.classList.remove(MERGEBOX_BELOW_DESC_CLASS);
}

function cleanupMergeBox() {
  let changed = false;
  document
    .querySelectorAll(`[${MERGEBOX_MOVED_ATTR}="1"]`)
    .forEach((mergeBox) => {
      restoreMergeBox(mergeBox);
      changed = true;
    });
  document.querySelectorAll(`[${MERGE_ANCHOR_ATTR}="1"]`).forEach((anchor) => {
    anchor.removeAttribute(MERGE_ANCHOR_ATTR);
    changed = true;
  });
  document
    .querySelectorAll(`.${MERGEBOX_TIMELINE_ROW_CLASS}`)
    .forEach((row) => {
      unwrapMergeRow(row);
      changed = true;
    });
  resetDomCache();
  return changed;
}

/** The outer movable element as it exists right now, or null. */
function resolveMergeBox(container) {
  const mergeBox = findMergeBox();
  if (!mergeBox) return null;
  const existingRow = mergeBox.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (existingRow?.parentElement === container) return existingRow;
  return (
    findMergeBoxUnit(mergeBox, container, TIMELINE_ITEM_SELECTOR) ?? mergeBox
  );
}

function isMergeBoxPlacedAt(el, container, mode, ref) {
  const mergeBox = findMergeBox();
  if (
    !el?.isConnected ||
    el.parentElement !== container ||
    mergeBox?.getAttribute(MERGEBOX_MOVED_ATTR) !== "1"
  ) {
    return false;
  }
  return mode === "before" ? el.nextSibling === ref : el.previousSibling === ref;
}

function placeMergeBox(el, container, mode, ref) {
  const mergeBox = findMergeBox();

  let row = el.closest(`.${MERGEBOX_TIMELINE_ROW_CLASS}`);
  if (!row) {
    row = document.createElement("div");
    row.className = MERGEBOX_TIMELINE_ROW_CLASS;
    el.parentNode?.insertBefore(row, el);
    row.appendChild(el);
  }

  // Anchor keyed by the partial, placed next to the row that travels.
  anchorBefore(mergeBoxAnchors, mergeBox, row, "gqol-mergebox-anchor");

  if (mode === "before") {
    container.insertBefore(row, ref ?? null);
  } else {
    if (ref) {
      ref.after(row);
    } else {
      container.appendChild(row);
    }
  }

  mergeBox.setAttribute(MERGEBOX_MOVED_ATTR, "1");
  applyMergeBoxStyles(mergeBox, row.firstElementChild ?? mergeBox);
  if (mode === "before") {
    markMergeAnchor(findDescriptionContainer(), row);
  }
  return row;
}

export default {
  id: "mergebox",
  resolve: resolveMergeBox,
  isPlaced: isMergeBoxPlacedAt,
  place: placeMergeBox,
  cleanup: cleanupMergeBox,
  pendingWhenMissing: () =>
    Boolean(findTimelineContainer()) && isPendingPostNavSwap(),
  recovery: {
    expectedWhen: () => true,
    landmark: () => findMergeBox(),
  },
};
```

NOTE when porting: the sketch above assumes the final import block (all imports at the top, `findMergeBoxUnit` and `findTimelineItemFor` both from `../../../lib/placement.js`) — there is no `require_findTimelineItemFor` helper; that line was a sketch artifact and must not appear in the real file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/section-descriptor-mergebox.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test` — Expected: PASS (old `test/mergebox.test.js` still tests the old feature, which still exists until Task 6).

```bash
git add src/js/content/features/sections/mergebox.js test/section-descriptor-mergebox.test.js
git commit -m "feat: add mergebox section descriptor"
```

---

### Task 4: Comment-box section descriptor

**Files:**
- Create: `src/js/content/features/sections/comment-box.js`
- Test: `test/section-descriptor-comment-box.test.js`

**Interfaces:**
- Consumes: descriptor interface from Task 3; `resolveCommentWrapper` logic ported from `src/js/content/features/comment-box.js:64-75`; footer extraction from lines 83-127; `registerProtectedRegion` from `../../hydration.js`.
- Produces: same descriptor shape as Task 3; `id: "commentBox"`. Footer texts are extracted to the timeline end ONLY in `"before"` mode; `"after"` mode (≈native) restores them into the box. Marker/class set only in `"before"` mode.

- [ ] **Step 1: Write the failing tests**

Create `test/section-descriptor-comment-box.test.js` (builder ported from `test/comment-box.test.js`):

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import commentBoxDescriptor from "../src/js/content/features/sections/comment-box.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

function buildPage({ itemCount = 2, withFooters = true } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);
  container.appendChild(descWrap);

  for (let i = 1; i <= itemCount; i++) {
    const item = document.createElement("div");
    item.className = "js-timeline-item";
    item.setAttribute("data-gid", String(i));
    container.appendChild(item);
  }

  const commentWrapper = document.createElement("div");
  const form = document.createElement("form");
  form.className = "js-new-comment-form";
  const field = document.createElement("textarea");
  field.id = "new_comment_field";
  form.appendChild(field);
  commentWrapper.appendChild(form);
  if (withFooters) {
    const footer = document.createElement("div");
    footer.className = "text-small";
    footer.textContent =
      "Remember, contributions to this repository should follow our guidelines.";
    commentWrapper.appendChild(footer);
  }
  container.appendChild(commentWrapper);

  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, commentWrapper, form, field };
}

beforeEach(() => {
  buildPage();
});

afterEach(() => {
  commentBoxDescriptor.cleanup();
  resetDomCache();
});

describe("commentBox descriptor", () => {
  it("resolves the comment wrapper", () => {
    const { container, commentWrapper } = buildPage();
    expect(commentBoxDescriptor.resolve(container)).toBe(commentWrapper);
  });

  it("place before: moves above ref, extracts footers, marks the box", () => {
    const { container, commentWrapper } = buildPage();
    const firstItem = container.querySelector(":scope > .js-timeline-item");
    const placed = commentBoxDescriptor.place(
      commentWrapper, container, "before", firstItem,
    );
    expect(placed).toBe(commentWrapper);
    expect(firstItem.previousElementSibling).toBe(commentWrapper);
    expect(commentWrapper.getAttribute("data-gqol-comment-box-moved")).toBe("1");
    expect(commentWrapper.classList.contains("gqol-comment-box-at-top")).toBe(true);
    const footer = document.querySelector("[data-gqol-comment-footer-moved='1']");
    expect(footer).not.toBeNull();
    expect(container.lastElementChild).toBe(footer);
  });

  it("isPlaced before-mode requires marker, adjacency and extracted footers", () => {
    const { container, commentWrapper } = buildPage();
    const firstItem = container.querySelector(":scope > .js-timeline-item");
    expect(
      commentBoxDescriptor.isPlaced(commentWrapper, container, "before", firstItem),
    ).toBe(false);
    commentBoxDescriptor.place(commentWrapper, container, "before", firstItem);
    expect(
      commentBoxDescriptor.isPlaced(commentWrapper, container, "before", firstItem),
    ).toBe(true);
  });

  it("place after: keeps footers inside the box, no marker", () => {
    const { container, commentWrapper } = buildPage();
    const items = container.querySelectorAll(":scope > .js-timeline-item");
    const lastItem = items[items.length - 1];
    commentBoxDescriptor.place(commentWrapper, container, "after", lastItem);
    expect(commentWrapper.previousSibling).toBe(lastItem);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBeNull();
    expect(
      commentWrapper.textContent.includes("Remember, contributions"),
    ).toBe(true);
  });

  it("cleanup restores the box and footers to native positions", () => {
    const { container, commentWrapper } = buildPage();
    const firstItem = container.querySelector(":scope > .js-timeline-item");
    commentBoxDescriptor.place(commentWrapper, container, "before", firstItem);
    commentBoxDescriptor.cleanup();
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBeNull();
    expect(container.lastElementChild).toBe(commentWrapper);
  });

  it("declares recovery only when ranked before the timeline", () => {
    buildPage();
    expect(
      commentBoxDescriptor.recovery.expectedWhen({
        sectionOrder: ["copilot", "mergebox", "commentBox", "timeline"],
      }),
    ).toBe(true);
    expect(
      commentBoxDescriptor.recovery.expectedWhen({
        sectionOrder: ["copilot", "timeline", "commentBox", "mergebox"],
      }),
    ).toBe(false);
    expect(commentBoxDescriptor.recovery.landmark()).not.toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/section-descriptor-comment-box.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the descriptor**

Create `src/js/content/features/sections/comment-box.js` — port the footer/extraction/restore logic verbatim from `src/js/content/features/comment-box.js` (lines 37-127), then add the descriptor surface:

```js
/**
 * Section descriptor: the comment box. "before" mode is the moved-to-top
 * placement (footers extracted to the timeline end); "after" mode is the
 * native-style end-of-timeline placement (footers stay inside the box).
 */

import {
  findCommentWrapper,
  findElementsByText,
} from "../../../lib/placement.js";
import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import {
  findCommentForm,
  findMergeBox,
  findTimelineContainer,
  getTimelineItems,
  resetDomCache,
} from "../../dom-cache.js";
import { registerProtectedRegion } from "../../hydration.js";
import { isPendingPostNavSwap } from "../../page.js";
import {
  COMMENT_BOX_MOVED_ATTR,
  TIMELINE_FLOW_STOP_SELECTOR,
} from "../../../lib/selectors.js";

const COMMENT_BOX_AT_TOP_CLASS = "gqol-comment-box-at-top";
const COMMENT_FOOTER_PATTERN =
  /Remember,\s+contributions\s+to\s+this\s+repository|ProTip!/i;
const COMMENT_FOOTER_GUARD_SELECTOR =
  "form, textarea, [contenteditable], button";
const COMMENT_FOOTER_MOVED_ATTR = "data-gqol-comment-footer-moved";
const GUIDELINES_PATTERN = /Remember,\s+contributions/i;

const commentBoxAnchors = new WeakMap();
const commentFooterAnchors = new WeakMap();

registerProtectedRegion(() =>
  document.querySelector(`[${COMMENT_BOX_MOVED_ATTR}="1"]`),
);

function findCommentFooters(wrapper) {
  if (!wrapper) return [];
  return findElementsByText(wrapper, COMMENT_FOOTER_PATTERN, "*", {
    excludeContaining: COMMENT_FOOTER_GUARD_SELECTOR,
  });
}

function extractCommentFooters(wrapper, container) {
  const footers = [...findCommentFooters(wrapper)].sort(
    (a, b) =>
      Number(GUIDELINES_PATTERN.test(b.textContent)) -
      Number(GUIDELINES_PATTERN.test(a.textContent)),
  );
  for (const footer of footers) {
    anchorBefore(
      commentFooterAnchors, footer, footer, "gqol-comment-footer-anchor",
    );
    container.appendChild(footer);
    footer.setAttribute(COMMENT_FOOTER_MOVED_ATTR, "1");
  }
}

function restoreCommentFooters() {
  document
    .querySelectorAll(`[${COMMENT_FOOTER_MOVED_ATTR}="1"]`)
    .forEach((footer) => {
      restoreAtAnchor(commentFooterAnchors, footer, footer);
      footer.removeAttribute(COMMENT_FOOTER_MOVED_ATTR);
    });
}

function resolveCommentBox(container) {
  const form = findCommentForm();
  if (!form?.isConnected) return null;
  return findCommentWrapper(form, {
    stopSelector: TIMELINE_FLOW_STOP_SELECTOR,
    timelineContainer: container,
    timelineItem: getTimelineItems()[0] ?? null,
    mergeBox: findMergeBox(),
  });
}

function isCommentBoxPlacedAt(el, container, mode, ref) {
  if (!el?.isConnected || el.parentElement !== container) return false;
  const adjacent =
    mode === "before" ? el.nextSibling === ref : el.previousSibling === ref;
  if (!adjacent) return false;
  if (mode === "before") {
    return (
      el.getAttribute(COMMENT_BOX_MOVED_ATTR) === "1" &&
      findCommentFooters(el).length === 0
    );
  }
  return (
    el.getAttribute(COMMENT_BOX_MOVED_ATTR) === null &&
    document.querySelector(`[${COMMENT_FOOTER_MOVED_ATTR}="1"]`) === null
  );
}

function placeCommentBox(el, container, mode, ref) {
  if (mode === "before") {
    extractCommentFooters(el, container);
  } else {
    restoreCommentFooters();
    el.removeAttribute(COMMENT_BOX_MOVED_ATTR);
    el.classList.remove(COMMENT_BOX_AT_TOP_CLASS);
  }

  anchorBefore(commentBoxAnchors, el, el, "gqol-comment-box-anchor");
  if (mode === "before") {
    container.insertBefore(el, ref ?? null);
  } else if (ref) {
    ref.after(el);
  } else {
    container.appendChild(el);
  }

  if (mode === "before") {
    el.setAttribute(COMMENT_BOX_MOVED_ATTR, "1");
    el.classList.add(COMMENT_BOX_AT_TOP_CLASS);
  }
  return el;
}

function cleanupCommentBox() {
  let changed = false;
  restoreCommentFooters();
  document
    .querySelectorAll(`[${COMMENT_BOX_MOVED_ATTR}="1"]`)
    .forEach((wrapper) => {
      restoreAtAnchor(commentBoxAnchors, wrapper, wrapper);
      wrapper.removeAttribute(COMMENT_BOX_MOVED_ATTR);
      wrapper.classList.remove(COMMENT_BOX_AT_TOP_CLASS);
      changed = true;
    });
  resetDomCache();
  return changed;
}

export default {
  id: "commentBox",
  resolve: resolveCommentBox,
  isPlaced: isCommentBoxPlacedAt,
  place: placeCommentBox,
  cleanup: cleanupCommentBox,
  pendingWhenMissing: () =>
    Boolean(findTimelineContainer()) && isPendingPostNavSwap(),
  recovery: {
    expectedWhen: (settings) =>
      settings.sectionOrder.indexOf("commentBox") <
      settings.sectionOrder.indexOf("timeline"),
    landmark: () => findCommentForm(),
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/section-descriptor-comment-box.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Run full suite and commit**

Run: `npm test` — Expected: PASS.

```bash
git add src/js/content/features/sections/comment-box.js test/section-descriptor-comment-box.test.js
git commit -m "feat: add comment-box section descriptor"
```

---

### Task 5: Copilot section descriptor

**Files:**
- Create: `src/js/content/features/sections/copilot.js`
- Test: `test/section-descriptor-copilot.test.js`

**Interfaces:**
- Consumes: descriptor interface from Task 3; `findMergeBoxUnit` climb from `../../../lib/placement.js` (generic: works for any landmark).
- Produces: same descriptor shape; `id: "copilot"`; marker `data-gqol-copilot-moved`; NO styling and NO recovery declaration (the banner is optional content — it may legitimately never render); `pendingWhenMissing` omitted (defaults to absent → engine treats missing as fine).

**Selector honesty note:** `COPILOT_BANNER_SELECTORS` below is a best-guess candidate list; the real selector MUST be verified on a live PR page (Task 11 checklist). The descriptor's logic is selector-agnostic — updating the constant later changes no logic. Tests build their DOM with the first candidate.

- [ ] **Step 1: Write the failing tests**

Create `test/section-descriptor-copilot.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import copilotDescriptor from "../src/js/content/features/sections/copilot.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

function buildPage({ withBanner = true } = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);
  container.appendChild(descWrap);

  let banner = null;
  let bannerUnit = null;
  if (withBanner) {
    bannerUnit = document.createElement("div");
    bannerUnit.className = "copilot-banner-unit";
    banner = document.createElement("div");
    banner.setAttribute("data-testid", "copilot-pull-request-summaries");
    banner.textContent = "Copilot summary";
    bannerUnit.appendChild(banner);
    container.appendChild(bannerUnit);
  }

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  container.append(item1, item2);

  document.body.appendChild(container);
  resetDomCache();
  return { container, banner, bannerUnit, item1, item2 };
}

beforeEach(() => buildPage());

afterEach(() => {
  copilotDescriptor.cleanup();
  resetDomCache();
});

describe("copilot descriptor", () => {
  it("resolves null when the banner is absent", () => {
    expect(copilotDescriptor.resolve(buildPage({ withBanner: false }).container)).toBeNull();
  });

  it("resolves the banner's top-level flow unit", () => {
    const { container, bannerUnit } = buildPage();
    expect(copilotDescriptor.resolve(container)).toBe(bannerUnit);
  });

  it("place before: moves above the ref and marks the unit", () => {
    const { container, bannerUnit, item1 } = buildPage();
    const placed = copilotDescriptor.place(bannerUnit, container, "before", item1);
    expect(placed).toBe(bannerUnit);
    expect(item1.previousSibling).toBe(bannerUnit);
    expect(bannerUnit.getAttribute("data-gqol-copilot-moved")).toBe("1");
  });

  it("place after: moves directly after the ref", () => {
    const { container, bannerUnit, item2 } = buildPage();
    copilotDescriptor.place(bannerUnit, container, "after", item2);
    expect(bannerUnit.previousSibling).toBe(item2);
  });

  it("isPlaced requires the moved marker and adjacency", () => {
    const { container, bannerUnit, item1 } = buildPage();
    expect(copilotDescriptor.isPlaced(bannerUnit, container, "before", item1)).toBe(false);
    copilotDescriptor.place(bannerUnit, container, "before", item1);
    expect(copilotDescriptor.isPlaced(bannerUnit, container, "before", item1)).toBe(true);
  });

  it("cleanup restores the native position", () => {
    const { container, bannerUnit, item1 } = buildPage();
    copilotDescriptor.place(bannerUnit, container, "before", item1);
    copilotDescriptor.cleanup();
    expect(bannerUnit.hasAttribute("data-gqol-copilot-moved")).toBe(false);
    expect(bannerUnit.nextSibling).toBe(item1);
  });

  it("declares no recovery", () => {
    expect(copilotDescriptor.recovery).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/section-descriptor-copilot.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the descriptor**

Create `src/js/content/features/sections/copilot.js`:

```js
/**
 * Section descriptor: the Copilot banner rendered under the PR
 * description. Purely positional — the banner keeps its native look.
 *
 * The banner is optional content (repo/user settings may hide Copilot),
 * so a missing banner never counts as pending work and never declares
 * recovery.
 */

import { findMergeBoxUnit } from "../../../lib/placement.js";
import { anchorBefore, restoreAtAnchor } from "../../../lib/anchor.js";
import { TIMELINE_ITEM_SELECTOR } from "../../../lib/selectors.js";

// Candidate selectors for the banner landmark, probed in order. Verify
// against a live PR page (see plan Task 11) — updating this list changes
// no logic.
const COPILOT_BANNER_SELECTORS = [
  '[data-testid="copilot-pull-request-summaries"]',
  "copilot-pull-request-summaries",
  '[data-testid="copilot-pr-summary"]',
];

const COPILOT_MOVED_ATTR = "data-gqol-copilot-moved";

const copilotAnchors = new WeakMap();

function findCopilotBanner() {
  for (const selector of COPILOT_BANNER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function resolveCopilot(container) {
  const banner = findCopilotBanner();
  if (!banner?.isConnected || !container) return null;
  return (
    findMergeBoxUnit(banner, container, TIMELINE_ITEM_SELECTOR) ?? banner
  );
}

function isCopilotPlacedAt(el, container, mode, ref) {
  if (
    !el?.isConnected ||
    el.parentElement !== container ||
    el.getAttribute(COPILOT_MOVED_ATTR) !== "1"
  ) {
    return false;
  }
  return mode === "before" ? el.nextSibling === ref : el.previousSibling === ref;
}

function placeCopilot(el, container, mode, ref) {
  anchorBefore(copilotAnchors, el, el, "gqol-copilot-anchor");
  if (mode === "before") {
    container.insertBefore(el, ref ?? null);
  } else if (ref) {
    ref.after(el);
  } else {
    container.appendChild(el);
  }
  el.setAttribute(COPILOT_MOVED_ATTR, "1");
  return el;
}

function cleanupCopilot() {
  let changed = false;
  document
    .querySelectorAll(`[${COPILOT_MOVED_ATTR}="1"]`)
    .forEach((unit) => {
      restoreAtAnchor(copilotAnchors, unit, unit);
      unit.removeAttribute(COPILOT_MOVED_ATTR);
      changed = true;
    });
  return changed;
}

export default {
  id: "copilot",
  resolve: resolveCopilot,
  isPlaced: isCopilotPlacedAt,
  place: placeCopilot,
  cleanup: cleanupCopilot,
};
```

Note: `findMergeBoxUnit` is a generic "climb from landmark to top-level flow unit" helper; its name is historical. Add one doc line to it in `src/js/lib/placement.js` ("also used for the copilot banner unit") — no behavior change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/section-descriptor-copilot.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Run full suite and commit**

Run: `npm test` — Expected: PASS.

```bash
git add src/js/content/features/sections/copilot.js test/section-descriptor-copilot.test.js src/js/lib/placement.js
git commit -m "feat: add copilot banner section descriptor"
```

---

### Task 6: Section-order engine replaces mergebox + comment-box features

**Files:**
- Create: `src/js/content/features/section-order.js`
- Modify: `src/js/content/orchestrator.js` (imports + `FEATURES` + order comment)
- Delete: `src/js/content/features/mergebox.js`, `src/js/content/features/comment-box.js`, `test/mergebox.test.js`, `test/comment-box.test.js`
- Test: `test/section-order.test.js` (new), `test/orchestrator.test.js` (settings-shape literals only)

**Interfaces:**
- Consumes: descriptors from Tasks 3–5; orchestrator feature contract (`name`, `apply`, `needsWork`, `reset`, optional `recovery`).
- Produces: default-exported feature `{ name: "section-order", apply(settings), needsWork(settings), reset(), recovery: { expectedWhen(settings), isPresent() } }`.

- [ ] **Step 1: Write the failing tests**

Create `test/section-order.test.js`. The builder merges the old mergebox/comment-box builders plus a copilot banner:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sectionOrderFeature from "../src/js/content/features/section-order.js";
import { resetDomCache } from "../src/js/content/dom-cache.js";

const DEFAULTS = {
  timelineOrder: "newest",
  sectionOrder: ["copilot", "mergebox", "commentBox", "timeline"],
};

function buildPage() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.className = "js-discussion";

  const descGroup = document.createElement("div");
  descGroup.className = "timeline-comment-group TimelineItem-body";
  const desc = document.createElement("div");
  desc.setAttribute("data-testid", "pull-request-description");
  const descBody = document.createElement("div");
  descBody.className = "markdown-body";
  descBody.textContent = "PR description";
  desc.appendChild(descBody);
  descGroup.appendChild(desc);
  const descWrap = document.createElement("div");
  descWrap.className = "TimelineItem js-comment-container";
  descWrap.appendChild(descGroup);
  container.appendChild(descWrap);

  const bannerUnit = document.createElement("div");
  const banner = document.createElement("div");
  banner.setAttribute("data-testid", "copilot-pull-request-summaries");
  banner.textContent = "Copilot summary";
  bannerUnit.appendChild(banner);
  container.appendChild(bannerUnit);

  const stack = document.createElement("div");
  stack.className = "tmp-py-2 border bgColor-muted rounded-2 mt-2 Stack";
  const mergeBox = document.createElement("div");
  mergeBox.setAttribute("data-testid", "mergebox-partial");
  stack.appendChild(mergeBox);
  container.appendChild(stack);

  const item1 = document.createElement("div");
  item1.className = "js-timeline-item";
  item1.setAttribute("data-gid", "1");
  const item2 = document.createElement("div");
  item2.className = "js-timeline-item";
  item2.setAttribute("data-gid", "2");
  container.append(item1, item2);

  const commentWrapper = document.createElement("div");
  const form = document.createElement("form");
  form.className = "js-new-comment-form";
  const field = document.createElement("textarea");
  field.id = "new_comment_field";
  form.appendChild(field);
  commentWrapper.appendChild(form);
  const footer = document.createElement("div");
  footer.textContent =
    "Remember, contributions to this repository should follow our guidelines.";
  commentWrapper.appendChild(footer);
  container.appendChild(commentWrapper);

  document.body.appendChild(container);
  resetDomCache();
  return { container, descWrap, bannerUnit, stack, mergeBox, item1, item2, commentWrapper };
}

beforeEach(() => buildPage());

afterEach(() => {
  sectionOrderFeature.reset();
  resetDomCache();
});

function directChildren(container) {
  return [...container.children].map((el) =>
    el.classList.contains("gqol-mergebox-timeline-row")
      ? "mergebox"
      : el === document.querySelector("[data-gqol-copilot-moved='1']")
        ? "copilot"
        : el.hasAttribute("data-gqol-comment-box-moved")
          ? "commentBox"
          : el.classList.contains("js-timeline-item")
            ? "item"
            : "other",
  );
}

describe("section-order feature", () => {
  it("lays out the default order: copilot, mergebox, commentBox above the items", () => {
    const { container } = buildPage();
    expect(sectionOrderFeature.apply(DEFAULTS)).toBe(true);
    expect(directChildren(container)).toEqual([
      "other", "copilot", "mergebox", "commentBox", "item", "item", "other",
    ]);
  });

  it("places sections ranked after the timeline below the items", () => {
    const { container, commentWrapper } = buildPage();
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"],
    });
    // 6 children: footers stay INSIDE the box in after-mode.
    expect(directChildren(container)).toEqual([
      "other", "copilot", "mergebox", "item", "item", "commentBox",
    ]);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
  });

  it("reorders when the rank flips between passes", () => {
    const { container, bannerUnit } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "copilot", "commentBox", "timeline"],
    });
    expect(directChildren(container)).toEqual([
      "other", "mergebox", "copilot", "commentBox", "item", "item", "other",
    ]);
    expect(bannerUnit.getAttribute("data-gqol-copilot-moved")).toBe("1");
  });

  it("skips absent sections without failing", () => {
    const { container, bannerUnit } = buildPage();
    bannerUnit.remove();
    resetDomCache();
    sectionOrderFeature.apply(DEFAULTS);
    expect(directChildren(container)).toEqual([
      "other", "mergebox", "commentBox", "item", "item", "other",
    ]);
  });

  it("reports no needsWork once laid out", () => {
    buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    expect(sectionOrderFeature.needsWork(DEFAULTS)).toBe(false);
  });

  it("reports needsWork when a section is out of slot", () => {
    const { container } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.apply({
      ...DEFAULTS,
      sectionOrder: ["mergebox", "copilot", "commentBox", "timeline"],
    });
    expect(sectionOrderFeature.needsWork(DEFAULTS)).toBe(true);
  });

  it("reset restores every section to native positions", () => {
    const { container, descWrap, bannerUnit, stack, item1, item2, commentWrapper } = buildPage();
    sectionOrderFeature.apply(DEFAULTS);
    sectionOrderFeature.reset();
    expect([...container.children]).toEqual([
      descWrap, bannerUnit, stack, item1, item2, commentWrapper,
    ]);
    expect(document.querySelector(".gqol-mergebox-timeline-row")).toBe(null);
    expect(document.querySelector("[data-gqol-comment-footer-moved]")).toBe(null);
    expect(commentWrapper.hasAttribute("data-gqol-comment-box-moved")).toBe(false);
    expect(bannerUnit.hasAttribute("data-gqol-copilot-moved")).toBe(false);
  });

  it("aggregates recovery across descriptors", () => {
    buildPage();
    expect(sectionOrderFeature.recovery.expectedWhen(DEFAULTS)).toBe(true);
    expect(sectionOrderFeature.recovery.isPresent()).toBe(true);
    document.querySelector('[data-testid="mergebox-partial"]').remove();
    resetDomCache();
    expect(sectionOrderFeature.recovery.isPresent()).toBe(false);
  });
});
```

Note: `recovery.isPresent()` reads `lastAppliedSettings`, which is only set by an `apply` pass — call `sectionOrderFeature.apply(DEFAULTS)` (or rely on the `afterEach` reset order) before asserting `isPresent` in a fresh page. Adjust the recovery test to apply first if it fails on `lastAppliedSettings === null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/section-order.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the engine**

Create `src/js/content/features/section-order.js`:

```js
/**
 * Feature: user-configurable section order around the PR timeline.
 *
 * One engine, one ordering mechanism. Per-section DOM knowledge lives in
 * ./sections/ descriptors (resolve/isPlaced/place/cleanup); this feature
 * decides WHERE each section goes based on settings.sectionOrder:
 * ids ranked before "timeline" sit serially above the first timeline
 * item (in user order), ids ranked after sit serially below the last
 * item. The PR description is pinned above and never moves.
 *
 * Zone layout runs INSIDE-OUT: the before-zone places sections from the
 * rank closest to the timeline upwards (each new section is inserted
 * immediately before the previous one's outer element); the after-zone
 * mirrors it outwards from the last timeline item. Inserting against an
 * already-correct anchor keeps one pass correct for fresh pages; a
 * within-zone rank swap can need a follow-up pass, which needsWork
 * reports and the orchestrator's retry ladder re-applies.
 */

import { getDirectTimelineItems } from "../../lib/timeline.js";
import { TIMELINE_ITEM_SELECTOR } from "../../lib/selectors.js";
import {
  findFirstTimelineItemChild,
  findTimelineContainer,
  resetDomCache,
} from "../dom-cache.js";
import mergeboxDescriptor from "./sections/mergebox.js";
import commentBoxDescriptor from "./sections/comment-box.js";
import copilotDescriptor from "./sections/copilot.js";

const DESCRIPTORS = new Map(
  [copilotDescriptor, mergeboxDescriptor, commentBoxDescriptor].map(
    (descriptor) => [descriptor.id, descriptor],
  ),
);

// The recovery declaration's isPresent() has no settings argument; the
// engine remembers the last-applied settings for it.
let lastAppliedSettings = null;

function rankedIds(order, mode) {
  const timelineIndex = order.indexOf("timeline");
  return mode === "before"
    ? order.slice(0, timelineIndex)
    : order.slice(timelineIndex + 1);
}

function descriptorFor(id) {
  return DESCRIPTORS.get(id) ?? null;
}

/**
 * Before-zone: iterate ranks from LAST to FIRST, keeping the previous
 * iteration's outer element as the insertion anchor (successor anchor).
 * place() returns the outer element now in the slot (it may differ from
 * the resolved element, e.g. the mergebox row wrap) — always advance the
 * anchor with that return value, never a stale pre-place reference.
 */
function applyBeforeZone(container, order) {
  let didWork = false;
  let anchor = findFirstTimelineItemChild(container);

  for (let i = rankedIds(order, "before").length - 1; i >= 0; i--) {
    const descriptor = descriptorFor(rankedIds(order, "before")[i]);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) continue;
    if (!descriptor.isPlaced(el, container, "before", anchor)) {
      descriptor.place(el, container, "before", anchor);
      didWork = true;
    }
    // Re-resolve: place may have wrapped the element (row).
    anchor = descriptor.resolve(container) ?? anchor;
  }
  return didWork;
}

/**
 * After-zone: iterate ranks from FIRST to LAST, keeping the previous
 * iteration's outer element as the insertion anchor (predecessor
 * anchor), starting at the last timeline item.
 */
function applyAfterZone(container, order) {
  let didWork = false;
  const items = getDirectTimelineItems(container, TIMELINE_ITEM_SELECTOR);
  let anchor = items[items.length - 1] ?? null;

  for (const id of rankedIds(order, "after")) {
    const descriptor = descriptorFor(id);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) continue;
    if (!descriptor.isPlaced(el, container, "after", anchor)) {
      descriptor.place(el, container, "after", anchor);
      didWork = true;
    }
    anchor = descriptor.resolve(container) ?? anchor;
  }
  return didWork;
}

function applySectionOrder(settings) {
  const container = findTimelineContainer();
  if (!container) return false;
  lastAppliedSettings = settings;

  let didWork = applyAfterZone(container, settings.sectionOrder);
  didWork = applyBeforeZone(container, settings.sectionOrder) || didWork;

  resetDomCache();
  return didWork;
}

function needsWorkSectionOrder(settings) {
  const container = findTimelineContainer();
  if (!container) return false;

  let anchor = findFirstTimelineItemChild(container);
  for (let i = rankedIds(settings.sectionOrder, "before").length - 1; i >= 0; i--) {
    const descriptor = descriptorFor(rankedIds(settings.sectionOrder, "before")[i]);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) {
      if (descriptor.pendingWhenMissing?.()) return true;
      continue;
    }
    if (!descriptor.isPlaced(el, container, "before", anchor)) return true;
    anchor = el;
  }

  const items = getDirectTimelineItems(container, TIMELINE_ITEM_SELECTOR);
  anchor = items[items.length - 1] ?? null;
  for (const id of rankedIds(settings.sectionOrder, "after")) {
    const descriptor = descriptorFor(id);
    if (!descriptor) continue;
    const el = descriptor.resolve(container);
    if (!el) {
      if (descriptor.pendingWhenMissing?.()) return true;
      continue;
    }
    if (!descriptor.isPlaced(el, container, "after", anchor)) return true;
    anchor = el;
  }

  return false;
}

function resetSectionOrder() {
  for (const descriptor of DESCRIPTORS.values()) {
    descriptor.cleanup();
  }
  resetDomCache();
}

function expectedRecovery(settings) {
  return [...DESCRIPTORS.values()].some(
    (descriptor) => descriptor.recovery?.expectedWhen(settings),
  );
}

function recoveryPresent() {
  return [...DESCRIPTORS.values()].every(
    (descriptor) =>
      !descriptor.recovery?.expectedWhen(lastAppliedSettings) ||
      Boolean(descriptor.recovery.landmark()),
  );
}

export default {
  name: "section-order",
  apply: applySectionOrder,
  needsWork: needsWorkSectionOrder,
  reset: resetSectionOrder,
  recovery: {
    // A seen-and-expected section that vanishes with the DOM settled
    // means GitHub dropped our moved subtree — the orchestrator reloads.
    expectedWhen: expectedRecovery,
    isPresent: recoveryPresent,
  },
};
```

Implementation notes:
- `applyBeforeZone` re-resolves the descriptor after `place()` because `place` may swap the DOM element (mergebox wraps its unit in a new row); using the pre-place element as the next anchor would insert the previous rank INSIDE the row.
- Call `applyAfterZone` before `applyBeforeZone` so the before-zone's `findFirstTimelineItemChild` anchor sees the item stream undisturbed (neither zone moves items, but the ordering keeps the code honest if that ever changes).

- [ ] **Step 4: Rewire the orchestrator**

In `src/js/content/orchestrator.js`:

Replace imports (lines 42-46) with:

```js
import collapseDescription from "./features/collapse-description.js";
import sectionOrder from "./features/section-order.js";
import reverseTimeline from "./features/reverse-timeline.js";
import sortRow from "./features/sort-row.js";
```

(sort-row survives until Task 7; the deleted `mergeboxBelowDescription` and `commentBoxPlacement` imports are gone.) Replace the `FEATURES` array (lines 86-92) and its comment with:

```js
// Apply order matters: collapse first (reads the description in place),
// then the section layout (moves whole sections around the stream), then
// the reversal (reorders the stream itself), and finally the sort row
// (anchored above the comment box once it settled — removed in the next
// task).
const FEATURES = [
  collapseDescription,
  sectionOrder,
  reverseTimeline,
  sortRow,
];
```

Then delete the old features and their tests:

```bash
git rm src/js/content/features/mergebox.js src/js/content/features/comment-box.js test/mergebox.test.js test/comment-box.test.js
```

- [ ] **Step 5: Update `test/orchestrator.test.js` settings literals**

Mapping for every settings object in that file (line 188 and any sibling overrides):

- `{ ...DEFAULT_SETTINGS, reverseTimeline: false }` → `{ ...DEFAULT_SETTINGS, timelineOrder: "oldest" }` (also add `sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"]` — mirroring derivation already does this, but write it explicitly so the test states its intent).
- Any literal asserting comment-box-off behavior: override `sectionOrder: ["copilot", "mergebox", "timeline", "commentBox"]`.

The behavioral assertions (`gqol-mergebox-timeline-row`, `gqol-comment-box-at-top` present/absent) stay unchanged — the engine sets the same markers/classes. The `.gqol-sort-row` element built at line 124 stays valid (owned-selector filtering is unchanged and sort-row still exists until Task 7).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If an orchestrator test fails on ordering assertions, check whether the page builder places the merge box natively ABOVE the comment box vs below; the engine ranks by `sectionOrder`, so builders must reflect native layout (merge box near the end, comment box last).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: section-order engine replaces mergebox and comment-box features"
```

---

### Task 7: Delete the sort row and sort button

**Files:**
- Delete: `src/js/content/features/sort-row.js`, `src/js/lib/sort-button.js`, `test/sort-row.test.js`, `test/sort-button.test.js`
- Modify: `src/js/content/orchestrator.js` (imports, `FEATURES`, comments), `src/css/github-pr.css` (sort styles), `src/js/lib/icons.js` (drop `filterLeftIcon`), `src/js/content-github-pr.js` (header comment), `src/js/content/settings-cache.js` (comment), `src/popup.html` (helper text referencing the sort button)

**Interfaces:**
- Produces: `FEATURES = [collapseDescription, sectionOrder, reverseTimeline]`; no module anywhere imports `sort-button.js` or `filterLeftIcon`.

- [ ] **Step 1: Delete files and reroute the orchestrator**

```bash
git rm src/js/content/features/sort-row.js src/js/lib/sort-button.js test/sort-row.test.js test/sort-button.test.js
```

In `src/js/content/orchestrator.js`: remove the `sortRow` import and the `FEATURES` entry; final state:

```js
import collapseDescription from "./features/collapse-description.js";
import sectionOrder from "./features/section-order.js";
import reverseTimeline from "./features/reverse-timeline.js";

// Apply order matters: collapse first (reads the description in place),
// then the section layout (moves whole sections around the stream), then
// the reversal (reorders the stream the sections surround).
const FEATURES = [collapseDescription, sectionOrder, reverseTimeline];
```

- [ ] **Step 2: Remove sort CSS**

In `src/css/github-pr.css`, delete every rule whose selector contains `gqol-sort-row`, `gqol-sort-button` (lines ~297-405, including the `html[data-gqol-active] .gqol-sort-row` block and the dark-mode `:has()` variants).

- [ ] **Step 3: Drop `filterLeftIcon` and stale comments**

In `src/js/lib/icons.js`, delete the `filterLeftIcon` export (only sort-button used it — verify with a grep first; `collapse-description.js` uses only the chevrons).

In `src/js/content-github-pr.js`, replace the header feature list with:

```js
 * Features:
 * - User-configurable section order around the timeline
 * - Reverse PR timeline (newest first)
 * - Collapse long PR descriptions
```

In `src/js/content/settings-cache.js`, replace the comment "Invalidated when the sort button saves a new value or when chrome.storage.onChanged fires." with "Invalidated when chrome.storage.onChanged fires."

In `src/popup.html`, replace the "Reverse PR timeline" helper span (line 24, which references the sort button) with:

```html
          <span class="block text-xs leading-snug text-zinc-500">
            Newest or oldest first, applied on every PR page.
          </span>
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (no test imports the deleted modules; `test/orchestrator.test.js` line 124's `.gqol-sort-row` element is inert DOM the owned-selector filter still ignores).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove in-page sort button in favor of settings-driven order"
```

---

### Task 8: Contract — remove legacy setting keys

**Files:**
- Modify: `src/js/settings.js`
- Test: `test/settings.test.js`, `test/popup.test.js`, `test/orchestrator.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS = { timelineOrder, sectionOrder, collapsePrDescription }` only. `normalizeSettings` keeps the forward legacy→new migration forever; stored legacy booleans never resurface.

- [ ] **Step 1: Update the tests first**

In `test/settings.test.js`:

- The "keeps explicit booleans" test becomes:

```js
  it("keeps explicit values", () => {
    expect(
      normalizeSettings({
        timelineOrder: "oldest",
        collapsePrDescription: false,
        sectionOrder: ["timeline", "copilot", "commentBox", "mergebox"],
      }),
    ).toEqual({
      timelineOrder: "oldest",
      collapsePrDescription: false,
      sectionOrder: ["timeline", "copilot", "commentBox", "mergebox"],
    });
  });
```

- The "falls back per-key" test becomes:

```js
  it("falls back per-key when a value is undefined", () => {
    expect(normalizeSettings({ timelineOrder: "oldest" })).toEqual({
      ...DEFAULT_SETTINGS,
      timelineOrder: "oldest",
    });
  });
```

- The "coerces values with Boolean()" test becomes a boolean coercion on `collapsePrDescription`:

```js
  it("coerces boolean values", () => {
    expect(normalizeSettings({ collapsePrDescription: 0 })).toEqual({
      ...DEFAULT_SETTINGS,
      collapsePrDescription: false,
    });
  });
```

- Replace the legacy-mirror describe with a "legacy keys never surface" test:

```js
describe("normalizeSettings: legacy contraction", () => {
  it("drops legacy booleans from the output", () => {
    const s = normalizeSettings({ reverseTimeline: false, commentBoxAtTop: false });
    expect(Object.keys(s).sort()).toEqual(
      ["collapsePrDescription", "sectionOrder", "timelineOrder"].sort(),
    );
    expect(s.timelineOrder).toBe("oldest");
    expect(s.sectionOrder).toEqual(["copilot", "mergebox", "timeline", "commentBox"]);
  });
});
```

- Update `getSettings`/`saveSettings`/`ensureDefaultSettings` tests: replace stored-legacy expectations with new-shape ones, e.g. the sync-read test:

```js
  it("returns normalized settings from sync storage", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, { timelineOrder: "oldest" });
    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      timelineOrder: "oldest",
    });
  });
```

and the merge test:

```js
  it("merges a partial over existing settings and writes to sync", async () => {
    chrome.storage.sync.__store.set(STORAGE_KEY, { timelineOrder: "oldest" });
    const saved = await saveSettings({ collapsePrDescription: false });
    expect(saved).toEqual({ ...DEFAULT_SETTINGS, timelineOrder: "oldest", collapsePrDescription: false });
    expect(chrome.storage.sync.__store.get(STORAGE_KEY)).toEqual(saved);
  });
```

and the fallback write test saves `{ timelineOrder: "oldest" }`, asserting `saved.timelineOrder === "oldest"`; the `ensureDefaultSettings` "does not overwrite" test stores `{ timelineOrder: "oldest" }` and expects it untouched.

- The popupControlled test (from Task 1) expects `["collapsePrDescription", "showMergeBoxBelowDescription", "commentBoxAtTop"]` — after contraction only `collapsePrDescription` remains popup-controlled, so update it to:

```js
  it("keeps the popupControlled marking in sync with definitions", () => {
    const popupKeys = SETTING_DEFINITIONS.filter((d) => d.popupControlled);
    expect(popupKeys.map((d) => d.key)).toEqual(["collapsePrDescription"]);
  });
```

In `test/popup.test.js`: remove the `showMergeBoxBelowDescription` and `commentBoxAtTop` checkboxes from `buildPopupDom` and every assertion referencing them (the popup UI itself is reworked in Task 10; here it must merely not break).

In `test/orchestrator.test.js`: if any literal still overrides legacy keys, convert per the Task 6 mapping (they should already be new-shape; verify by grepping for `reverseTimeline|commentBoxAtTop|showMergeBoxBelowDescription` in `test/` — expect zero hits afterwards).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/settings.test.js test/popup.test.js`
Expected: FAIL — legacy keys still in `DEFAULT_SETTINGS`.

- [ ] **Step 3: Contract `src/js/settings.js`**

- Delete the three legacy entries from `SETTING_DEFINITIONS` (`reverseTimeline`, `showMergeBoxBelowDescription`, `commentBoxAtTop`).
- In `deriveSettings`, delete the three legacy mirror derivations (`next.reverseTimeline = ...`, `next.showMergeBoxBelowDescription = ...`, `next.commentBoxAtTop = ...`) — keep the forward migrations (`timelineOrder` from `reverseTimeline`, `sectionOrder` from the legacy booleans) exactly as written in Task 1.
- Update the file-top doc comment: remove the "popupControlled … reverseTimeline is toggled by the in-page sort button" sentence; state that legacy stored shapes are migrated forward on read.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/js/settings.js test/settings.test.js test/popup.test.js test/orchestrator.test.js
git commit -m "refactor: contract legacy boolean settings to timelineOrder/sectionOrder"
```

---

### Task 9: Options page

**Files:**
- Create: `src/options.html`, `src/js/options.js`
- Modify: `build.mjs`, `manifest.json`, `README.md`
- Test: `test/options.test.js`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `SECTION_IDS` from `settings.js`.
- Produces: options page at `src/options.html`; `manifest.json` gains `options_ui`; `build.mjs` emits `src/js/options.min.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/options.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, STORAGE_KEY } from "../src/js/settings.js";

const SECTION_ROW_SELECTOR = "[data-section-id]";

function buildOptionsDom() {
  document.body.innerHTML = `
    <ul id="section-list"></ul>
    <fieldset id="direction">
      <button data-direction="newest">Newest first</button>
      <button data-direction="oldest">Oldest first</button>
    </fieldset>
    <input data-setting="collapsePrDescription" type="checkbox" />
    <p id="options-status"></p>
  `;
}

async function importOptions() {
  vi.resetModules();
  return import("../src/js/options.js");
}

beforeEach(() => {
  globalThis.__resetChromeStorage();
  sessionStorage.clear();
  buildOptionsDom();
});

describe("options page", () => {
  it("renders one row per section in stored order", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: {
        sectionOrder: ["timeline", "copilot", "mergebox", "commentBox"],
      },
    });
    await importOptions();
    await vi.waitFor(() => {
      const ids = [...document.querySelectorAll(SECTION_ROW_SELECTOR)].map(
        (row) => row.dataset.sectionId,
      );
      expect(ids).toEqual(["timeline", "copilot", "mergebox", "commentBox"]);
    });
  });

  it("moves a section up and persists the new order", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(
        document.querySelectorAll(SECTION_ROW_SELECTOR).length,
      ).toBe(4);
    });

    const mergeboxRow = document.querySelector('[data-section-id="mergebox"]');
    mergeboxRow.querySelector("[data-move='up']").click();

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.sectionOrder).toEqual([
        "mergebox",
        "copilot",
        "commentBox",
        "timeline",
      ]);
    });
  });

  it("moves a section down and persists the new order", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(document.querySelectorAll(SECTION_ROW_SELECTOR).length).toBe(4);
    });

    const copilotRow = document.querySelector('[data-section-id="copilot"]');
    copilotRow.querySelector("[data-move='down']").click();

    await vi.waitFor(async () => {
      const settings = await getSettings();
      // Default [copilot, mergebox, commentBox, timeline]; copilot (index 0)
      // moved down one → [mergebox, copilot, commentBox, timeline].
      expect(settings.sectionOrder).toEqual([
        "mergebox",
        "copilot",
        "commentBox",
        "timeline",
      ]);
    });
  });

  it("persists the direction choice", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(document.querySelectorAll(SECTION_ROW_SELECTOR).length).toBe(4);
    });

    document.querySelector("[data-direction='oldest']").click();

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.timelineOrder).toBe("oldest");
    });
  });

  it("persists the collapse toggle", async () => {
    await importOptions();
    await vi.waitFor(() => {
      expect(document.querySelectorAll(SECTION_ROW_SELECTOR).length).toBe(4);
    });

    const input = document.querySelector('[data-setting="collapsePrDescription"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.collapsePrDescription).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/options.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/options.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GitHub QoL — Settings</title>
    <link rel="stylesheet" href="css/outputTailwind.css" />
  </head>
  <body class="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
    <div class="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header class="space-y-1">
        <h1 class="text-lg font-semibold text-zinc-50">GitHub QoL</h1>
        <p class="text-xs leading-relaxed text-zinc-500">
          Quality-of-life tweaks for GitHub pull requests.
        </p>
      </header>

      <section class="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4">
        <h2 class="text-sm font-medium text-zinc-200">Section order</h2>
        <p class="text-xs leading-snug text-zinc-500">
          The description always stays at the top. Sections above the timeline
          render between it and the activity; sections below render after it.
        </p>
        <ul id="section-list" class="space-y-1"></ul>
      </section>

      <section class="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4">
        <h2 class="text-sm font-medium text-zinc-200">Timeline direction</h2>
        <fieldset id="direction" class="flex gap-2">
          <button
            data-direction="newest"
            class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs"
          >Newest first</button>
          <button
            data-direction="oldest"
            class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs"
          >Oldest first</button>
        </fieldset>
      </section>

      <section class="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4">
        <h2 class="text-sm font-medium text-zinc-200">Description</h2>
        <label class="flex cursor-pointer gap-3">
          <input
            data-setting="collapsePrDescription"
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 focus:ring-2 focus:ring-blue-500/30"
          />
          <span class="text-sm text-zinc-200">Collapse long PR descriptions</span>
        </label>
      </section>

      <p id="options-status" class="min-h-[1rem] text-center text-[10px] text-zinc-600" aria-live="polite"></p>
    </div>

    <script type="module" src="js/options.min.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Implement `src/js/options.js`**

```js
import {
  getSettings,
  saveSettings,
  SECTION_IDS,
} from "./settings.js";

const SECTION_LABELS = {
  copilot: "Copilot banner",
  mergebox: "Merge status box",
  commentBox: "Comment box",
  timeline: "Comments & activity",
};

const statusEl = document.getElementById("options-status");
const listEl = document.getElementById("section-list");
const directionEl = document.getElementById("direction");

let statusTimeout = null;
let saveTimeout = null;
let currentOrder = [];

function showStatus(message) {
  statusEl.textContent = message;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await saveSettings({ sectionOrder: currentOrder });
      showStatus("Saved");
    } catch (error) {
      console.error("GitHub QoL options:", error);
      showStatus("Could not save");
    }
  }, 300);
}

function renderList() {
  listEl.innerHTML = "";
  currentOrder.forEach((id, index) => {
    const row = document.createElement("li");
    row.dataset.sectionId = id;
    row.className =
      "flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2";
    row.draggable = true;

    const handle = document.createElement("span");
    handle.className = "cursor-grab text-zinc-600 select-none";
    handle.textContent = "⠿";
    handle.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "flex-1 text-sm text-zinc-200";
    label.textContent = SECTION_LABELS[id] ?? id;

    const up = document.createElement("button");
    up.type = "button";
    up.dataset.move = "up";
    up.textContent = "↑";
    up.setAttribute("aria-label", `Move ${SECTION_LABELS[id]} up`);
    up.disabled = index === 0;
    up.className = "rounded px-2 text-zinc-400 disabled:opacity-30";
    up.addEventListener("click", () => moveSection(id, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.dataset.move = "down";
    down.textContent = "↓";
    down.setAttribute("aria-label", `Move ${SECTION_LABELS[id]} down`);
    down.disabled = index === currentOrder.length - 1;
    down.className = "rounded px-2 text-zinc-400 disabled:opacity-30";
    down.addEventListener("click", () => moveSection(id, 1));

    // HTML5 drag-and-drop: both paths call moveSectionTo, so buttons and
    // drags share one code path (buttons are the accessible floor).
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", id);
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      moveSectionTo(draggedId, index);
    });

    row.append(handle, label, up, down);
    listEl.appendChild(row);
  });
}

function moveSection(id, delta) {
  const index = currentOrder.indexOf(id);
  if (index === -1) return;
  moveSectionTo(id, index + delta);
}

function moveSectionTo(id, targetIndex) {
  const index = currentOrder.indexOf(id);
  if (index === -1) return;
  const clamped = Math.max(0, Math.min(currentOrder.length - 1, targetIndex));
  currentOrder.splice(clamped, 0, currentOrder.splice(index, 1)[0]);
  renderList();
  scheduleSave();
}

function renderDirection(timelineOrder) {
  for (const button of directionEl.querySelectorAll("[data-direction]")) {
    const active = button.dataset.direction === timelineOrder;
    button.classList.toggle("bg-blue-500/20", active);
    button.classList.toggle("border-blue-500", active);
    button.classList.toggle("text-zinc-100", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

for (const button of directionEl.querySelectorAll("[data-direction]")) {
  button.addEventListener("click", async () => {
    renderDirection(button.dataset.direction);
    try {
      await saveSettings({ timelineOrder: button.dataset.direction });
      showStatus("Saved");
    } catch (error) {
      console.error("GitHub QoL options:", error);
      showStatus("Could not save");
    }
  });
}

const collapseInput = document.querySelector(
  '[data-setting="collapsePrDescription"]',
);
collapseInput?.addEventListener("change", async () => {
  try {
    await saveSettings({ collapsePrDescription: collapseInput.checked });
    showStatus("Saved");
  } catch (error) {
    console.error("GitHub QoL options:", error);
    showStatus("Could not save");
  }
});

(async () => {
  const settings = await getSettings();
  currentOrder = settings.sectionOrder.filter((id) =>
    SECTION_IDS.includes(id),
  );
  renderList();
  renderDirection(settings.timelineOrder);
  if (collapseInput) collapseInput.checked = Boolean(settings.collapsePrDescription);
})().catch((error) => {
  console.error("GitHub QoL options:", error);
  showStatus("Could not load settings");
});
```

- [ ] **Step 5: Wire build + manifest**

In `build.mjs`, add `options.min` to the plugin entry group (lines 33-39):

```js
  {
    entryPoints: {
      "popup.min": "src/js/popup.js",
      "options.min": "src/js/options.js",
      "background.min": "src/js/background.js",
    },
    ...common,
    plugins: [externalSettingsPlugin],
  },
```

In `manifest.json`, add after the `action` block:

```json
  "options_ui": {
    "page": "src/options.html",
    "open_in_tab": true
  },
```

In `README.md`, append: `Settings live in the extension's options page (right-click the toolbar icon → Options, or via the popup's "Open settings" link).`

- [ ] **Step 6: Run tests and build**

Run: `npx vitest run test/options.test.js` — Expected: PASS (5 tests).
Run: `npm run build:js` — Expected: builds, including `src/js/options.min.js`.
Run: `npm test` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/options.html src/js/options.js build.mjs manifest.json README.md test/options.test.js
git commit -m "feat: add options page with section ordering and timeline direction"
```

---

### Task 10: Slim the popup

**Files:**
- Modify: `src/popup.html`, `src/js/popup.js`, `src/js/settings.js` (mark `timelineOrder` popup-controlled)
- Test: `test/popup.test.js`

**Interfaces:**
- Consumes: `SETTING_DEFINITIONS` entries with `popupControlled: true`; `chrome.runtime.openOptionsPage()`.
- Produces: popup renders a "Newest first" checkbox (enum bound via `data-on`/`data-off`) and an "Open settings" button. The chrome.runtime mock in `test/setup.js` needs `openOptionsPage` — add it there.

- [ ] **Step 1: Write the failing tests**

Rewrite `test/popup.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSettings, STORAGE_KEY } from "../src/js/settings.js";

function buildPopupDom() {
  document.body.innerHTML = `
    <input data-setting="timelineOrder" data-on="newest" data-off="oldest" type="checkbox" />
    <input data-setting="collapsePrDescription" type="checkbox" />
    <button id="open-options"></button>
    <p id="popup-status"></p>
  `;
}

async function importPopup() {
  vi.resetModules();
  return import("../src/js/popup.js");
}

beforeEach(() => {
  globalThis.__resetChromeStorage();
  sessionStorage.clear();
  buildPopupDom();
});

describe("popup", () => {
  it("loads timelineOrder newest as a checked box", async () => {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { timelineOrder: "oldest" },
    });
    await importPopup();
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-setting="timelineOrder"]').checked,
      ).toBe(false);
    });
  });

  it("persists a direction flip", async () => {
    await importPopup();
    await vi.waitFor(async () => {
      expect(await getSettings()).toBeTruthy();
    });

    const input = document.querySelector('[data-setting="timelineOrder"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(async () => {
      const settings = await getSettings();
      expect(settings.timelineOrder).toBe("oldest");
      expect(settings.sectionOrder).toEqual([
        "copilot", "mergebox", "commentBox", "timeline",
      ]);
    });
  });

  it("opens the options page from the link", async () => {
    let opened = false;
    chrome.runtime.openOptionsPage = () => {
      opened = true;
      return Promise.resolve();
    };
    await importPopup();
    document.getElementById("open-options").click();
    expect(opened).toBe(true);
  });
});
```

Also add to `test/setup.js`'s `chrome.runtime` object: `openOptionsPage: () => Promise.resolve(),` (the test overrides it locally anyway, but the default prevents TypeErrors in other popup-importing tests).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/popup.test.js`
Expected: FAIL — popup.js has no enum handling and no options button.

- [ ] **Step 3: Implement**

In `src/js/settings.js`, mark the enum popup-controlled:

```js
  { key: "timelineOrder", type: "enum", values: TIMELINE_ORDERS, default: "newest", popupControlled: true },
```

Rewrite `src/popup.html` body content (keep head/Tailwind link and script tag; the fieldset's four rows become two):

```html
    <div class="flex flex-col gap-4 p-4">
      <header class="space-y-1">
        <h1 class="text-base font-semibold text-zinc-50">GitHub QoL</h1>
        <p class="text-xs leading-relaxed text-zinc-500">
          Quality-of-life tweaks for GitHub pull requests.
        </p>
      </header>

      <fieldset class="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3">
        <legend class="sr-only">Features</legend>

        <label class="flex cursor-pointer gap-3">
          <input
            data-setting="timelineOrder"
            data-on="newest"
            data-off="oldest"
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 focus:ring-2 focus:ring-blue-500/30"
          />
          <span class="min-w-0 space-y-0.5">
            <span class="block text-sm font-medium text-zinc-200">Timeline newest first</span>
            <span class="block text-xs leading-snug text-zinc-500">
              Unchecked shows the oldest activity at the top instead.
            </span>
          </span>
        </label>

        <label class="flex cursor-pointer gap-3">
          <input
            data-setting="collapsePrDescription"
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 rounded border-zinc-600 bg-zinc-950 text-blue-500 focus:ring-2 focus:ring-blue-500/30"
          />
          <span class="min-w-0 space-y-0.5">
            <span class="block text-sm font-medium text-zinc-200">Collapse PR description</span>
            <span class="block text-xs leading-snug text-zinc-500">
              Show a short preview; click to expand the full description.
            </span>
          </span>
        </label>
      </fieldset>

      <button
        id="open-options"
        class="w-full rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
      >
        Open settings
      </button>

      <p id="popup-status" class="min-h-[1rem] text-center text-[10px] text-zinc-600" aria-live="polite"></p>
    </div>
```

Rewrite the binding loop in `src/js/popup.js` (keep `showStatus`; replace the `settingInputs` construction and both loops):

```js
const settingInputs = new Map(
  SETTING_DEFINITIONS.filter((definition) => definition.popupControlled).map(
    (definition) => [
      definition.key,
      document.querySelector(`[data-setting="${definition.key}"]`),
    ],
  ),
);

// Booleans bind checked directly; enums bind through data-on/data-off so
// one checkbox expresses "newest" vs "oldest".
function readInput(definition, input) {
  if (definition.type === "enum") {
    return input.checked ? input.dataset.on : input.dataset.off;
  }
  return input.checked;
}

function writeInput(definition, input, value) {
  if (definition.type === "enum") {
    input.checked = value === input.dataset.on;
  } else {
    input.checked = Boolean(value);
  }
}

const definitionsByKey = new Map(
  SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
);

for (const [key, input] of settingInputs) {
  if (!input) {
    console.warn(`GitHub QoL popup: no control for setting "${key}".`);
    continue;
  }
  input.addEventListener("change", async () => {
    try {
      await saveSettings({ [key]: readInput(definitionsByKey.get(key), input) });
      showStatus("Saved");
    } catch (error) {
      console.error("GitHub QoL popup:", error);
      showStatus("Could not save");
    }
  });
}

document
  .getElementById("open-options")
  ?.addEventListener("click", () => chrome.runtime.openOptionsPage());

(async () => {
  const settings = await getSettings();
  for (const [key, input] of settingInputs) {
    if (input) writeInput(definitionsByKey.get(key), input, settings[key]);
  }
})().catch((error) => {
  console.error("GitHub QoL popup:", error);
  showStatus("Could not load settings");
});
```

- [ ] **Step 4: Run the full suite and build**

Run: `npm test` — Expected: PASS (note: `test/settings.test.js`'s popupControlled expectation from Task 8 must now list `["timelineOrder", "collapsePrDescription"]` in definition order — update it in the same edit as the settings.js change).

Run: `npm run build` — Expected: builds.

- [ ] **Step 5: Commit**

```bash
git add src/popup.html src/js/popup.js src/js/settings.js test/popup.test.js test/settings.test.js test/setup.js
git commit -m "feat: slim popup to direction toggle and options link"
```

---

### Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build**

Run: `npm test` — Expected: PASS, zero skipped/failed.
Run: `npm run build` — Expected: builds `content-github-pr.bundle.min.js`, `popup.min.js`, `options.min.js`, `background.min.js`, `settings.min.js`, CSS.

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "reverseTimeline\|commentBoxAtTop\|showMergeBoxBelowDescription\|sort-button\|sort-row" src/ test/`
Expected: only matches inside `deriveSettings` forward-migration code in `src/js/settings.js` (and none in `test/`).

- [ ] **Step 3: Manual smoke test (load unpacked)**

1. `chrome://extensions` → Load unpacked → this directory (after `npm run build`).
2. Open any PR conversation page with default settings: description pinned, then Copilot banner, merge box, comment box, then activity newest-first; no sort button anywhere.
3. Options page (right-click icon → Options): reorder "Merge status box" below "Comments & activity" → PR page (after reload/storage sync) shows merge box after the items.
4. Popup: uncheck "Timeline newest first" → items re-reverse to oldest-first, comment box/merge box keep their section ranks.
5. Copilot selector verification: on a PR page with the Copilot banner, DevTools-inspect the banner under the description; if none of `src/js/content/features/sections/copilot.js`'s `COPILOT_BANNER_SELECTORS` match it, replace the list with the observed selector and re-run `npx vitest run test/section-descriptor-copilot.test.js` (tests use the first candidate — update the test DOM if the first candidate changes).
6. Toggle each option off/on; confirm layout restores exactly (anchors) and no console errors.

- [ ] **Step 4: Final commit (if the selector needed adjusting)**

```bash
git add src/js/content/features/sections/copilot.js test/section-descriptor-copilot.test.js
git commit -m "fix: verified copilot banner selector against live GitHub DOM"
```
