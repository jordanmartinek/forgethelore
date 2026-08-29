/**
 * LoreForge Planner - Focus / Typewriter Mode (#16)
 *
 * A distraction-free writing surface. The module view lists manuscript scene
 * cards; picking one opens a fullscreen overlay with:
 *   • a centered, large-type editor with optional typewriter scrolling
 *   • a live session HUD (words added, WPM, goal progress)
 *   • a collapsible context rail (participants, factions, location) derived from
 *     the matching board scene, so the author keeps names/goals in view
 *
 * Edits write back to the manuscript step map (Collections.MANUSCRIPT), the same
 * store the Manuscript module uses, so nothing is siloed.
 */

import { h } from '../core/renderer.js';
import { loadData, persistState } from '../core/persist.js';
import { list, Collections } from '../core/repo.js';
import { sessionStats, contextRail } from '../core/focus-model.js';

const TRUBY_TITLES = {
  1: 'Self-Revelation, Need & Desire', 2: 'Ghost & Story World', 3: 'Weakness & Need',
  4: 'Inciting Event', 5: 'Desire', 6: 'Allies', 7: 'Opponent / Mystery', 8: 'Fake-Ally Opponent',
  9: 'First Revelation & Decision', 10: 'Plan', 11: "Opponent's Plan", 12: 'Drive', 13: 'Attack by Ally',
  14: 'Apparent Defeat', 15: 'Second Revelation & Decision', 16: 'Audience Revelation',
  17: 'Third Revelation & Decision', 18: 'Gate, Gauntlet, Visit to Death', 19: 'Battle',
  20: 'Self-Revelation', 21: 'Moral Decision', 22: 'New Equilibrium',
};

let typewriterOn = true;
let sessionGoal = 250;

export function renderFocusMode(container) {
  const root = h('div', { style: { padding: '20px', height: '100%', overflowY: 'auto' } });
  renderPicker(root);
  container.appendChild(root);
}

function renderPicker(root) {
  root.innerHTML = '';
  const cards = collectSceneCards();

  root.appendChild(
    h('div', { style: { marginBottom: '16px' } },
      h('h1', { style: { fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' } }, '✍️ Focus Mode'),
      h('p', { style: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' } },
        'Distraction-free writing with a context rail. Pick a scene to enter the zone.'),
    ),
  );

  // Session controls.
  root.appendChild(
    h('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' } },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' } },
        'Session goal',
        h('input', { type: 'number', class: 'input', min: '0', step: '50', value: String(sessionGoal), style: { width: '90px' }, oninput: (e) => { sessionGoal = Math.max(0, parseInt(e.target.value, 10) || 0); } }),
        'words',
      ),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: typewriterOn, onchange: (e) => { typewriterOn = e.target.checked; } }),
        'Typewriter scrolling',
      ),
    ),
  );

  if (cards.length === 0) {
    root.appendChild(
      h('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
        h('div', { style: { fontSize: '40px', marginBottom: '12px', opacity: '0.5' } }, '✍️'),
        h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' } }, 'No scene cards yet'),
        h('div', { style: { fontSize: '13px' } }, 'Add scene cards in the Manuscript module, then focus-write them here.'),
      ),
    );
    return;
  }

  root.appendChild(
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' } },
      ...cards.map((c) => h('button', {
        class: 'btn',
        style: { textAlign: 'left', padding: '14px', border: `1px solid var(--border-subtle)`, borderLeft: `3px solid ${c.color || 'var(--accent-primary)'}`, display: 'block' },
        onclick: () => openOverlay(c, root),
      },
        h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' } }, `Step ${c.stepNum} · ${TRUBY_TITLES[c.stepNum] || ''}`),
        h('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' } }, c.title || 'Untitled scene'),
        h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical' } }, (c.content || '').slice(0, 120) || 'Empty — start writing.'),
      )),
    ),
  );
}

/** Flatten the step-keyed manuscript map into a list of scene cards. */
function collectSceneCards() {
  const map = loadData('manuscriptScenes', {}) || {};
  const out = [];
  Object.keys(map).forEach((k) => {
    const num = Number(k);
    (Array.isArray(map[k]) ? map[k] : []).forEach((card) => {
      if (card && card.id) out.push({ ...card, stepNum: num });
    });
  });
  out.sort((a, b) => a.stepNum - b.stepNum);
  return out;
}

/** Persist an edited card back into the step map. */
function saveCard(stepNum, card) {
  const map = loadData('manuscriptScenes', {}) || {};
  const listForStep = Array.isArray(map[stepNum]) ? map[stepNum] : [];
  const idx = listForStep.findIndex((c) => c && c.id === card.id);
  if (idx === -1) listForStep.push(card);
  else listForStep[idx] = { ...listForStep[idx], ...card };
  map[stepNum] = listForStep;
  persistState('manuscriptScenes', map);
}

// ─── Fullscreen overlay ──────────────────────────────────────────────────────

