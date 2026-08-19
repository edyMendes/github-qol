/**
 * Page-level predicates shared across modules.
 */

import { isConversationRendered } from "./dom-cache.js";

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

// Timestamp of the last teardown/reapply cycle (navigation or boot). The
// settle probe and the corruption recovery only act inside a window after
// it — that is when GitHub's restore reconciliation races our applies.
let lastNavigationAt = Date.now();

export function markNavigationAt() {
  lastNavigationAt = Date.now();
}

export function msSinceNavigation() {
  return Date.now() - lastNavigationAt;
}

// How long after a navigation GitHub may still be swapping the restored
// page. An absent merge box / comment form counts as pending work only
// inside this window; beyond it, absence is the page's steady state
// (locked PRs legitimately render neither).
const POST_NAV_SWAP_WINDOW_MS = 90000;

export function withinPostNavSwapWindow() {
  return msSinceNavigation() < POST_NAV_SWAP_WINDOW_MS;
}

/**
 * Shared "absent element → pending" policy for features whose target
 * element has not rendered: pending only while the post-navigation swap
 * may still be in flight and the conversation itself is rendered.
 */
export function isPendingPostNavSwap() {
  return withinPostNavSwapWindow() && isConversationRendered();
}
