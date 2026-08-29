/**
 * LoreForge Planner - Knowledge & Setups (#5 secrets matrix, #8 Chekhov tracker)
 *
 * Two related analysis views:
 *   - Secrets Matrix (#5): a grid of characters × secrets showing who knows
 *     what, plus dramatic-irony and continuity-leak detection driven by
 *     core/knowledge.js. Editable inline.
 *   - Setups & Payoffs (#8): a "Chekhov's gun" tracker — every planted element
 *     (secrets, hidden goals, mystery threads) with a payoff status, warning
 *     about guns that never fire and payoffs with no setup.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';
import { toastInfo } from '../ui/toast.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';
import {
  listKnowledge, seedFromMysteries, addKnowledgeItem, removeKnowledgeItem,
  setKnower, setReaderKnowledge, levelAtScene, ironyInScene, knowledgeLeaks,
  KNOWLEDGE_LEVELS,
} from '../core/knowledge.js';

/** Scenes sorted by order (local helper — no cross-feature dependency). */
function orderedScenes(list) {
  return [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
}

let activeTab = 'matrix';

function pieces() { return repo.list(Collections.PIECES); }
function scenes() { return orderedScenes(repo.list(Collections.SCENES)); }

export function renderKnowledgeMatrix(container) {
  const wrap = h('div', { style: { width: '100%', height: '100%', overflow: 'auto', padding: 'var(--space-xl)' } });

  wrap.appendChild(h('div', { style: { marginBottom: '16px' } },
    h('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, '🕵️ Knowledge & Setups'),
    h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, 'Track who knows what, catch dramatic irony and continuity slips, and make sure every gun you plant gets fired.'),
  ));

  const tabs = [
    { id: 'matrix', label: '🔐 Secrets Matrix' },
    { id: 'setups', label: '🎯 Setups & Payoffs' },
  ];
  wrap.appendChild(h('div', { role: 'tablist', style: { display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)' } },
    ...tabs.map((t) => h('button', {
      class: 'btn btn--ghost btn--sm', role: 'tab', 'aria-selected': t.id === activeTab ? 'true' : 'false',
      style: { borderBottom: t.id === activeTab ? '2px solid var(--accent-primary)' : '2px solid transparent', borderRadius: '0', color: t.id === activeTab ? 'var(--text-primary)' : 'var(--text-muted)' },
      onclick: () => { activeTab = t.id; rerender(container); },
    }, t.label)),
  ));

  const body = h('div', {});
  if (activeTab === 'matrix') renderMatrix(body, container);
  else renderSetups(body, container);
  wrap.appendChild(body);

  container.appendChild(wrap);
}

function rerender(container) {
  renderPreservingScroll(container, () => { container.innerHTML = ''; renderKnowledgeMatrix(container); });
}

// ─── #5 Secrets Matrix ───────────────────────────────────────────────────────

function renderMatrix(body, container) {
  const items = listKnowledge();
  const pcs = pieces();
  const scn = scenes();
  const lastOrder = scn.length ? (scn[scn.length - 1].order ?? scn.length) : 0;

  // Actions row.
  body.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
    h('button', { class: 'btn btn--sm btn--primary', onclick: () => { addKnowledgeItem({ label: 'New secret' }); rerender(container); } }, '+ Secret'),
    h('button', { class: 'btn btn--sm', onclick: () => { const before = listKnowledge().length; const after = seedFromMysteries(); toastInfo(after.length > before ? `Imported ${after.length - before} secret(s) from mysteries.` : 'No new mysteries to import.'); rerender(container); } }, '↺ Import from Mysteries'),
  ));

  if (items.length === 0) {
    body.appendChild(emptyNote('No secrets yet. Add one, or import your mysteries as secrets to start mapping who knows what.'));
    return;
  }
  if (pcs.length === 0) {
    body.appendChild(emptyNote('Add characters on the Strategic Board to map their knowledge.'));
    return;
  }

  // The matrix: rows = secrets, columns = characters (+ an Audience column).
  const table = h('table', { class: 'lf-matrix', style: { borderCollapse: 'collapse', fontSize: '12px', width: '100%' } });
  const headRow = h('tr', {},
    h('th', { style: cellHead(true) }, 'Secret'),
    h('th', { style: { ...cellHead(), textAlign: 'center' }, title: 'Does the audience/reader know this?' }, '👁️ Reader'),
    ...pcs.map((p) => h('th', { style: { ...cellHead(), textAlign: 'center', maxWidth: '90px' } }, p.name)),
  );
  table.appendChild(h('thead', {}, headRow));

  const tbody = h('tbody', {});
  items.forEach((item) => {
    const row = h('tr', {},
      h('td', { style: cell(true) },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          h('span', { style: { fontWeight: '600', color: 'var(--text-primary)' } }, item.label),
          h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit secret', onclick: () => editItem(item, container) }, '✏️'),
          h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: async () => { if (await confirmDialog({ title: `Delete "${item.label}"?`, message: 'Removes it from the matrix.', confirmLabel: 'Delete', danger: true })) { removeKnowledgeItem(item.id); rerender(container); } } }, '🗑️'),
        ),
        item.detail ? h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } }, item.detail.length > 60 ? item.detail.slice(0, 59) + '…' : item.detail) : null,
      ),
      // Reader/audience column.
      h('td', { style: { ...cell(), textAlign: 'center' } },
        readerCell(item, lastOrder, container),
      ),
      // Per-character cells.
      ...pcs.map((p) => h('td', { style: { ...cell(), textAlign: 'center', cursor: 'pointer' }, onclick: () => cycleKnower(item, p, scn, container) },
        knowerBadge(item, p, lastOrder),
      )),
    );
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  body.appendChild(h('div', { style: { overflowX: 'auto' } }, table));
  body.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' } },
    'Click a cell to cycle: ⚪ unaware → 🟢 knows → 🟡 suspects → 🔴 false belief. Set the scene a character learns a secret by editing the cell (double meaning captured at story end).'));

  // Dramatic irony + leak analysis.
  renderIronyAnalysis(body, items, scn);
}

