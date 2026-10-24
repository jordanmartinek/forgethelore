/**
 * LoreForge Planner - Writing Companion Panel (real-time suggestions)
 *
 * Attaches a live writing coach to a writing <textarea>. It works AS YOU WRITE:
 *   • Writing devices — on a short typing pause (debounced), it analyses the
 *     sentence around the caret and lists craft upgrades (stronger verb, sensory
 *     detail, figurative language, rhythm, trim filler, precise wording). Each
 *     with a rewrite is one click to copy.
 *   • Synonyms       — double-click or select a single word to see better word
 *     choices; click one to swap it straight into the text.
 *
 * It renders as a quiet dock pinned to the bottom-right of the editor's writing
 * column, so the writer stays in flow (no modal, no page change).
 *
 * All edits are written back through the textarea's existing input/save handlers
 * by dispatching a synthetic bubbling `input` event — exactly like
 * ui/text-ai-actions.js — so no editor save logic needs to change.
 *
 * Offline-first: core/writing-companion falls back to an on-device thesaurus +
 * heuristics when no AI key is configured, so this never shows an empty dock
 * just because the writer hasn't added a key.
 */

import { h } from '../core/renderer.js';
import {
  DEVICE_DEBOUNCE_MS,
  getSynonyms,
  getWritingDevices,
  wordAt,
  sentenceAround,
  isAIEnabled,
} from '../core/writing-companion.js';
import { toastSuccess, toastError } from './toast.js';

/**
 * Attach the writing companion to a textarea.
 * @param {HTMLTextAreaElement} textarea
 * @param {object} [opts]
 * @param {boolean} [opts.startOpen=true]  whether the dock starts expanded
 * @returns {() => void} detach function
 */
