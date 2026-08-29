/**
 * LoreForge Planner - Confrontations (#28)
 *
 * A generalized CONTEST resolver. Not just battles: pick any 2+ sides (board
 * pieces or whole factions), choose the STAKE (throne, trial, market war,
 * intrigue, siege, debate, heist…), tune which resources matter, and resolve an
 * outcome with win probabilities, an upset chance, and a resulting power shift
 * you can push straight onto the Strategic Board as a scene.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';
import { showModal, formField } from '../ui/modal.js';
import { toastSuccess, toastInfo } from '../ui/toast.js';
import {
  STAKE_PRESETS, RESOURCE_AXES, sideFromPieces, resolveConfrontation, normalizeWeights, effectiveStrength,
} from '../core/confrontation.js';

const BAR_PALETTE = ['#6366f1', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899'];

function pieces() { return repo.list(Collections.PIECES); }
function factions() { return repo.list(Collections.BOARD_FACTIONS); }

// Setup state (module-scoped so it survives a re-render within the view).
let setup = null;
let lastResult = null;

function freshSetup() {
  return {
    title: '',
    stake: 'battle',
    weights: { ...STAKE_PRESETS.battle.weights },
    decisiveness: 1,
    shiftMagnitude: 20,
    // sides: [{ mode:'faction'|'pieces', factionId?, pieceIds?:[], name }]
    sides: [],
  };
}

export function renderConfrontations(container) {
  if (!setup) setup = freshSetup();
  const pcs = pieces();

  const wrap = h('div', { style: { width: '100%', height: '100%', overflow: 'auto', padding: 'var(--space-xl)' } });
  wrap.appendChild(h('div', { style: { marginBottom: '16px' } },
    h('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, '⚔️ Confrontations'),
    h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, 'Resolve any contest — a battle, a trial, an election, a market war — between two or more sides, and push the outcome to your board.'),
  ));

  if (pcs.length === 0) {
    wrap.appendChild(emptyNote('Add characters on the Strategic Board first — confrontations pit their resources against each other.'));
    container.appendChild(wrap);
    return;
  }

  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' } });
  grid.appendChild(renderSetupPanel(container));
  grid.appendChild(renderResultPanel(container));
  wrap.appendChild(grid);

  container.appendChild(wrap);
}

function rerender(container) {
  renderPreservingScroll(container, () => { container.innerHTML = ''; renderConfrontations(container); });
}

function renderSetupPanel(container) {
  const panel = h('div', { class: 'intel-section' }, h('div', { class: 'intel-section__title' }, '🎯 Set up the contest'));

  // Title
  panel.appendChild(formField('Contest name', h('input', { class: 'input', value: setup.title, placeholder: 'e.g. The Siege of Blackreach', oninput: (e) => setup.title = e.target.value })));

  // Stake preset
  panel.appendChild(formField('Stake', h('select', { class: 'input', onchange: (e) => { setup.stake = e.target.value; if (STAKE_PRESETS[e.target.value] && e.target.value !== 'custom') setup.weights = { ...STAKE_PRESETS[e.target.value].weights }; rerender(container); } },
    ...Object.entries(STAKE_PRESETS).map(([k, v]) => h('option', { value: k, ...(k === setup.stake ? { selected: 'selected' } : {}) }, `${v.icon} ${v.label}`)))));

  // Resource weight sliders
  const weightsBox = h('div', { style: { marginBottom: '12px' } },
    h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, 'What matters in this contest?'),
    ...RESOURCE_AXES.map((axis) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
      h('span', { style: { width: '80px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' } }, axis),
      h('input', { type: 'range', min: '0', max: '3', step: '0.5', value: String(setup.weights[axis] ?? 1), style: { flex: '1' }, oninput: (e) => { setup.weights[axis] = Number(e.target.value); setup.stake = 'custom'; } }),
    )),
  );
  panel.appendChild(weightsBox);

  // Decisiveness
  panel.appendChild(h('div', { style: { marginBottom: '12px' } },
    h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' } }, 'Decisiveness (low = upset-friendly, high = the stronger side reliably wins)'),
    h('input', { type: 'range', min: '0.3', max: '3', step: '0.1', value: String(setup.decisiveness), style: { width: '100%' }, oninput: (e) => setup.decisiveness = Number(e.target.value) }),
  ));

  // Sides
  panel.appendChild(h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', margin: '8px 0 4px' } }, `Sides (${setup.sides.length})`));
  setup.sides.forEach((side, i) => {
    panel.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' } },
      h('span', { style: { flex: '1', color: 'var(--text-primary)' } }, `${i + 1}. ${sideName(side)}`),
      h('span', { style: { color: 'var(--text-muted)', fontSize: '11px' } }, `str ${Math.round(effectiveStrength(buildSide(side), normalizeWeights(setup.weights)))}`),
      h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Remove', onclick: () => { setup.sides.splice(i, 1); rerender(container); } }, '✕'),
    ));
  });
  panel.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
    h('button', { class: 'btn btn--sm', onclick: () => openAddSideModal(container, 'faction') }, '+ Faction side'),
    h('button', { class: 'btn btn--sm', onclick: () => openAddSideModal(container, 'pieces') }, '+ Character side'),
  ));

  // Resolve
  panel.appendChild(h('button', {
    class: 'btn btn--primary', style: { width: '100%', marginTop: '16px' },
    disabled: setup.sides.length < 2,
    onclick: () => { runResolve(container); },
  }, setup.sides.length < 2 ? 'Add at least 2 sides' : '⚔️ Resolve Confrontation'));

  return panel;
}

function renderResultPanel(container) {
  const panel = h('div', { class: 'intel-section' }, h('div', { class: 'intel-section__title' }, '📊 Outcome'));
  if (!lastResult) {
    panel.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' } }, 'Set up a contest and resolve it to see win probabilities, the outcome, and the resulting power shift.'));
    return panel;
  }
  const r = lastResult;
  panel.appendChild(h('div', { style: { fontSize: '15px', fontWeight: '700', color: r.upset ? 'var(--warning)' : 'var(--success)', marginBottom: '4px' } }, `🏆 ${r.winner.name}`));
  panel.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' } }, r.summary));

  // Probability bars (inline progress bars — no chart dependency).
  panel.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, 'Win probability'));
  r.probabilities.forEach((p, i) => {
    const pct = Math.round(p.p * 100);
    const isWinner = p.sideId === r.winner.id;
    panel.appendChild(h('div', { style: { marginBottom: '8px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' } },
        h('span', { style: { color: 'var(--text-secondary)' } }, `${isWinner ? '🏆 ' : ''}${p.name}`),
        h('span', { style: { fontWeight: '700', color: 'var(--text-primary)' } }, `${pct}%`),
      ),
      h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${pct}%`, background: isWinner ? '#22c55e' : BAR_PALETTE[i % BAR_PALETTE.length] } })),
    ));
  });

  // Power shift.
  const factionName = new Map(factions().map((f) => [f.id, f.name]));
  const shifts = Object.entries(r.powerShift);
  if (shifts.length) {
    panel.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', margin: '12px 0 4px' } }, 'Resulting power shift'));
    shifts.forEach(([fid, delta]) => panel.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' } },
      h('span', { style: { color: 'var(--text-secondary)' } }, factionName.get(fid) || fid),
      h('span', { style: { fontWeight: '700', color: delta >= 0 ? 'var(--success)' : 'var(--danger)' } }, `${delta >= 0 ? '+' : ''}${delta}`),
    )));
  }

  panel.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } },
    h('button', { class: 'btn btn--primary btn--sm', onclick: () => pushToBoard(container) }, '➕ Add as Board Scene'),
    h('button', { class: 'btn btn--sm', onclick: () => { runResolve(container); } }, '🎲 Re-roll'),
  ));
  return panel;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function buildSide(sideDef) {
  if (sideDef.mode === 'faction') {
    const members = pieces().filter((p) => p.faction === sideDef.factionId);
    const f = factions().find((x) => x.id === sideDef.factionId);
    return sideFromPieces({ id: sideDef.factionId, name: f ? f.name : 'Faction', factionId: sideDef.factionId }, members);
  }
  const chosen = pieces().filter((p) => (sideDef.pieceIds || []).includes(p.id));
  // A character side inherits the faction of its first member (for power-shift attribution).
  const factionId = chosen[0]?.faction;
  return sideFromPieces({ id: sideDef.id, name: sideDef.name, factionId }, chosen);
}

function sideName(sideDef) {
  if (sideDef.mode === 'faction') { const f = factions().find((x) => x.id === sideDef.factionId); return f ? f.name : 'Faction'; }
  return sideDef.name;
}

function runResolve(container) {
  if (setup.sides.length < 2) return;
  const sides = setup.sides.map(buildSide);
  // Guard against sides that resolved to zero strength (e.g. their pieces were
  // deleted from the board since being added) — resolving them would silently
  // misrepresent the matchup.
  const norm = normalizeWeights(setup.weights);
  const empty = sides.filter((s) => effectiveStrength(s, norm) <= 0);
  if (empty.length) {
    toastInfo(`${empty.map((s) => s.name).join(', ')} has no strength — its characters may have been removed. Fix the sides before resolving.`);
    return;
  }
  lastResult = resolveConfrontation({ sides, weights: setup.weights, decisiveness: setup.decisiveness, shiftMagnitude: setup.shiftMagnitude });
  rerender(container);
}

function pushToBoard(container) {
  if (!lastResult) return;
  const scenes = repo.list(Collections.SCENES);
  const maxOrder = scenes.reduce((m, s) => Math.max(m, s.order || 0), 0);
  // Build the scene cast from ALL sides: explicit piece sides contribute their
  // chosen pieces; faction sides contribute their member pieces.
  const participants = [];
  const allPieces = pieces();
  setup.sides.forEach((sd) => {
    if (sd.mode === 'pieces') participants.push(...(sd.pieceIds || []));
    else if (sd.mode === 'faction') participants.push(...allPieces.filter((p) => p.faction === sd.factionId).map((p) => p.id));
  });
  // De-dupe (a piece could appear in two sides).
  const uniqueParticipants = [...new Set(participants)];
  const scene = {
    id: generateId(),
    title: setup.title || `Confrontation: ${lastResult.winner.name} prevails`,
    order: maxOrder + 1,
    summary: lastResult.summary,
    participants: uniqueParticipants,
    conflictType: stakeToConflictType(setup.stake),
    powerShift: lastResult.powerShift,
    outcome: `${lastResult.winner.name} won.`,
    status: 'completed',
  };
  scenes.push(scene);
  repo.write(Collections.SCENES, scenes);
  toastSuccess('Added as a board scene — open the Strategic Board to see it.');
  appStore.setState({ activeModule: 'conflict-board' });
}

function stakeToConflictType(stake) {
  return ({ battle: 'opposition', throne: 'manipulation', trial: 'manipulation', market: 'competition', intrigue: 'manipulation', debate: 'competition', heist: 'opposition' })[stake] || 'opposition';
}

function openAddSideModal(container, mode) {
  const pcs = pieces();
  const facs = factions();
  if (mode === 'faction') {
    if (facs.length === 0) { toastInfo('No factions yet — create factions on the board first.'); return; }
    const state = { factionId: facs[0].id };
    const content = formField('Faction', h('select', { class: 'input', onchange: (e) => state.factionId = e.target.value },
      ...facs.map((f) => h('option', { value: f.id }, f.name))));
    showModal('Add Faction Side', content, () => {
      setup.sides.push({ mode: 'faction', factionId: state.factionId });
      rerender(container);
    });
    return;
  }
  // Character side: pick one or more pieces.
  const state = { name: '', pieceIds: [] };
  const checks = h('div', { style: { maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px' } },
    ...pcs.map((p) => h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '12px', cursor: 'pointer' } },
      h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) state.pieceIds.push(p.id); else state.pieceIds = state.pieceIds.filter((x) => x !== p.id); } }),
      h('span', {}, `${p.name} (${p.role || 'piece'})`),
    )),
  );
  const content = h('div', {},
    formField('Side name', h('input', { class: 'input', placeholder: 'e.g. The Rebel Cell', oninput: (e) => state.name = e.target.value })),
    formField('Members', checks),
  );
  showModal('Add Character Side', content, () => {
    if (state.pieceIds.length === 0) return;
    setup.sides.push({ mode: 'pieces', id: `side_${Date.now()}`, name: state.name.trim() || 'Unnamed side', pieceIds: state.pieceIds });
    rerender(container);
  });
}

function emptyNote(text) {
  return h('div', { class: 'empty-state', style: { padding: '32px' } },
    h('div', { class: 'empty-state__icon' }, '⚔️'),
    h('div', { class: 'empty-state__description' }, text));
}
