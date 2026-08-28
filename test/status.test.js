import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setProgressProvider,
  renderStatus,
  clearStatusCard,
} from "../src/js/content/status.js";

/**
 * status.js is a dumb renderer: a feature registers one progress
 * provider (settings → {label, progress, indeterminate} | null) and the
 * renderer draws whatever it returns. No polling interval — the feature
 * and the apply lifecycle drive re-renders.
 */

const DESCRIPTOR = {
  label: "Sorting timeline newest first…",
  progress: 92,
  indeterminate: false,
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  setProgressProvider(null);
  clearStatusCard();
});

function card() {
  return document.getElementById("gqol-timeline-status");
}

describe("status renderer", () => {
  it("renders the provider's descriptor as the floating card", () => {
    setProgressProvider(() => DESCRIPTOR);
    renderStatus({});
    expect(card()).not.toBeNull();
    expect(card().querySelector(".gqol-timeline-status__label").textContent).toBe(
      DESCRIPTOR.label,
    );
    expect(
      card().querySelector(".gqol-timeline-status__bar").style.width,
    ).toBe("92%");
  });

  it("clamps progress into the 8%–98% band", () => {
    setProgressProvider(() => ({ label: "x", progress: 2, indeterminate: true }));
    renderStatus({});
    expect(card().querySelector(".gqol-timeline-status__bar").style.width).toBe(
      "8%",
    );
    setProgressProvider(() => ({ label: "x", progress: 500, indeterminate: false }));
    renderStatus({});
    expect(card().querySelector(".gqol-timeline-status__bar").style.width).toBe(
      "98%",
    );
  });

  it("toggles the indeterminate track class", () => {
    setProgressProvider(() => ({ label: "x", progress: 20, indeterminate: true }));
    renderStatus({});
    expect(
      card()
        .querySelector(".gqol-timeline-status__track")
        .classList.contains("gqol-timeline-status__track--indeterminate"),
    ).toBe(true);
  });

  it("removes the card when the provider returns null but keeps the provider", () => {
    let current = DESCRIPTOR;
    setProgressProvider(() => current);
    renderStatus({});
    expect(card()).not.toBeNull();

    current = null;
    renderStatus({});
    expect(card()).toBeNull();

    current = DESCRIPTOR;
    renderStatus({});
    expect(card()).not.toBeNull();
  });

  it("renders nothing without a provider", () => {
    renderStatus({});
    expect(card()).toBeNull();
  });

  it("skips identical re-renders (no DOM write for the same state)", () => {
    setProgressProvider(() => DESCRIPTOR);
    renderStatus({});
    const label = card().querySelector(".gqol-timeline-status__label");
    label.textContent = " externally changed ";
    renderStatus({}); // same descriptor → deduped, external write stays
    expect(label.textContent).toBe(" externally changed ");
  });

  it("does not start any polling interval", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    setProgressProvider(() => DESCRIPTOR);
    renderStatus({});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("setProgressProvider(null) unregisters the provider", () => {
    setProgressProvider(() => DESCRIPTOR);
    renderStatus({});
    expect(card()).not.toBeNull();
    setProgressProvider(null);
    renderStatus({});
    expect(card()).toBeNull();
  });

  it("passes settings through to the provider", () => {
    const provider = vi.fn(() => null);
    setProgressProvider(provider);
    const settings = { timelineOrder: "oldest" };
    renderStatus(settings);
    expect(provider).toHaveBeenCalledWith(settings);
  });
});
