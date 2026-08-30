/**
 * LoreForge Planner - Persistent Reminder Banner
 *
 * A single always-visible strip that the author can edit to keep any reminder
 * in view across EVERY module and window (including the Focus Mode overlay).
 * Example: pin the current theme, a tone note ("grimdark — no comic relief"),
 * a continuity rule, or a daily word goal.
 *
 * State is DOM-free and testable here; the UI layer (ui/banner.js) renders it.
 * Like the theme, the banner is a per-user, cross-project preference persisted
 * in localStorage (not namespaced per project), so the reminder follows the
 * author everywhere.
 *
 * Supports a small set of live tokens so a reminder can reflect current app
 * state without manual editing — most notably `{theme}`, which the user asked
 * for explicitly (a constant, always-visible reminder of the active theme).
 */

import { events } from './events.js';
import { THEMES, getTheme } from './theme.js';

const TEXT_KEY = 'loreforge_banner_text';
const ENABLED_KEY = 'loreforge_banner_enabled';

/** Default reminder demonstrates the live {theme} token out of the box. */
export const DEFAULT_TEXT = '📌 Theme: {theme}';

/** Emitted whenever the banner text or enabled flag changes. */
export const BANNER_CHANGED = 'banner:changed';

export function getBannerText() {
  try {
    const stored = localStorage.getItem(TEXT_KEY);
    return stored === null ? DEFAULT_TEXT : stored;
  } catch (_) {
    return DEFAULT_TEXT;
  }
}

export function isBannerEnabled() {
  try {
    // Default ON so the feature is discoverable; author can dismiss it.
    return localStorage.getItem(ENABLED_KEY) !== 'false';
  } catch (_) {
    return true;
  }
}

/** Persist new banner text and notify listeners. Returns the stored text. */
export function setBannerText(text) {
  const value = typeof text === 'string' ? text : '';
  try { localStorage.setItem(TEXT_KEY, value); } catch (_) { /* ignore */ }
  events.emit(BANNER_CHANGED, { text: value, enabled: isBannerEnabled() });
  return value;
}

/** Show/hide the banner and notify listeners. Returns the new enabled state. */
export function setBannerEnabled(enabled) {
  const value = !!enabled;
  try { localStorage.setItem(ENABLED_KEY, String(value)); } catch (_) { /* ignore */ }
  events.emit(BANNER_CHANGED, { text: getBannerText(), enabled: value });
  return value;
}

/**
 * Resolve live tokens in a banner string against current app state.
 * Tokens are case-insensitive and wrapped in braces:
 *   {theme} -> the active theme's human label (e.g. "Midnight Ink")
 *   {date}  -> today's locale date
 * Unknown tokens are left untouched so arbitrary "{...}" text still displays.
 *
 * Note: the banner only repaints on BANNER_CHANGED / theme:changed, so a
 * `{date}` reminder won't roll over at midnight while a window stays open — it
 * refreshes on the next edit, theme change, or app reload. Acceptable for a
 * reminder strip; revisit with a timer if minute/day precision is ever needed.
 *
 * @param {string} [text]  Defaults to the current banner text.
 * @returns {string}
 */
export function resolveBannerText(text = getBannerText()) {
  if (typeof text !== 'string' || text.indexOf('{') === -1) return text || '';
  const themeId = getTheme();
  const themeLabel = (THEMES.find((t) => t.id === themeId) || {}).label || themeId;
  const tokens = {
    theme: themeLabel,
    date: safeDate(),
  };
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    const key = String(name).toLowerCase();
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : whole;
  });
}

function safeDate() {
  try { return new Date().toLocaleDateString(); } catch (_) { return ''; }
}
