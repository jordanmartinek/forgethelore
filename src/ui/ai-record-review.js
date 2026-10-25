/**
 * LoreForge Planner - AI Records Review Checklist (always-on)
 *
 * A persistent checklist, pinned in the nav sidebar, reminding the writer to
 * investigate or integrate every AI Record they haven't checked off yet. It is
 * visible in EVERY module (it lives in the app shell, not inside a single
 * module), so outstanding reference material never gets silently forgotten.
 *
 * Each unreviewed record is a checkbox row:
 *   - Tick the box  → marks the record reviewed (it leaves the list).
 *   - Click the name → jumps to the AI Record module to read/work it.
 * When everything is checked off, the panel shows a calm "all caught up" state
 * rather than vanishing, so the reminder's absence is itself informative.
 *
 * State/logic lives in core/ai-record.js; this module only renders + wires DOM
 * and persists the `reviewed` flag. It refreshes on AI_RECORDS_CHANGED so adding
 * or importing records updates the list live.
 */

import { h } from '../core/renderer.js';
import { events } from '../core/events.js';
import { appStore } from '../core/store.js';
import { loadData, persistState } from '../core/persist.js';
import {
  AI_RECORD_KEY,
  AI_RECORD_FOCUS_KEY,
  AI_RECORDS_CHANGED,
  normalizeRecords,
  pendingReviewRecords,
  sourceMeta,
} from '../core/ai-record.js';

let subscribed = false;
const MAX_VISIBLE = 50; // guard against an enormous list in the sidebar

/** Load + normalise the current records straight from storage. */
function currentRecords() {
  return normalizeRecords(loadData(AI_RECORD_KEY, []));
}

/**
 * Build the always-on checklist panel for the nav sidebar. Returns a <section>
 * that manages its own content and refreshes on record changes.
 */
export function createAIRecordReview() {
  const panel = h('section', {
    class: 'ai-review',
    id: 'ai-review-panel',
    role: 'region',
    'aria-label': 'AI records to review',
  });
  paint(panel);
  ensureSubscription();
  return panel;
}

/** Repaint the panel in place. */
function paint(panel) {
  const records = currentRecords();
  const pending = pendingReviewRecords(records).slice(0, MAX_VISIBLE);
  const pendingTotal = pendingReviewRecords(records).length;
  panel.innerHTML = '';

  // Header: a persistent reminder + the outstanding count.
  panel.appendChild(h('div', { class: 'ai-review__header' },
    h('span', { class: 'ai-review__title' },
      h('span', { 'aria-hidden': 'true' }, '🤖'),
      h('span', { class: 'ai-review__title-label' }, ' Review AI records'),
    ),
    pendingTotal
      ? h('span', { class: 'ai-review__count', title: `${pendingTotal} record${pendingTotal === 1 ? '' : 's'} to investigate or integrate` }, String(pendingTotal))
      : null,
  ));

  if (!records.length) {
    panel.appendChild(h('button', {
      class: 'ai-review__empty ai-review__empty--cta',
      type: 'button',
      title: 'Open AI Record',
      onclick: openModule,
    }, 'No AI records yet — capture one.'));
    return;
  }

  if (!pending.length) {
    panel.appendChild(h('div', { class: 'ai-review__empty' },
      h('span', { 'aria-hidden': 'true' }, '✅'), ' All caught up — every record reviewed.'));
    return;
  }

  // The checklist itself.
  const listEl = h('ul', { class: 'ai-review__list' },
    ...pending.map((r) => renderRow(panel, r)),
  );
  panel.appendChild(listEl);

  if (pendingTotal > pending.length) {
    panel.appendChild(h('button', {
      class: 'ai-review__more', type: 'button', onclick: openModule,
    }, `+${pendingTotal - pending.length} more — open AI Record`));
  }
}

/** A single checklist row: checkbox + source icon + clickable title. */
function renderRow(panel, record) {
  const meta = sourceMeta(record.source);
  const checkbox = h('input', {
    type: 'checkbox',
    class: 'ai-review__check',
    'aria-label': `Mark “${record.title}” reviewed`,
    title: 'Mark reviewed',
    onchange: () => markReviewed(panel, record.id),
  });

  return h('li', { class: 'ai-review__item' },
    checkbox,
    h('button', {
      class: 'ai-review__name',
      type: 'button',
      title: `${meta.label} · open in AI Record`,
      onclick: () => openRecord(record.id),
    },
      h('span', { class: 'ai-review__src', 'aria-hidden': 'true' }, meta.icon),
      h('span', { class: 'ai-review__name-text' }, record.title || 'Untitled session'),
    ),
  );
}

/** Mark a record reviewed and persist. Emits the change event for live sync. */
function markReviewed(panel, id) {
  const records = currentRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return;
  records[idx].reviewed = true;
  records[idx].updatedAt = Date.now();
  persistState(AI_RECORD_KEY, records);
  events.emit(AI_RECORDS_CHANGED, { count: records.length });
  // paint() runs via the event subscription, but repaint directly too so the
  // row disappears instantly even if this panel is the emitter.
  paint(panel);
}

/** Open the AI Record module (optionally focused on a record). */
function openModule() {
  appStore.setState({ activeModule: 'ai-record' });
}

function openRecord(id) {
  // The module reads its own active record from internal state; set a one-shot
  // hint it can pick up, then navigate. (The module falls back gracefully if
  // the hint is absent.) localStorage is used (not sessionStorage) to match the
  // rest of the app's storage usage and lint environment.
  try { localStorage.setItem(AI_RECORD_FOCUS_KEY, id); } catch (_) { /* ignore */ }
  appStore.setState({ activeModule: 'ai-record' });
}

/** Subscribe once so the panel refreshes whenever records change. */
function ensureSubscription() {
  if (subscribed) return;
  subscribed = true;
  events.on(AI_RECORDS_CHANGED, () => {
    const panel = document.getElementById('ai-review-panel');
    if (panel) paint(panel);
  });
}
