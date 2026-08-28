# User-configurable section order + options page — Design

Date: 2026-08-24
Status: Approved (design sections 1-4 reviewed in chat)

## Problem

The extension's section placement is hardcoded through pairwise-coupled
boolean settings: `showMergeBoxBelowDescription` and `commentBoxAtTop`
encode fixed positions, and the in-page sort button owns the
`reverseTimeline` toggle. Users cannot choose where the PR page sections
(Description, Copilot banner, merge status box, comment box, timeline)
sit relative to each other.

## Decision (from brainstorming)

- Orderable sections: **Copilot banner, merge box, comment box, timeline
  (one unit)**. The PR description is **pinned at the top** and is not
  orderable.
- The timeline is one contiguous unit — comments, commits, checks and
  logs are NOT split apart. Internal timeline order stays the
  newest/oldest setting.
- The in-page **sort button is removed**. Its function moves to the
  options page (and a quick toggle in the popup).
- UI lives on a **dedicated options page**; the popup slims down to a
  direction toggle plus an "Open settings" link.
- Approach: **A — section-layout engine**. One feature owns all section
  placement, driven by a `sectionOrder` array. (Rejected alternative B —
  parameterizing the existing features individually — keeps ordering
  logic distributed and pairwise-coupled, which is the current
  codebase's core fragility.)

## 1. Settings model & migration

`src/js/settings.js` grows beyond booleans:

- `SETTING_DEFINITIONS` entries gain a `type`:
  `boolean | enum | sectionOrder`.
- Replaced keys:
  - `reverseTimeline: boolean` → `timelineOrder: "newest" | "oldest"`
  - `showMergeBoxBelowDescription` + `commentBoxAtTop` →
    `sectionOrder: string[]` with ids `copilot`, `mergebox`,
    `commentBox`, `timeline`.
- Kept unchanged: `collapsePrDescription` (boolean).
- Default `sectionOrder` reproduces today's layout exactly:
  `["copilot", "mergebox", "commentBox", "timeline"]`.
- `normalizeSettings` learns:
  - enum: validate against allowed values, fall back to default;
  - sectionOrder: sanitize — drop unknown ids, dedupe, append missing
    ids (in canonical order) — so any stored garbage yields a valid
    layout.
- **Migration** happens inside `normalizeSettings` (runs on every read
  everywhere):
  - old `reverseTimeline: false` → `timelineOrder: "oldest"`;
  - old `showMergeBoxBelowDescription: false` → `mergebox` ranked
    after `timeline`;
  - old `commentBoxAtTop: false` (or `reverseTimeline: false`) →
    `commentBox` ranked after `timeline`.
- Storage flow is untouched: sync-first/local-fallback, single
  `STORAGE_KEY`, cached-settings invalidation on change.

## 2. Options page & popup

- New `src/options.html` + `src/js/options.js`, bundled as
  `options.min.js` via the existing external-settings build plugin.
  Manifest gains `options_ui: { page: "src/options.html",
  open_in_tab: true }`.
- Options page (Tailwind, dark styling matching the popup):
  - **Sections list**: one row per `sectionOrder` entry. Description
    renders as a locked first row for context only. Timeline row
    labeled "Comments & activity". Reordering via drag handle AND
    up/down buttons (accessibility floor). Saves (debounced) with a
    popup-style status line.
  - **Timeline direction**: segmented control bound to `timelineOrder`.
  - **Collapse PR description**: checkbox moved here from the popup.
- Popup slims to: timeline-direction quick toggle, "Open settings"
  link (`chrome.runtime.openOptionsPage()`), status line. Keeps the
  generic `data-setting` binding pattern where possible.
- Options and popup share `settings.js`; no duplicated defaults.

## 3. Section-layout engine (content script)

New `src/js/content/features/section-order.js` — a single feature that
**absorbs and replaces** `mergebox.js` and `comment-box.js`.

- **Descriptor registry** (module-local, mirroring the orchestrator's
  feature registry). One descriptor per orderable section; each owns
  its DOM knowledge:
  - `id`, `resolve(cache)` (find the movable unit), `style(unit)` /
    `wrap(unit)` (native-look preservation), `restore()`.
  - mergebox descriptor: today's row-wrapping + stripped-classes logic
    verbatim.
  - commentBox descriptor: today's footer-extraction + protected-region
    registration verbatim.
  - copilot descriptor (new): resolves the Copilot banner under the
    description; selector identified during implementation (existing
    code already positions around this element, so the landmark is
    known to exist).
- **Layout pass** (`apply(settings)`):
  1. Resolve container, pinned description, timeline stream bounds.
  2. For each descriptor in `sectionOrder` order: units ranked before
     `timeline` are inserted serially above the first timeline item
     (array order); units ranked after are appended after the last
     item, before the footer texts (guidelines/ProTip pinning
     generalizes to "non-item bottom content").
  3. `needsWork`: any resolved unit not in its ranked slot, or an
     expected-but-unresolved section inside the post-nav swap window
     (today's `isPendingPostNavSwap` pattern).
  4. `reset()`: run every descriptor's `restore()`; per-descriptor
     anchor WeakMaps (mechanism unchanged).
- **reverse-timeline stays a separate feature**, now keyed on
  `timelineOrder` — it orders items inside the stream only. The
  `commentBoxAtTop && reverseTimeline` conjunction logic is deleted;
  "comment box follows sort" becomes a natural consequence of where
  the user places `commentBox` relative to `timeline`.
- **sort-row feature deleted**: file, CSS, tests, anchor logic. The
  orchestrator's `GQOL_OWNED_SELECTOR` filter stays (status card still
  needs it).
- **Orchestrator `FEATURES` order**: `collapse-description` →
  `section-order` → `reverse-timeline`. (Collapse reads the description
  in place first; reversal reorders the stream last.) Recovery
  declarations port over per descriptor — same
  `expectedWhen`/`isPresent`, evaluated against `sectionOrder` rank
  instead of booleans.

## 4. Edge cases, error handling, testing

- **Missing sections** (locked PRs, absent merge box/banner): an
  unresolvable descriptor contributes nothing to layout. `needsWork`
  stays pending only for expected sections during the post-nav swap
  window.
- **GitHub re-render fights**: existing defenses port unchanged —
  anchor WeakMaps, settle probe, per-feature `resetDomCache`,
  one-reload-per-page-key recovery (now declared per descriptor).
  `hydration.js`, `bus.js`, `status.js` untouched.
- **Observer hygiene**: descriptor `style()` writes are one-time;
  `needsWork` slot checks keep re-passes idempotent; the sort button's
  mutation noise is deleted outright.
- **Testing** (vitest + jsdom):
  - `settings.test.js`: enum validation, sectionOrder sanitization,
    the old-boolean migration cases.
  - New `section-order.test.js` (ported from mergebox/comment-box
    tests + new): rank permutations, pinned description, footer
    pinning, restore, recovery declarations, `needsWork` slots.
  - New `options.test.js`: render from settings, reorder writes the
    array, drag/button parity.
  - `popup.test.js`: direction toggle writes `timelineOrder`.
  - Delete `sort-button.test.js`, `sort-row.test.js`; update
    `orchestrator.test.js` for the new FEATURES order.
  - `build.mjs`: add the `options.min` entry (same
    external-settings plugin).

## Out of scope

- Splitting comments/commits/checks/logs into separately orderable
  groups (fragile against GitHub's DOM; explicitly rejected).
- Ordering the PR description itself.
- Any new sections beyond the four agreed ids (though the registry
  makes adding one cheap later).
