/**
 * Shared SVG icon factories. GitHub Primer octicon chevron paths; callers
 * pass the class so each feature keeps its own styling hook.
 */

const CHEVRON_DOWN_PATH =
  "M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z";

const CHEVRON_UP_PATH =
  "M3.22 10.53a.749.749 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.06 0l4.25 4.25a.749.749 0 1 1-1.06 1.06L8 6.811 4.28 10.53a.749.749 0 0 1-1.06 0Z";

// Primer "filter" glyph: three left-aligned bars, longest at top
// (visually the same shape as bootstrap-icons' bi-filter-left).
const FILTER_LEFT_PATH =
  "M.75 3h14.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5ZM.75 7.25h9.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5ZM.75 11.5h5.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5Z";

function svgFromPath(className, path) {
  return `<svg class="${className}" aria-hidden="true" height="16" width="16" viewBox="0 0 16 16"><path d="${path}"/></svg>`;
}

function chevronSvg(className, path) {
  return svgFromPath(className, path);
}

export function chevronDownIcon(className) {
  return chevronSvg(className, CHEVRON_DOWN_PATH);
}

export function chevronUpIcon(className) {
  return chevronSvg(className, CHEVRON_UP_PATH);
}

export function filterLeftIcon(className) {
  return svgFromPath(className, FILTER_LEFT_PATH);
}
