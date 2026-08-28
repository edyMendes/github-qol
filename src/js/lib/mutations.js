/**
 * Mutation-record predicates: telling GitHub's DOM writes from the
 * extension's own UI, so observers never revalidate in response to
 * their own rendering.
 */

// Elements the extension itself renders. Mutations whose target lives
// inside one of these must never trigger revalidation — re-applying
// writes to them again, which would feed the observer forever.
const GQOL_OWNED_SELECTOR = '#gqol-timeline-status, [class*="gqol-"]';

/** True when at least one mutation record comes from outside our own UI. */
export function hasExternalMutations(records) {
  return records.some(
    (record) =>
      !(record.target instanceof Element) ||
      !record.target.closest(GQOL_OWNED_SELECTOR),
  );
}
