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

/** Read and normalize the stored settings; null when nothing usable. */
function readStoredSettings(area) {
  return chrome.storage[area].get(STORAGE_KEY).then((items) => {
    const stored = items[STORAGE_KEY];
    return stored && typeof stored === "object"
      ? normalizeSettings(stored)
      : null;
  });
}

function writeSettings(area, settings) {
  return chrome.storage[area].set({ [STORAGE_KEY]: settings });
}

/** Sync first, local as fallback (sync can be unavailable/disabled). */
export async function getSettings() {
  for (const area of ["sync", "local"]) {
    try {
      const settings = await readStoredSettings(area);
      if (settings) return settings;
    } catch {
      // Area unavailable — try the next.
    }
  }
  return { ...DEFAULT_SETTINGS };
}

/** Write to `area`, falling back to the other one on failure. */
async function writeWithFallback(preferred, settings) {
  const fallback = preferred === "sync" ? "local" : "sync";
  try {
    await writeSettings(preferred, settings);
  } catch {
    await writeSettings(fallback, settings);
  }
}

export async function saveSettings(partial) {
  const next = normalizeSettings({ ...(await getSettings()), ...partial });
  await writeWithFallback("sync", next);
  return next;
}

export async function ensureDefaultSettings() {
  for (const area of ["sync", "local"]) {
    try {
      if (!(await readStoredSettings(area))) {
        await writeSettings(area, { ...DEFAULT_SETTINGS });
      }
      return;
    } catch {
      // Area unavailable — try the next.
    }
  }
}
