/**
 * LoreForge Planner - Theming (#37)
 *
 * The app ships one warm, candlelit-parchment dark theme defined via CSS custom
 * properties in :root. Theming layers ALTERNATE palettes as
 * `html[data-theme="…"]` overrides (see styles/themes.css) — a pure CSS-variable
 * swap, so no component needs to change. The chosen theme is persisted globally
 * (not per project) in localStorage and applied as early as possible.
 */

const STORAGE_KEY = 'loreforge_theme';

/** Available themes. 'parchment' is the built-in default (no data-theme attr). */
export const THEMES = [
  { id: 'parchment', label: 'Candlelit Parchment', swatch: '#c9a84c' },
  { id: 'midnight', label: 'Midnight Ink', swatch: '#6366f1' },
  { id: 'daylight', label: 'Daylight (light)', swatch: '#2563eb' },
  { id: 'terminal', label: 'Terminal Green', swatch: '#22c55e' },
];

export function getTheme() {
  try { return localStorage.getItem(STORAGE_KEY) || 'parchment'; } catch (_) { return 'parchment'; }
}

/** Apply a theme id to the document root and persist it. */
export function setTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : 'parchment';
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* ignore */ }
  applyTheme(theme);
  return theme;
}

/** Reflect the current theme on <html data-theme>. 'parchment' clears the attr. */
export function applyTheme(id = getTheme()) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (id === 'parchment') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
}

/** Cycle to the next theme (used by a quick toggle). Returns the new theme id. */
export function cycleTheme() {
  const cur = getTheme();
  const idx = THEMES.findIndex((t) => t.id === cur);
  return setTheme(THEMES[(idx + 1) % THEMES.length].id);
}
