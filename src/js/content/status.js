/**
 * Timeline status UI: a floating "sorting…" progress card shown while the
 * reversed timeline is still hydrating. Also owns the phase state
 * ("hydrating" / "reversing") that the reverse-timeline feature drives.
 */

import { getCachedSettings } from "./settings-cache.js";
import { findTimelineContainer, getTimelineItems } from "./dom-cache.js";
import { isPullRequestPage } from "./page.js";
import {
  TIMELINE_HYDRATION_TIMEOUT_MS,
  timelineHasLoadingContent,
  timelineNeedsHydration,
} from "./hydration.js";
import { REVERSED_ATTR } from "./selectors.js";

const TIMELINE_STATUS_ID = "gqol-timeline-status";
const STATUS_REFRESH_MS = 200;

let statusRefreshInterval = null;
let timelinePhase = null; // null | "hydrating" | "reversing"
let hydrationStartedAt = 0;
// Last rendered state: the 200ms refresh skips identical DOM writes, which
// would otherwise be pure observer noise and style recalc.
let lastRenderKey = null;

export function setTimelinePhase(phase) {
  timelinePhase = phase;
}

export function setHydrationStartedAt(timestamp) {
  hydrationStartedAt = timestamp;
}

function getStatusDescriptor(settings) {
  if (!settings.reverseTimeline || !isPullRequestPage()) return null;

  const container = findTimelineContainer();
  const items = getTimelineItems();

  if (container?.getAttribute(REVERSED_ATTR) === "1") return null;

  if (timelinePhase === "reversing") {
    return {
      label: "Sorting timeline newest first…",
      progress: 92,
      indeterminate: false,
    };
  }

  if (timelinePhase === "hydrating" || (container && timelineHasLoadingContent(container))) {
    const elapsed = hydrationStartedAt ? Date.now() - hydrationStartedAt : 0;
    const ratio = Math.min(1, elapsed / TIMELINE_HYDRATION_TIMEOUT_MS);
    return {
      label: "Loading timeline activity…",
      progress: 34 + 48 * ratio,
      indeterminate: ratio < 0.08,
    };
  }

  if (items.length < 2) {
    return {
      label: "Waiting for timeline…",
      progress: items.length === 0 ? 14 : 26,
      indeterminate: true,
    };
  }

  if (container && timelineNeedsHydration(container)) {
    return {
      label: "Loading deferred timeline items…",
      progress: 38,
      indeterminate: true,
    };
  }

  return { label: "Preparing timeline…", progress: 84, indeterminate: false };
}

export function clearStatus() {
  timelinePhase = null;
  hydrationStartedAt = 0;
  lastRenderKey = null;
  if (statusRefreshInterval) {
    clearInterval(statusRefreshInterval);
    statusRefreshInterval = null;
  }
  document.getElementById(TIMELINE_STATUS_ID)?.remove();
}

export function updateStatus(settings) {
  const descriptor = getStatusDescriptor(settings);
  if (!descriptor) {
    clearStatus();
    return;
  }

  let statusEl = document.getElementById(TIMELINE_STATUS_ID);
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = TIMELINE_STATUS_ID;
    statusEl.className = "gqol-timeline-status";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    statusEl.innerHTML = `
    <div class="gqol-timeline-status__inner">
      <p class="gqol-timeline-status__label"></p>
      <div class="gqol-timeline-status__track" aria-hidden="true">
        <div class="gqol-timeline-status__bar"></div>
      </div>
    </div>
  `;
    document.body.appendChild(statusEl);
  }

  const labelEl = statusEl.querySelector(".gqol-timeline-status__label");
  const barEl = statusEl.querySelector(".gqol-timeline-status__bar");
  const trackEl = statusEl.querySelector(".gqol-timeline-status__track");

  if (!labelEl || !barEl || !trackEl) return;

  const width = `${Math.round(Math.min(98, Math.max(8, descriptor.progress)))}%`;
  const renderKey = `${descriptor.label}|${width}|${descriptor.indeterminate}`;
  if (renderKey !== lastRenderKey) {
    labelEl.textContent = descriptor.label;
    barEl.style.width = width;
    trackEl.classList.toggle(
      "gqol-timeline-status__track--indeterminate",
      descriptor.indeterminate,
    );
    lastRenderKey = renderKey;
  }

  if (!statusRefreshInterval) {
    statusRefreshInterval = setInterval(() => {
      getCachedSettings()
        .then((current) => updateStatus(current))
        .catch(() => {});
    }, STATUS_REFRESH_MS);
  }
}
