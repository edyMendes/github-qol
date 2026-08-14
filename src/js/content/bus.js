/**
 * Tiny dependency-injection bus.
 *
 * Leaf modules (features, hydration) need to trigger orchestrator actions
 * (revalidate, apply now) without importing the orchestrator — that would
 * create an import cycle. The orchestrator registers its handlers at
 * startup; until then the bus is a safe no-op.
 */

let applyNowHandler = async () => false;
let revalidateHandler = () => {};

export function registerBus({ applyNow, requestRevalidate }) {
  if (typeof applyNow === "function") applyNowHandler = applyNow;
  if (typeof requestRevalidate === "function") revalidateHandler = requestRevalidate;
}

/** Run a full apply pass immediately (sort button clicks). */
export function requestApplyNow() {
  return applyNowHandler();
}

/** Request a debounced revalidation pass (observers, retries, storage). */
export function requestRevalidate() {
  revalidateHandler();
}
