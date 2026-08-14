/**
 * Page-level predicates shared across modules.
 */

export function isPullRequestPage() {
  // Conversation tab only — not /files, /commits, etc. Switching tabs must
  // tear our changes down and re-apply when the conversation returns.
  return /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(location.pathname);
}

export function pageKey() {
  // Hash-only changes (anchor jumps) are not navigations: skip the
  // teardown/reapply cycle for them.
  return location.pathname + location.search;
}
