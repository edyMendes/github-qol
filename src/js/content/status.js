/**
 * Timeline status UI: a floating progress card. A dumb renderer — the
 * feature that owns the work (reverse-timeline) registers one progress
 * provider (settings → {label, progress, indeterminate} | null) and the
 * renderer draws whatever it currently returns. No polling interval:
 * the feature's hydration tick and the apply lifecycle drive re-renders.
 */

const TIMELINE_STATUS_ID = "gqol-timeline-status";

let progressProvider = null;
let statusRefs = null; // { el, labelEl, barEl, trackEl }
// Last rendered state: repeated renders with identical output skip the
// DOM writes, which would otherwise be pure observer noise and recalc.
let lastRenderKey = null;

/**
 * Register the (single) progress provider. Pass null to unregister.
 * Providers must be pure: settings in, descriptor-or-null out.
 */
export function setProgressProvider(provider) {
  progressProvider = provider;
}

/** Remove the card but keep the provider registered. */
export function clearStatusCard() {
  lastRenderKey = null;
  // Id lookup, not just the cached refs: the card may have been removed
  // behind our back (e.g. a test resetting the body).
  document.getElementById(TIMELINE_STATUS_ID)?.remove();
  statusRefs = null;
}

function ensureStatusCard() {
  if (statusRefs?.el.isConnected) return statusRefs;

  const el = document.createElement("div");
  el.id = TIMELINE_STATUS_ID;
  el.className = "gqol-timeline-status";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <div class="gqol-timeline-status__inner">
      <p class="gqol-timeline-status__label"></p>
      <div class="gqol-timeline-status__track" aria-hidden="true">
        <div class="gqol-timeline-status__bar"></div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  statusRefs = {
    el,
    labelEl: el.querySelector(".gqol-timeline-status__label"),
    barEl: el.querySelector(".gqol-timeline-status__bar"),
    trackEl: el.querySelector(".gqol-timeline-status__track"),
  };
  lastRenderKey = null;
  return statusRefs;
}

/** Render the provider's current descriptor (or remove the card). */
export function renderStatus(settings) {
  const descriptor = progressProvider?.(settings);
  if (!descriptor) {
    clearStatusCard();
    return;
  }

  const { labelEl, barEl, trackEl } = ensureStatusCard();
  const width = `${Math.round(Math.min(98, Math.max(8, descriptor.progress)))}%`;
  const renderKey = `${descriptor.label}|${width}|${descriptor.indeterminate}`;
  if (renderKey === lastRenderKey) return;

  labelEl.textContent = descriptor.label;
  barEl.style.width = width;
  trackEl.classList.toggle(
    "gqol-timeline-status__track--indeterminate",
    descriptor.indeterminate,
  );
  lastRenderKey = renderKey;
}

/** Full teardown: forget the provider and remove the card. */
export function resetStatus() {
  progressProvider = null;
  clearStatusCard();
}
