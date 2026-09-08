/**
 * LoreForge Planner - Theming (#37)
 *
 * The app ships one warm, literary LIGHT theme ("Warm Literary") defined via CSS
 * custom properties in :root — cream page, charcoal ink, forest-green &
 * terracotta accents, soft gold for AI/features. Theming layers ALTERNATE
 * palettes (including the original candlelit-parchment dark theme) as
 * `html[data-theme="…"]` overrides (see styles/themes.css) — a pure CSS-variable
 * swap, so no component needs to change. The chosen theme is persisted globally
 * (not per project) in localStorage and applied as early as possible.
 */

import { events } from './events.js';

const STORAGE_KEY = 'loreforge_theme';

/** The built-in default (no data-theme attr — lives in main.css :root). */
export const DEFAULT_THEME = 'literary';

/** Available themes. 'literary' is the built-in default (no data-theme attr). */
export const THEMES = [
  { id: 'literary', label: 'Warm Literary', swatch: '#4a6350' },
  { id: 'parchment', label: 'Candlelit Parchment', swatch: '#c9a84c' },
  { id: 'midnight', label: 'Midnight Ink', swatch: '#6366f1' },
  { id: 'daylight', label: 'Daylight (light)', swatch: '#2563eb' },
  { id: 'terminal', label: 'Terminal Green', swatch: '#22c55e' },
];

export function getTheme() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME; } catch (_) { return DEFAULT_THEME; }
}

/** Apply a theme id to the document root and persist it. */
export function setTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* ignore */ }
  applyTheme(theme);
  // Notify listeners (e.g. the reminder banner's {theme} token) so UI reflecting
  // the active theme stays live without a manual refresh.
  try { events.emit('theme:changed', { theme }); } catch (_) { /* events optional */ }
  return theme;
}

/** Reflect the current theme on <html data-theme>. The default clears the attr. */
export function applyTheme(id = getTheme()) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (id === DEFAULT_THEME) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
}

/** Cycle to the next theme (used by a quick toggle). Returns the new theme id. */
export function cycleTheme() {
  const cur = getTheme();
  const idx = THEMES.findIndex((t) => t.id === cur);
  return setTheme(THEMES[(idx + 1) % THEMES.length].id);
}
