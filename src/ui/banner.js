/**
 * LoreForge Planner - Persistent Reminder Banner (UI)
 *
 * Renders the always-on reminder strip that sits directly under the top bar in
 * the main app grid, and can also be mounted inside fullscreen overlays (Focus
 * Mode) so the reminder is present in EVERY window. Click the text to edit it
 * inline; the ✕ hides it (re-showable from the top-bar toggle).
 *
 * All persistence/state lives in core/banner.js; this module only renders and
 * wires DOM. It subscribes to BANNER_CHANGED and to theme changes so a
 * `{theme}` token stays live without a manual edit.
 */

import { h } from '../core/renderer.js';
import { events } from '../core/events.js';
import {
  getBannerText, isBannerEnabled, setBannerText, setBannerEnabled,
  resolveBannerText, BANNER_CHANGED,
} from '../core/banner.js';

let subscribed = false;

/**
 * Build the primary banner element for the app grid. Returns a <div> that
 * manages its own visibility and inline editing.
 */
export function createBanner() {
  const banner = h('div', { class: 'reminder-banner', id: 'reminder-banner', role: 'note', 'aria-label': 'Persistent reminder' });
  paint(banner);
  ensureSubscription();
  return banner;
}

/**
 * Mount a read-only copy of the banner into an arbitrary container (e.g. the
 * Focus Mode overlay). It updates live via the same events but isn't editable,
 * keeping overlay chrome minimal. Returns the element (or null when disabled).
 */
export function mountBannerInto(container) {
  if (!container) return null;
  const mirror = h('div', { class: 'reminder-banner reminder-banner--mirror' });
  const paintMirror = () => {
    // Intentional asymmetry with the main banner: the editable banner shows a
    // "click to add" placeholder on empty text, but the read-only mirror has no
    // edit affordance, so it simply hides when there's nothing to remind.
    mirror.style.display = isBannerEnabled() && getBannerText().trim() ? '' : 'none';
    mirror.innerHTML = '';
    mirror.appendChild(h('span', { class: 'reminder-banner__badge', 'aria-hidden': 'true' },
      h('span', { class: 'reminder-banner__badge-icon' }, '📌'),
      h('span', { class: 'reminder-banner__badge-label' }, 'PINNED'),
    ));
    mirror.appendChild(h('span', { class: 'reminder-banner__text reminder-banner__text--static' }, resolveBannerText()));
  };
  paintMirror();
  const off = events.on(BANNER_CHANGED, paintMirror);
  const offTheme = events.on('theme:changed', paintMirror);
  // Clean up listeners if the mirror is removed from the DOM.
  mirror._cleanup = () => { off && off(); offTheme && offTheme(); };
  container.appendChild(mirror);
  return mirror;
}

/** Repaint the main banner in place (text + visibility). */
function paint(banner) {
  const enabled = isBannerEnabled();
  const text = getBannerText();
  banner.style.display = enabled ? '' : 'none';
  banner.innerHTML = '';
  if (!enabled) return;

  // Leading badge makes the strip read as a deliberate, important reminder.
  const badge = h('span', { class: 'reminder-banner__badge', 'aria-hidden': 'true' },
    h('span', { class: 'reminder-banner__badge-icon' }, '📌'),
    h('span', { class: 'reminder-banner__badge-label' }, 'PINNED'),
  );

  const hasText = !!resolveBannerText(text).trim();
  const label = h('span', {
    class: `reminder-banner__text${hasText ? '' : ' reminder-banner__text--empty'}`,
    title: 'Click to edit this reminder. Use {theme} to show the current theme.',
    tabindex: '0',
    role: 'button',
    onclick: () => startEdit(banner),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(banner); } },
  }, hasText ? resolveBannerText(text) : 'Click to add a persistent reminder…');

  const editBtn = h('button', {
    class: 'reminder-banner__btn', title: 'Edit reminder', 'aria-label': 'Edit reminder',
    onclick: () => startEdit(banner),
  }, '✎');

  const hideBtn = h('button', {
    class: 'reminder-banner__btn', title: 'Hide reminder', 'aria-label': 'Hide reminder',
    onclick: () => setBannerEnabled(false),
  }, '✕');

  banner.appendChild(badge);
  banner.appendChild(label);
  banner.appendChild(editBtn);
  banner.appendChild(hideBtn);
}

/** Swap the label for an inline text input; save on Enter/blur, cancel on Esc. */
function startEdit(banner) {
  const current = getBannerText();
  banner.innerHTML = '';

  const input = h('input', {
    class: 'reminder-banner__input',
    value: current,
    placeholder: 'e.g. Theme: {theme}  ·  Tone: grimdark  ·  Goal: 1000 words',
    'aria-label': 'Reminder text',
  });

  const commit = () => { setBannerText(input.value); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); paint(banner); }
  });
  input.addEventListener('blur', commit);

  const hint = h('span', { class: 'reminder-banner__hint' }, 'Tokens: {theme} {date} · Enter to save · Esc to cancel');

  banner.appendChild(input);
  banner.appendChild(hint);
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

/** Subscribe once so the main banner repaints on any state/theme change. */
function ensureSubscription() {
  if (subscribed) return;
  subscribed = true;
  const repaint = () => {
    const banner = document.getElementById('reminder-banner');
    if (banner) paint(banner);
    syncLayoutClass();
  };
  events.on(BANNER_CHANGED, repaint);
  // Keep {theme} live when the palette changes.
  events.on('theme:changed', repaint);
  syncLayoutClass();
}

/**
 * Toggle a class on the app layout so the CSS grid can collapse the banner row
 * to zero height when the banner is hidden (no dead space).
 */
function syncLayoutClass() {
  const layout = document.querySelector('.app-layout');
  if (!layout) return;
  layout.classList.toggle('app-layout--banner-hidden', !isBannerEnabled());
}

/** Re-show the banner (used by the top-bar toggle). */
export function showBanner() {
  setBannerEnabled(true);
}