export function attachWritingCompanion(textarea, opts = {}) {
  if (!textarea || textarea.dataset.writingCompanion === 'on') return () => {};
  textarea.dataset.writingCompanion = 'on';

  let open = opts.startOpen !== false;
  let deviceTimer = null;
  let lastPassage = '';
  let reqSeq = 0; // guards against out-of-order async responses

  // ── Dock scaffold ──────────────────────────────────────────────────────────
  const synonymsSlot = h('div', { class: 'wc-section wc-section--synonyms' });
  const devicesSlot = h('div', { class: 'wc-section wc-section--devices' });
  const body = h('div', { class: 'wc-dock__body' }, synonymsSlot, devicesSlot);

  const toggleBtn = h('button', {
    class: 'wc-dock__toggle', type: 'button',
    'aria-label': 'Toggle writing companion',
    onclick: () => { open = !open; render(); },
  });

  const dock = h('aside', {
    class: 'wc-dock', role: 'complementary', 'aria-label': 'Writing companion',
    // Keep focus in the editor when interacting with the dock.
    onmousedown: (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); },
  },
    h('div', { class: 'wc-dock__header' },
      h('span', { class: 'wc-dock__title' }, h('span', { 'aria-hidden': 'true' }, '🪄'), ' Writing companion'),
      toggleBtn,
    ),
    body,
  );
  document.body.appendChild(dock);

  function render() {
    dock.classList.toggle('wc-dock--collapsed', !open);
    toggleBtn.textContent = open ? '▾' : '▴';
    body.style.display = open ? '' : 'none';
    positionDock();
  }

  /** Pin the dock to the bottom-right of the textarea's viewport rect. */
  function positionDock() {
    const r = textarea.getBoundingClientRect();
    const width = Math.min(320, Math.max(220, r.width * 0.32));
    dock.style.position = 'fixed';
    dock.style.width = `${width}px`;
    dock.style.left = `${Math.max(8, r.right - width - 16)}px`;
    dock.style.bottom = `${Math.max(8, window.innerHeight - r.bottom + 16)}px`;
  }

  // ── Synonyms (double-click / select a word) ──────────────────────────────────
  async function updateSynonyms() {
    const hit = wordAt(textarea.value, textarea.selectionStart, textarea.selectionEnd);
    if (!hit) { renderSynonyms(null); return; }
    const mySeq = ++reqSeq;
    renderSynonyms({ loading: true, word: hit.word });
    let res;
    try {
      res = await getSynonyms(hit.word, hit.context);
    } catch (_) {
      res = { word: hit.word, synonyms: [], usedAI: false };
    }
    if (mySeq !== reqSeq || !dock.isConnected) return; // superseded
    renderSynonyms({ ...res, hit });
  }

  function renderSynonyms(state) {
    synonymsSlot.innerHTML = '';
    if (!open) return;
    if (!state) {
      synonymsSlot.appendChild(h('div', { class: 'wc-hint' }, 'Double-click a word for synonyms.'));
      return;
    }
    synonymsSlot.appendChild(h('div', { class: 'wc-section__head' },
      h('span', {}, '🔤 Synonyms'),
      h('span', { class: 'wc-section__word' }, `“${state.word}”`),
    ));
    if (state.loading) {
      synonymsSlot.appendChild(h('div', { class: 'wc-loading' }, h('span', { class: 'wc-spinner' }), 'Finding…'));
      return;
    }
    if (!state.synonyms || !state.synonyms.length) {
      synonymsSlot.appendChild(h('div', { class: 'wc-empty' },
        isAIEnabled() ? 'No strong alternatives found.' : 'No on-device match — add an AI key for a full thesaurus.'));
      return;
    }
    synonymsSlot.appendChild(h('div', { class: 'wc-chips' },
      ...state.synonyms.map((s) => h('button', {
        class: 'wc-chip', type: 'button',
        title: s.hint ? `${s.word} — ${s.hint}` : s.word,
        onclick: () => applySynonym(state.hit, s.word),
      },
        s.word,
        s.hint ? h('span', { class: 'wc-chip__hint' }, s.hint) : null,
      )),
    ));
    synonymsSlot.appendChild(sourceLine(state.usedAI));
  }

  /** Swap the selected/hit word for the chosen synonym and save via the editor. */
  function applySynonym(hit, replacement) {
    if (!hit) return;
    const val = textarea.value;
    // Re-resolve the word position in case the text shifted since lookup.
    const current = wordAt(val, hit.start, hit.end) || hit;
    if (val.slice(current.start, current.end).toLowerCase() !== hit.word.toLowerCase()) {
      // Text changed under us — bail safely rather than corrupt the prose.
      toastError('Text changed — select the word again.');
      return;
    }
    textarea.value = val.slice(0, current.start) + replacement + val.slice(current.end);
    const caret = current.start + replacement.length;
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new CustomEvent('input', { bubbles: true }));
    textarea.focus();
    toastSuccess(`Replaced with “${replacement}”.`);
    renderSynonyms(null);
  }

  // ── Writing devices (debounced on pause) ─────────────────────────────────────
  function scheduleDevices() {
    if (deviceTimer) clearTimeout(deviceTimer);
    deviceTimer = setTimeout(runDevices, DEVICE_DEBOUNCE_MS);
  }

  async function runDevices() {
    const passage = sentenceAround(textarea.value, textarea.selectionStart);
    if (!passage || passage === lastPassage) return;
    lastPassage = passage;
    const mySeq = ++reqSeq;
    renderDevices({ loading: true });
    let res;
    try {
      res = await getWritingDevices(passage);
    } catch (_) {
      res = { suggestions: [], usedAI: false };
    }
    if (mySeq !== reqSeq || !dock.isConnected) return;
    renderDevices(res);
  }

  function renderDevices(state) {
    devicesSlot.innerHTML = '';
    if (!open) return;
    devicesSlot.appendChild(h('div', { class: 'wc-section__head' }, h('span', {}, '✨ Craft suggestions')));
    if (state.loading) {
      devicesSlot.appendChild(h('div', { class: 'wc-loading' }, h('span', { class: 'wc-spinner' }), 'Reading your sentence…'));
      return;
    }
    if (!state.suggestions || !state.suggestions.length) {
      devicesSlot.appendChild(h('div', { class: 'wc-empty' }, 'This passage reads cleanly. Keep going ✍️'));
      return;
    }
    devicesSlot.appendChild(h('div', { class: 'wc-devices' },
      ...state.suggestions.map((s) => h('div', { class: 'wc-device' },
        h('div', { class: 'wc-device__head' },
          h('span', { class: 'wc-device__icon', 'aria-hidden': 'true' }, s.icon),
          h('span', { class: 'wc-device__label' }, s.label),
        ),
        s.note ? h('div', { class: 'wc-device__note' }, s.note) : null,
        s.rewrite ? h('div', { class: 'wc-device__rewrite' },
          h('span', { class: 'wc-device__rewrite-text' }, s.rewrite),
          h('button', {
            class: 'wc-device__copy', type: 'button', title: 'Copy rewrite',
            onclick: () => copyText(s.rewrite),
          }, 'Copy'),
        ) : null,
      )),
    ));
    devicesSlot.appendChild(sourceLine(state.usedAI));
  }

  function copyText(text) {
    try { navigator.clipboard.writeText(text); toastSuccess('Copied.'); }
    catch (_) { toastError('Could not copy.'); }
  }

  function sourceLine(usedAI) {
    return h('div', { class: 'wc-source' }, usedAI ? '✨ Your AI model' : '⚙ On-device');
  }

  // ── Wiring ───────────────────────────────────────────────────────────────────
  const onInput = () => scheduleDevices();
  const onDblClick = () => updateSynonyms();
  const onMouseUp = () => {
    // Only react when a single-word selection exists (avoid firing on caret moves).
    if (textarea.selectionEnd > textarea.selectionStart) updateSynonyms();
  };
  const onScrollOrResize = () => positionDock();

  textarea.addEventListener('input', onInput);
  textarea.addEventListener('dblclick', onDblClick);
  textarea.addEventListener('mouseup', onMouseUp);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  // Initial paint.
  render();
  renderSynonyms(null);
  renderDevices({ suggestions: [], usedAI: false, loading: false });
  // Analyse whatever is already in the editor shortly after mount.
  if (textarea.value.trim()) scheduleDevices();

  return function detach() {
    if (deviceTimer) clearTimeout(deviceTimer);
    textarea.removeEventListener('input', onInput);
    textarea.removeEventListener('dblclick', onDblClick);
    textarea.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    dock.remove();
    textarea.dataset.writingCompanion = '';
  };
}