function readerCell(item, lastOrder, container) {
  const on = item.reader;
  const sceneSet = item.readerScene != null;
  const title = !on
    ? 'Audience does not know — click to mark that the reader learns this (set the reveal scene by editing the secret)'
    : sceneSet ? `Audience learns this at scene ${item.readerScene}` : 'Audience knows — set the reveal scene (edit ✏️) to enable dramatic-irony detection';
  return h('button', {
    class: 'btn btn--ghost btn--sm',
    title,
    style: { fontSize: '14px' },
    // Toggle only flips the flag; the reveal scene stays unset (no irony noise)
    // until the author sets it via the edit modal.
    onclick: () => { setReaderKnowledge(item.id, !on, on ? null : item.readerScene ?? null); rerender(container); },
  }, on ? (sceneSet ? '👁️' : '👁️‍🗨️') : '🙈');
}

function knowerBadge(item, piece, atOrder) {
  const lvl = levelAtScene(item, piece.id, atOrder);
  const meta = KNOWLEDGE_LEVELS[lvl];
  return h('span', { title: meta.label, style: { fontSize: '15px' } }, meta.icon);
}

const CYCLE = ['unaware', 'knows', 'suspects', 'false'];
function cycleKnower(item, piece, scn, container) {
  const lastOrder = scn.length ? (scn[scn.length - 1].order ?? scn.length) : 0;
  const cur = levelAtScene(item, piece.id, lastOrder);
  const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
  // Default learn-scene = first scene; author refines via edit.
  const learnScene = scn.length ? (scn[0].order ?? 0) : 0;
  setKnower(item.id, piece.id, next, learnScene);
  rerender(container);
}

function editItem(item, container) {
  const state = { label: item.label, detail: item.detail || '', readerScene: item.readerScene ?? '' };
  const content = h('div', {},
    formField('Secret / knowledge', h('input', { class: 'input', value: state.label, oninput: (e) => state.label = e.target.value })),
    formField('Detail (the truth)', h('textarea', { class: 'input', style: { minHeight: '60px' }, oninput: (e) => state.detail = e.target.value }, state.detail)),
    formField('Reader learns at scene # (blank = never / from start via toggle)', h('input', { class: 'input', type: 'number', min: '0', value: String(state.readerScene), oninput: (e) => state.readerScene = e.target.value })),
  );
  showModal(`Edit: ${item.label}`, content, () => {
    const items = listKnowledge();
    const it = items.find((i) => i.id === item.id);
    if (!it) return;
    it.label = state.label.trim() || it.label;
    it.detail = state.detail;
    if (state.readerScene !== '') {
      it.reader = true;
      it.readerScene = Number(state.readerScene);
    } else {
      // Blank reveal scene clears audience-knowledge (symmetric with the eye toggle).
      it.reader = false;
      it.readerScene = null;
    }
    repo.write(Collections.KNOWLEDGE, items);
    rerender(container);
  });
}