function openOverlay(card, root) {
  const existing = document.getElementById('focus-overlay');
  if (existing) existing.remove();

  const startedAt = Date.now();
  const startText = card.content || '';
  let currentText = startText;
  let railOpen = true;

  // Match this manuscript card to a board scene (by title) to build the rail.
  const boardScene = matchBoardScene(card.title);
  const rail = contextRail(boardScene || { participants: [], location: '' }, {
    pieces: list(Collections.PIECES),
    factions: list(Collections.BOARD_FACTIONS),
    locations: list(Collections.LOCATIONS),
  });

  const titleInput = h('input', {
    value: card.title || '',
    placeholder: 'Scene title',
    style: { background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '700', width: '100%', fontFamily: 'var(--font-heading)' },
    oninput: (e) => { card.title = e.target.value; saveCard(card.stepNum, { id: card.id, title: card.title, content: currentText, color: card.color }); },
  });

  const hud = h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '14px' } });

  const editor = h('textarea', {
    placeholder: 'Write…',
    style: {
      flex: '1', width: '100%', maxWidth: '720px', margin: '0 auto', background: 'transparent',
      border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)',
      fontSize: '18px', lineHeight: '1.8', fontFamily: 'var(--font-sans)', padding: '0 8px',
    },
  });
  editor.value = startText;

  const updateHud = () => {
    const s = sessionStats(startText, currentText, sessionGoal, startedAt);
    hud.innerHTML = '';
    hud.appendChild(h('span', {}, `${s.currentWords} words`));
    hud.appendChild(h('span', { style: { color: s.goalMet ? 'var(--success)' : 'var(--text-muted)' } }, s.goal > 0 ? `+${s.added} / ${s.goal} (${s.goalPct}%)` : `+${s.added} this session`));
    if (s.wpm > 0) hud.appendChild(h('span', {}, `${s.wpm} wpm`));
  };

  let saveTimer = null;
  editor.addEventListener('input', () => {
    currentText = editor.value;
    updateHud();
    if (typewriterOn) keepCaretCentered(editor);
    // Debounced persistence so we don't thrash localStorage on every keystroke.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCard(card.stepNum, { id: card.id, title: card.title, content: currentText, color: card.color }), 500);
  });

  const railEl = buildRail(rail);

  const close = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveCard(card.stepNum, { id: card.id, title: card.title, content: editor.value, color: card.color });
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    renderPicker(root); // refresh previews
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey);

  const overlay = h('div', {
    id: 'focus-overlay',
    style: {
      position: 'fixed', inset: '0', zIndex: 'var(--z-overlay)', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
    },
  },
    // Top bar.
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' } },
      h('div', { style: { flex: '1', minWidth: '0' } }, titleInput),
      hud,
      h('button', { class: 'btn btn--ghost btn--sm', title: 'Toggle context rail', onclick: () => { railOpen = !railOpen; railEl.style.display = railOpen ? '' : 'none'; } }, '📋'),
      h('button', { class: 'btn btn--ghost btn--sm', onclick: close }, 'Done (Esc)'),
    ),
    // Body: editor + rail.
    h('div', { style: { flex: '1', display: 'flex', overflow: 'hidden' } },
      h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '40px 20px' } }, editor),
      railEl,
    ),
  );

  document.body.appendChild(overlay);
  updateHud();
  setTimeout(() => editor.focus(), 30);
}

function buildRail(rail) {
  const railEl = h('aside', { style: { width: '280px', minWidth: '280px', borderLeft: '1px solid var(--border-subtle)', background: 'var(--surface-1)', overflowY: 'auto', padding: '16px' } });

  railEl.appendChild(h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '10px' } }, 'Context'));

  if (rail.location) {
    railEl.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' } },
      h('span', { style: { color: 'var(--text-muted)' } }, '📍 '), rail.location.name));
  }

  if (rail.characters.length) {
    railEl.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, 'In scene'));
    rail.characters.forEach((c) => {
      railEl.appendChild(h('div', { style: { marginBottom: '10px', paddingLeft: '10px', borderLeft: `3px solid ${c.color}` } },
        h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, c.name),
        c.role ? h('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, c.role) : null,
        c.goal ? h('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' } }, `“${c.goal}”`) : null,
      ));
    });
  } else {
    railEl.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'No matching board scene found. Name this card like a board scene to pull in its cast.'));
  }

  if (rail.factions.length) {
    railEl.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 6px' } }, 'Factions'));
    rail.factions.forEach((f) => {
      railEl.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' } },
        h('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: f.color } }),
        f.name));
    });
  }

  return railEl;
}

/**
 * Match a manuscript card to a board scene by EXACT (case-insensitive) title.
 * A substring fallback was intentionally dropped: it could bind a card to the
 * wrong scene ("Battle" → "The Final Battle") and silently show a misleading
 * cast. When there's no exact match the rail shows a helpful hint instead.
 */
function matchBoardScene(title) {
  if (!title) return null;
  const scenes = list(Collections.SCENES);
  const lower = String(title).toLowerCase().trim();
  return scenes.find((s) => String(s.title || '').toLowerCase().trim() === lower) || null;
}

/** Typewriter scrolling: keep the caret line roughly vertically centered. */
function keepCaretCentered(editor) {
  try {
    const parent = editor.parentElement;
    if (!parent) return;
    // Approximate caret line from the number of newlines before the caret.
    const before = editor.value.slice(0, editor.selectionStart);
    const line = before.split('\n').length;
    const lineHeight = 32; // ~18px * 1.8
    const target = line * lineHeight - parent.clientHeight / 2;
    parent.scrollTop = Math.max(0, target);
  } catch (_) { /* non-fatal */ }
}
