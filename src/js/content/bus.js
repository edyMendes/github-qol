/**
 * Tiny dependency-injection bus.
 *
 * Leaf modules (features, hydration) need to trigger orchestrator actions
 * (revalidate) without importing the orchestrator — that would create an
 * import cycle. The orchestrator registers its handlers at startup; until
 * then the bus is a safe no-op.
 */

let revalidateHandler = () => {};

export function registerBus({ requestRevalidate }) {
  if (typeof requestRevalidate === "function") revalidateHandler = requestRevalidate;
}

/** Request a debounced revalidation pass (observers, retries, storage). */
export function requestRevalidate() {
  revalidateHandler();
}