function renderIronyAnalysis(body, items, scn) {
  const section = h('div', { class: 'intel-section', style: { marginTop: '20px' } },
    h('div', { class: 'intel-section__title' }, '🎭 Dramatic Irony & Continuity'));

  const pieceName = new Map(pieces().map((p) => [p.id, p.name]));
  let ironyCount = 0;
  scn.forEach((s) => {
    const irony = ironyInScene(s, items);
    irony.forEach(({ item, pieceId, level }) => {
      ironyCount++;
      section.appendChild(h('div', { class: 'ai-suggestion' },
        h('span', { class: 'ai-suggestion__icon' }, '🎭'), ' ',
        h('strong', {}, `Scene ${s.order}: `),
        `The reader knows "${item.label}", but ${pieceName.get(pieceId) || pieceId} ${level === 'false' ? 'believes something false' : 'is unaware'} — dramatic irony.`,
      ));
    });
  });

  const leaks = knowledgeLeaks(scn, items);
  leaks.forEach((leak) => {
    section.appendChild(h('div', { class: 'ai-suggestion', style: { borderLeft: '2px solid var(--danger, #ef4444)', paddingLeft: '8px' } },
      h('span', { class: 'ai-suggestion__icon' }, '⚠️'), ' ',
      h('strong', {}, `Continuity: `),
      `${pieceName.get(leak.pieceId) || leak.pieceId} references "${leak.item.label}" in scene ${leak.seenAt}, but doesn't learn it until scene ${leak.learnedAt}.`,
    ));
  });

  if (ironyCount === 0 && leaks.length === 0) {
    section.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'No dramatic irony or continuity issues detected yet. Set which scene the reader and each character learns a secret to surface them.'));
  }
  body.appendChild(section);
}

// ─── #8 Setups & Payoffs (Chekhov's Gun) ─────────────────────────────────────

function loadSetups() { return repo.list('storySetups'); }
function saveSetups(s) { return repo.write('storySetups', s); }

/** Seed setups from existing narrative signals the author already entered. */
function seedSetups() {
  const existing = loadSetups();
  const known = new Set(existing.map((s) => s.sourceKey));
  const add = [];
  // Hidden goals on board pieces are classic planted guns.
  pieces().forEach((p) => {
    if (p.hiddenGoal && String(p.hiddenGoal).trim()) {
      const key = `piece:${p.id}`;
      if (!known.has(key)) add.push({ id: `su_${p.id}`, sourceKey: key, label: `${p.name}'s hidden goal`, detail: p.hiddenGoal, kind: 'Hidden goal', plantedScene: '', paidOff: false, payoffScene: '' });
    }
  });
  // Mystery threads.
  repo.list(Collections.MYSTERIES).forEach((m) => {
    const key = `mystery:${m.id}`;
    if (!known.has(key)) add.push({ id: `su_m_${m.id}`, sourceKey: key, label: m.title, detail: m.truth || m.question || '', kind: 'Mystery', plantedScene: '', paidOff: m.status === 'resolved', payoffScene: '' });
  });
  if (add.length) saveSetups([...existing, ...add]);
  return [...existing, ...add];
}

function renderSetups(body, container) {
  const setups = loadSetups();

  body.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
    h('button', { class: 'btn btn--sm btn--primary', onclick: () => openSetupModal(container) }, '+ Setup'),
    h('button', { class: 'btn btn--sm', onclick: () => { const before = loadSetups().length; const after = seedSetups(); toastInfo(after.length > before ? `Found ${after.length - before} planted element(s).` : 'No new plants found.'); rerender(container); } }, '↺ Detect from Story'),
  ));

  if (setups.length === 0) {
    body.appendChild(emptyNote('No setups tracked yet. "Detect from Story" pulls in your characters\' hidden goals and mystery threads as planted elements — then mark when each pays off.'));
    return;
  }

  const paid = setups.filter((s) => s.paidOff);
  const unpaid = setups.filter((s) => !s.paidOff);

  // Summary.
  body.appendChild(h('div', { style: { display: 'flex', gap: '16px', marginBottom: '16px' } },
    stat('🎯 Planted', setups.length),
    stat('✅ Paid off', paid.length),
    stat('⏳ Unfired', unpaid.length),
  ));

  const listEl = h('div', {});
  setups.forEach((s) => {
    const noSetupScene = s.paidOff && !String(s.plantedScene).trim();
    listEl.appendChild(h('div', { class: 'intel-card', style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', padding: '10px 12px' } },
      h('span', { style: { fontSize: '18px' } }, s.paidOff ? '✅' : '🔫'),
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, s.label),
        h('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } },
          `${s.kind || 'Element'}`,
          s.plantedScene ? ` · planted S${s.plantedScene}` : ' · setup scene unset',
          s.paidOff ? (s.payoffScene ? ` · paid off S${s.payoffScene}` : ' · paid off') : ' · not yet paid off',
        ),
        noSetupScene ? h('div', { style: { fontSize: '11px', color: 'var(--warning)' } }, '⚠️ Paid off but has no setup scene — did you plant it?') : null,
        (!s.paidOff && s.plantedScene) ? h('div', { style: { fontSize: '11px', color: 'var(--warning)' } }, '⚠️ Planted but never fired — pay it off or cut it.') : null,
      ),
      h('button', { class: 'btn btn--ghost btn--sm', onclick: () => openSetupModal(container, s) }, 'Edit'),
    ));
  });
  body.appendChild(listEl);
}

function openSetupModal(container, existing) {
  const state = existing ? { ...existing } : { label: '', kind: 'Foreshadowing', detail: '', plantedScene: '', paidOff: false, payoffScene: '' };
  const content = h('div', {},
    formField('Element', h('input', { class: 'input', value: state.label, placeholder: 'e.g. The poisoned chalice', oninput: (e) => state.label = e.target.value })),
    formField('Kind', h('select', { class: 'input', onchange: (e) => state.kind = e.target.value },
      ...['Foreshadowing', 'Hidden goal', 'Secret', 'Object/Artifact', 'Mystery', 'Prophecy', 'Skill/Ability'].map((k) => h('option', { value: k, ...(k === state.kind ? { selected: 'selected' } : {}) }, k)))),
    formField('Planted at scene #', h('input', { class: 'input', type: 'number', min: '0', value: String(state.plantedScene), oninput: (e) => state.plantedScene = e.target.value })),
    formField('Paid off?', h('select', { class: 'input', onchange: (e) => state.paidOff = e.target.value === 'yes' },
      h('option', { value: 'no', ...(!state.paidOff ? { selected: 'selected' } : {}) }, 'Not yet'),
      h('option', { value: 'yes', ...(state.paidOff ? { selected: 'selected' } : {}) }, 'Yes'))),
    formField('Paid off at scene #', h('input', { class: 'input', type: 'number', min: '0', value: String(state.payoffScene), oninput: (e) => state.payoffScene = e.target.value })),
  );
  showModal(existing ? `Edit: ${existing.label}` : 'Add Setup', content, () => {
    if (!state.label.trim()) return;
    const setups = loadSetups();
    if (existing) {
      const idx = setups.findIndex((s) => s.id === existing.id);
      if (idx !== -1) setups[idx] = { ...setups[idx], ...state };
    } else {
      setups.push({ id: `su_${Date.now()}`, sourceKey: `custom:${Date.now()}`, ...state });
    }
    saveSetups(setups);
    rerender(container);
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function cellHead(first) {
  return { padding: '6px 8px', borderBottom: '2px solid var(--border-default)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: first ? 'left' : 'center', position: 'sticky', top: '0', background: 'var(--bg-primary)' };
}
function cell(first) {
  return { padding: '8px', borderBottom: '1px solid var(--border-subtle)', textAlign: first ? 'left' : 'center', verticalAlign: 'top' };
}
function stat(label, value) {
  return h('div', { class: 'intel-card', style: { textAlign: 'center', padding: '10px 16px' } },
    h('div', { style: { fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' } }, String(value)),
    h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' } }, label));
}
function emptyNote(text) {
  return h('div', { class: 'empty-state', style: { padding: '32px' } },
    h('div', { class: 'empty-state__icon' }, '🕵️'),
    h('div', { class: 'empty-state__description' }, text));
}
