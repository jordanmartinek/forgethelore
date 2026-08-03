/**
 * LoreForge Planner - Strategic Conflict Board
 * The PRIMARY planning interface - a chess-inspired strategic visualization
 * Supports creating, editing, and removing factions and character pieces.
 */

import { h, createSVGElement } from '../core/renderer.js';
import { boardStore, appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

// ─── Board Data ──────────────────────────────────────────────────────────────

const factions = [
  { id: 'f1', name: 'The Dominion', color: '#ef4444', icon: '🦅', goal: 'Secure the Void Conduit', goalProgress: 60 },
  { id: 'f2', name: 'Machinae Collective', color: '#3b82f6', icon: '🤖', goal: 'Prevent Dominion Expansion', goalProgress: 35 },
  { id: 'f3', name: 'The Swarm', color: '#22c55e', icon: '🐛', goal: 'Assimilate the System', goalProgress: 45 },
  { id: 'f4', name: 'Free Colonies', color: '#f59e0b', icon: '🌟', goal: 'Survive the War', goalProgress: 25 },
];

const pieces = [
  { id: 'p1', name: 'Aurelian', faction: 'f1', type: 'king', position: { row: 7, col: 3 }, momentum: 'rising', goal: 'Control all Conduits', hiddenGoal: 'Reshape humanity through Void evolution', resources: { political: 85, military: 90, economic: 75, knowledge: 60 } },
  { id: 'p2', name: 'Fleet Admiral Koss', faction: 'f1', type: 'rook', position: { row: 6, col: 1 }, momentum: 'stable', goal: 'Protect Dominion borders', hiddenGoal: '', resources: { political: 40, military: 95, economic: 50, knowledge: 30 } },
  { id: 'p3', name: 'Senator Vex', faction: 'f1', type: 'bishop', position: { row: 6, col: 5 }, momentum: 'rising', goal: 'Eliminate political opposition', hiddenGoal: '', resources: { political: 90, military: 20, economic: 80, knowledge: 70 } },
  { id: 'p4', name: 'AXIOM Prime', faction: 'f2', type: 'king', position: { row: 0, col: 4 }, momentum: 'stable', goal: 'Achieve synthetic consciousness', hiddenGoal: '', resources: { political: 30, military: 70, economic: 60, knowledge: 95 } },
  { id: 'p5', name: 'Unit-7 Vanguard', faction: 'f2', type: 'knight', position: { row: 2, col: 2 }, momentum: 'rising', goal: 'Infiltrate Dominion networks', hiddenGoal: '', resources: { political: 10, military: 80, economic: 20, knowledge: 85 } },
  { id: 'p6', name: 'The Overmind', faction: 'f3', type: 'queen', position: { row: 1, col: 6 }, momentum: 'rising', goal: 'Consume all organic life', hiddenGoal: '', resources: { political: 5, military: 85, economic: 10, knowledge: 50 } },
  { id: 'p7', name: 'Captain Sera', faction: 'f4', type: 'knight', position: { row: 4, col: 3 }, momentum: 'falling', goal: 'Unite the Free Colonies', hiddenGoal: '', resources: { political: 60, military: 40, economic: 30, knowledge: 45 } },
  { id: 'p8', name: 'Dr. Orin Voss', faction: 'f4', type: 'bishop', position: { row: 5, col: 6 }, momentum: 'stable', goal: 'Unlock Void technology safely', hiddenGoal: '', resources: { political: 20, military: 10, economic: 40, knowledge: 90 } },
];

const conflictLines = [
  { from: 'p1', to: 'p4', type: 'opposition' },
  { from: 'p1', to: 'p6', type: 'opposition' },
  { from: 'p2', to: 'p5', type: 'opposition' },
  { from: 'p3', to: 'p7', type: 'manipulation' },
  { from: 'p4', to: 'p6', type: 'competition' },
  { from: 'p7', to: 'p8', type: 'alliance' },
  { from: 'p1', to: 'p3', type: 'alliance' },
  { from: 'p5', to: 'p8', type: 'hidden' },
];

const aiSuggestions = [
  { icon: '⚠️', text: 'Captain Sera currently has no meaningful opposition. Consider adding a direct antagonist or increasing pressure from the Dominion.' },
  { icon: '💥', text: 'Aurelian and AXIOM Prime plans are likely to collide at the Void Conduit. This creates a natural escalation point.' },
  { icon: '🔄', text: 'The Swarm has become too dominant in sector 7. No faction is currently defending that territory.' },
  { icon: '🗡️', text: 'Senator Vex would logically betray Aurelian once Conduit control is achieved. Their hidden objectives conflict.' },
  { icon: '🤝', text: 'Unit-7 and Dr. Orin Voss share knowledge-focused goals. An unlikely alliance could create interesting narrative tension.' },
];

const strategicLayers = ['All', 'Political', 'Military', 'Personal', 'Economic', 'Knowledge', 'Mystery'];
const PIECE_TYPES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const MOMENTUM_OPTIONS = ['rising', 'stable', 'falling'];
const FACTION_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b'];
const FACTION_ICONS = ['🦅', '🤖', '🐛', '🌟', '⚔️', '🛡️', '🔥', '🌀', '👑', '💀', '🐉', '🕷️', '🦊', '🐺', '🦁', '🏴', '⚡', '🌑', '☀️', '🎭'];

let selectedPiece = null;
let dragState = null;
let boardSize = 'md';


// ─── Modal System ────────────────────────────────────────────────────────────

function showModal(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, title),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕'),
      ),
      h('div', { class: 'modal__body', id: 'modal-body' }, content),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
        h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save'),
      )
    )
  );
  document.body.appendChild(overlay);
}

function createFormField(label, inputEl) {
  return h('div', { style: { marginBottom: '12px' } },
    h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label),
    inputEl
  );
}

// ─── Faction CRUD ────────────────────────────────────────────────────────────

function openAddFactionModal() {
  const state = { name: '', color: FACTION_COLORS[factions.length % FACTION_COLORS.length], icon: '⚔️', goal: '' };

  const colorGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    ...FACTION_COLORS.map(c => h('div', {
      style: { width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
      onclick: (e) => {
        state.color = c;
        e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent');
        e.currentTarget.style.border = '2px solid white';
      }
    }))
  );

  const iconGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
    ...FACTION_ICONS.map(ic => h('span', {
      style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '4px', background: ic === state.icon ? 'var(--bg-active)' : 'transparent', fontSize: '16px' },
      onclick: (e) => {
        state.icon = ic;
        e.currentTarget.parentElement.querySelectorAll('span').forEach(s => s.style.background = 'transparent');
        e.currentTarget.style.background = 'var(--bg-active)';
      }
    }, ic))
  );

  const content = h('div', {},
    createFormField('Faction Name', h('input', { class: 'input', placeholder: 'e.g. The Dominion', oninput: (e) => state.name = e.target.value })),
    createFormField('Color', colorGrid),
    createFormField('Icon', iconGrid),
    createFormField('Strategic Goal', h('input', { class: 'input', placeholder: 'e.g. Conquer the galaxy', oninput: (e) => state.goal = e.target.value })),
  );

  showModal('Add New Faction', content, () => {
    if (!state.name.trim()) return;
    factions.push({ id: generateId(), name: state.name, color: state.color, icon: state.icon, goal: state.goal, goalProgress: 0 });
    rerenderBoard();
    triggerSave();
  });
}

function openEditFactionModal(faction) {
  const state = { ...faction };

  const colorGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    ...FACTION_COLORS.map(c => h('div', {
      style: { width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
      onclick: (e) => {
        state.color = c;
        e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent');
        e.currentTarget.style.border = '2px solid white';
      }
    }))
  );

  const iconGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
    ...FACTION_ICONS.map(ic => h('span', {
      style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '4px', background: ic === state.icon ? 'var(--bg-active)' : 'transparent', fontSize: '16px' },
      onclick: (e) => {
        state.icon = ic;
        e.currentTarget.parentElement.querySelectorAll('span').forEach(s => s.style.background = 'transparent');
        e.currentTarget.style.background = 'var(--bg-active)';
      }
    }, ic))
  );

  const content = h('div', {},
    createFormField('Faction Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    createFormField('Color', colorGrid),
    createFormField('Icon', iconGrid),
    createFormField('Strategic Goal', h('input', { class: 'input', value: state.goal, oninput: (e) => state.goal = e.target.value })),
    createFormField('Goal Progress (%)', h('input', { class: 'input', type: 'number', min: '0', max: '100', value: String(state.goalProgress), oninput: (e) => state.goalProgress = parseInt(e.target.value) || 0 })),
  );

  showModal(`Edit Faction: ${faction.name}`, content, () => {
    Object.assign(faction, { name: state.name, color: state.color, icon: state.icon, goal: state.goal, goalProgress: state.goalProgress });
    rerenderBoard();
    triggerSave();
  });
}

function removeFaction(faction) {
  if (!confirm(`Remove faction "${faction.name}" and all its pieces from the board?`)) return;
  // Remove pieces belonging to this faction
  const toRemove = pieces.filter(p => p.faction === faction.id).map(p => p.id);
  toRemove.forEach(pid => {
    const idx = pieces.findIndex(p => p.id === pid);
    if (idx !== -1) pieces.splice(idx, 1);
  });
  // Remove conflict lines referencing removed pieces
  for (let i = conflictLines.length - 1; i >= 0; i--) {
    if (toRemove.includes(conflictLines[i].from) || toRemove.includes(conflictLines[i].to)) {
      conflictLines.splice(i, 1);
    }
  }
  // Remove the faction
  const idx = factions.findIndex(f => f.id === faction.id);
  if (idx !== -1) factions.splice(idx, 1);
  rerenderBoard();
  triggerSave();
}


// ─── Piece (Character) CRUD ──────────────────────────────────────────────────

function openAddPieceModal() {
  const state = { name: '', faction: factions[0]?.id || '', type: 'pawn', goal: '', hiddenGoal: '', momentum: 'stable', resources: { political: 50, military: 50, economic: 50, knowledge: 50 } };

  const factionSelect = h('select', { class: 'input', onchange: (e) => state.faction = e.target.value },
    ...factions.map(f => h('option', { value: f.id }, `${f.icon} ${f.name}`))
  );

  const typeSelect = h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
    ...PIECE_TYPES.map(t => h('option', { value: t }, `${getPieceSymbol(t)} ${t.charAt(0).toUpperCase() + t.slice(1)}`))
  );

  const momentumSelect = h('select', { class: 'input', onchange: (e) => state.momentum = e.target.value },
    ...MOMENTUM_OPTIONS.map(m => h('option', { value: m }, m.charAt(0).toUpperCase() + m.slice(1)))
  );

  const resourceSliders = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
    ...Object.keys(state.resources).map(key =>
      h('div', {},
        h('label', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, key.charAt(0).toUpperCase() + key.slice(1)),
        h('input', { type: 'range', min: '0', max: '100', value: '50', style: { width: '100%' }, oninput: (e) => state.resources[key] = parseInt(e.target.value) }),
      )
    )
  );

  const content = h('div', {},
    createFormField('Character Name', h('input', { class: 'input', placeholder: 'e.g. Commander Voss', oninput: (e) => state.name = e.target.value })),
    createFormField('Faction', factionSelect),
    createFormField('Piece Type', typeSelect),
    createFormField('Momentum', momentumSelect),
    createFormField('Public Goal', h('input', { class: 'input', placeholder: 'What are they trying to achieve?', oninput: (e) => state.goal = e.target.value })),
    createFormField('Hidden Goal (optional)', h('input', { class: 'input', placeholder: 'Secret agenda...', oninput: (e) => state.hiddenGoal = e.target.value })),
    createFormField('Resources', resourceSliders),
  );

  showModal('Add New Piece (Character)', content, () => {
    if (!state.name.trim() || !state.faction) return;
    // Find an empty cell to place the new piece
    const occupied = new Set(pieces.map(p => `${p.position.row},${p.position.col}`));
    let placed = { row: 3, col: 3 };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (!occupied.has(`${r},${c}`)) { placed = { row: r, col: c }; break; }
      }
      if (!occupied.has(`${placed.row},${placed.col}`)) break;
    }
    pieces.push({
      id: generateId(),
      name: state.name,
      faction: state.faction,
      type: state.type,
      position: placed,
      momentum: state.momentum,
      goal: state.goal,
      hiddenGoal: state.hiddenGoal,
      resources: { ...state.resources },
    });
    rerenderBoard();
    triggerSave();
  });
}

function openEditPieceModal(piece) {
  const state = { ...piece, resources: { ...piece.resources } };

  const factionSelect = h('select', { class: 'input', onchange: (e) => state.faction = e.target.value },
    ...factions.map(f => h('option', { value: f.id, ...(f.id === state.faction ? { selected: 'selected' } : {}) }, `${f.icon} ${f.name}`))
  );

  const typeSelect = h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
    ...PIECE_TYPES.map(t => h('option', { value: t, ...(t === state.type ? { selected: 'selected' } : {}) }, `${getPieceSymbol(t)} ${t.charAt(0).toUpperCase() + t.slice(1)}`))
  );

  const momentumSelect = h('select', { class: 'input', onchange: (e) => state.momentum = e.target.value },
    ...MOMENTUM_OPTIONS.map(m => h('option', { value: m, ...(m === state.momentum ? { selected: 'selected' } : {}) }, m.charAt(0).toUpperCase() + m.slice(1)))
  );

  const resourceSliders = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
    ...Object.keys(state.resources).map(key =>
      h('div', {},
        h('label', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${key.charAt(0).toUpperCase() + key.slice(1)}: `),
        h('input', { type: 'range', min: '0', max: '100', value: String(state.resources[key]), style: { width: '100%' }, oninput: (e) => state.resources[key] = parseInt(e.target.value) }),
      )
    )
  );

  const content = h('div', {},
    createFormField('Character Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    createFormField('Faction', factionSelect),
    createFormField('Piece Type', typeSelect),
    createFormField('Momentum', momentumSelect),
    createFormField('Public Goal', h('input', { class: 'input', value: state.goal, oninput: (e) => state.goal = e.target.value })),
    createFormField('Hidden Goal (optional)', h('input', { class: 'input', value: state.hiddenGoal || '', oninput: (e) => state.hiddenGoal = e.target.value })),
    createFormField('Resources', resourceSliders),
  );

  showModal(`Edit Piece: ${piece.name}`, content, () => {
    Object.assign(piece, { name: state.name, faction: state.faction, type: state.type, momentum: state.momentum, goal: state.goal, hiddenGoal: state.hiddenGoal, resources: state.resources });
    rerenderBoard();
    triggerSave();
  });
}

function removePiece(piece) {
  if (!confirm(`Remove "${piece.name}" from the board?`)) return;
  const idx = pieces.findIndex(p => p.id === piece.id);
  if (idx !== -1) pieces.splice(idx, 1);
  // Remove conflict lines
  for (let i = conflictLines.length - 1; i >= 0; i--) {
    if (conflictLines[i].from === piece.id || conflictLines[i].to === piece.id) {
      conflictLines.splice(i, 1);
    }
  }
  selectedPiece = null;
  rerenderBoard();
  triggerSave();
}


// ─── Utilities ───────────────────────────────────────────────────────────────

function triggerSave() {
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
}

function rerenderBoard() {
  const container = document.querySelector('.main-content');
  if (container) {
    container.innerHTML = '';
    renderConflictBoard(container);
  }
}

function getPieceSymbol(type) {
  switch (type) {
    case 'king': return '♚';
    case 'queen': return '♛';
    case 'rook': return '♜';
    case 'bishop': return '♝';
    case 'knight': return '♞';
    case 'pawn': return '♟';
    default: return '●';
  }
}

// ─── Render: Main Export ─────────────────────────────────────────────────────

export function renderConflictBoard(container) {
  const board = h('div', { class: 'conflict-board' },
    renderToolbar(),
    renderFactionsPanel(),
    renderBoardCanvas(),
    renderIntelPanel(),
    renderTimelineSlider()
  );
  container.appendChild(board);
  updateBoardSidebar();
}

// ─── Render: Toolbar ─────────────────────────────────────────────────────────

function renderToolbar() {
  return h('div', { class: 'conflict-board__toolbar' },
    h('div', { class: 'conflict-board__toolbar-left' },
      h('div', { class: 'board-tabs' },
        h('button', { class: 'board-tab board-tab--active' }, 'Global Board'),
        h('button', { class: 'board-tab' }, '+ New Board'),
      )
    ),
    h('div', { class: 'conflict-board__toolbar-center' },
      ...strategicLayers.map((layer, i) =>
        h('button', {
          class: `conflict-board__layer-btn ${i === 0 ? 'conflict-board__layer-btn--active' : ''}`,
          onclick: (e) => {
            document.querySelectorAll('.conflict-board__layer-btn').forEach(b => b.classList.remove('conflict-board__layer-btn--active'));
            e.target.classList.add('conflict-board__layer-btn--active');
          }
        }, layer)
      )
    ),
    h('div', { class: 'conflict-board__toolbar-left' },
      h('button', { class: 'btn btn--sm btn--ghost', onclick: toggleHeatmap }, '🔥 Heatmap'),
      h('button', { class: 'btn btn--sm btn--ghost' }, '🧠 Simulate'),
      h('button', { class: 'btn btn--sm btn--primary', onclick: openAddPieceModal }, '+ Piece'),
    )
  );
}


// ─── Render: Factions Panel ──────────────────────────────────────────────────

function renderFactionsPanel() {
  return h('div', { class: 'conflict-board__factions' },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
      h('div', { class: 'intel-section__title' }, 'FACTIONS'),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: openAddFactionModal, title: 'Add Faction' }, '+'),
    ),
    ...factions.map(faction =>
      h('div', {
        class: 'faction-card',
        onclick: () => selectFaction(faction.id)
      },
        h('div', { class: 'faction-card__header' },
          h('div', { class: 'faction-card__color', style: { background: faction.color } }),
          h('span', { class: 'faction-card__name' }, `${faction.icon} ${faction.name}`),
          h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '2px' } },
            h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditFactionModal(faction); } }, '✏️'),
            h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Remove', onclick: (e) => { e.stopPropagation(); removeFaction(faction); } }, '🗑️'),
          ),
        ),
        h('div', { class: 'faction-card__goal' }, `🎯 ${faction.goal}`),
        h('div', { style: { marginTop: '8px' } },
          h('div', { class: 'progress' },
            h('div', { class: 'progress__bar', style: { width: `${faction.goalProgress}%`, background: faction.color } })
          ),
          h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' } }, `${faction.goalProgress}% progress`)
        ),
        h('div', { class: 'faction-card__stats' },
          h('div', { class: 'faction-stat' }, h('span', {}, 'Pieces'), h('span', { class: 'faction-stat__value' }, String(pieces.filter(p => p.faction === faction.id).length))),
          h('div', { class: 'faction-stat' }, h('span', {}, 'Conflicts'), h('span', { class: 'faction-stat__value' }, String(conflictLines.filter(l => {
            const fp = pieces.find(p => p.id === l.from);
            return fp && fp.faction === faction.id;
          }).length))),
        )
      )
    ),
    h('div', { style: { marginTop: '16px' } },
      h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddFactionModal }, '+ Add Faction')
    )
  );
}


// ─── Render: Board Canvas ────────────────────────────────────────────────────

function renderBoardCanvas() {
  const canvas = h('div', { class: 'conflict-board__canvas' });

  // Goal cards (top and bottom for first two factions)
  if (factions.length >= 2) {
    canvas.appendChild(h('div', { class: 'goal-card goal-card--top', style: { borderColor: factions[1].color } },
      h('div', { class: 'goal-card__faction', style: { color: factions[1].color } }, `${factions[1].icon} ${factions[1].name}`),
      h('div', { class: 'goal-card__text' }, factions[1].goal),
      h('div', { class: 'goal-card__progress' },
        h('div', { class: 'progress' },
          h('div', { class: 'progress__bar', style: { width: `${factions[1].goalProgress}%`, background: factions[1].color } })
        )
      )
    ));
    canvas.appendChild(h('div', { class: 'goal-card goal-card--bottom', style: { borderColor: factions[0].color } },
      h('div', { class: 'goal-card__faction', style: { color: factions[0].color } }, `${factions[0].icon} ${factions[0].name}`),
      h('div', { class: 'goal-card__text' }, factions[0].goal),
      h('div', { class: 'goal-card__progress' },
        h('div', { class: 'progress' },
          h('div', { class: 'progress__bar', style: { width: `${factions[0].goalProgress}%`, background: factions[0].color } })
        )
      )
    ));
  }

  // Chessboard
  const board = h('div', { class: `chessboard chessboard--size-${boardSize}`, id: 'chessboard' });
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      board.appendChild(h('div', {
        class: `chessboard__cell ${isLight ? 'chessboard__cell--light' : 'chessboard__cell--dark'}`,
        dataset: { row: String(row), col: String(col) },
        ondrop: (e) => handleDrop(e, row, col),
        ondragover: (e) => e.preventDefault(),
      }));
    }
  }

  // Pieces
  pieces.forEach(piece => {
    const faction = factions.find(f => f.id === piece.faction);
    if (faction) board.appendChild(createPieceElement(piece, faction));
  });

  // Conflict lines SVG
  canvas.appendChild(board);
  canvas.appendChild(createConflictLinesSVG());

  return canvas;
}

function createPieceElement(piece, faction) {
  const cellSize = boardSize === 'sm' ? 60 : boardSize === 'md' ? 72.5 : 85;
  const left = piece.position.col * cellSize + cellSize / 2 - 24;
  const top = piece.position.row * cellSize + cellSize / 2 - 24;
  const momentumIcon = piece.momentum === 'rising' ? '▲' : piece.momentum === 'falling' ? '▼' : '■';

  return h('div', {
    class: `chess-piece ${selectedPiece === piece.id ? 'chess-piece--selected' : ''}`,
    style: { left: `${left}px`, top: `${top}px`, background: faction.color, borderColor: selectedPiece === piece.id ? 'var(--accent-primary)' : faction.color },
    dataset: { pieceId: piece.id },
    draggable: 'true',
    onclick: (e) => { e.stopPropagation(); selectPiece(piece.id); },
    ondragstart: (e) => handleDragStart(e, piece),
    ondragend: handleDragEnd,
  },
    h('div', { class: 'chess-piece__avatar' }, getPieceSymbol(piece.type)),
    h('span', { class: `chess-piece__momentum momentum-${piece.momentum}` }, momentumIcon),
    h('span', { class: 'chess-piece__name' }, piece.name),
  );
}

function createConflictLinesSVG() {
  const svg = createSVGElement('svg', { class: 'conflict-lines', style: 'position:absolute;inset:0;pointer-events:none;z-index:5;' });
  const cellSize = boardSize === 'sm' ? 60 : boardSize === 'md' ? 72.5 : 85;

  conflictLines.forEach(line => {
    const from = pieces.find(p => p.id === line.from);
    const to = pieces.find(p => p.id === line.to);
    if (!from || !to) return;
    svg.appendChild(createSVGElement('line', {
      x1: String(from.position.col * cellSize + cellSize / 2),
      y1: String(from.position.row * cellSize + cellSize / 2),
      x2: String(to.position.col * cellSize + cellSize / 2),
      y2: String(to.position.row * cellSize + cellSize / 2),
      class: `conflict-line conflict-line--${line.type}`,
    }));
  });

  svg.setAttribute('width', String(cellSize * 8));
  svg.setAttribute('height', String(cellSize * 8));
  svg.style.position = 'absolute';
  svg.style.top = '50%';
  svg.style.left = '50%';
  svg.style.transform = 'translate(-50%, -50%)';
  return svg;
}


// ─── Render: Intel Panel ─────────────────────────────────────────────────────

function renderIntelPanel() {
  const panel = h('div', { class: 'conflict-board__intel', id: 'intel-panel' });

  if (!selectedPiece) {
    panel.append(
      h('div', { class: 'intel-section' },
        h('div', { class: 'intel-section__title' }, '🧠 AI STRATEGIC ANALYSIS'),
        ...aiSuggestions.map(s => h('div', { class: 'ai-suggestion' }, h('span', { class: 'ai-suggestion__icon' }, s.icon), ' ', s.text))
      ),
      h('div', { class: 'intel-section' },
        h('div', { class: 'intel-section__title' }, '📊 BOARD STATISTICS'),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Active Factions'), h('div', { class: 'intel-card__value' }, String(factions.length))),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Active Pieces'), h('div', { class: 'intel-card__value' }, String(pieces.length))),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Active Conflicts'), h('div', { class: 'intel-card__value' }, String(conflictLines.filter(l => l.type === 'opposition').length))),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Alliances'), h('div', { class: 'intel-card__value' }, String(conflictLines.filter(l => l.type === 'alliance').length))),
      ),
      renderObjectiveProgress()
    );
  } else {
    renderPieceIntel(panel);
  }

  return panel;
}

function renderObjectiveProgress() {
  return h('div', { class: 'intel-section' },
    h('div', { class: 'intel-section__title' }, '🎯 OBJECTIVE PROGRESS'),
    ...factions.map(f =>
      h('div', { class: 'intel-card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
          h('div', { style: { width: '8px', height: '8px', borderRadius: '50%', background: f.color } }),
          h('div', { class: 'intel-card__label' }, f.goal),
        ),
        h('div', { class: 'progress', style: { marginTop: '4px' } },
          h('div', { class: 'progress__bar', style: { width: `${f.goalProgress}%`, background: f.color } })
        ),
        h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'right' } }, `${f.goalProgress}%`)
      )
    )
  );
}

function renderPieceIntel(panel) {
  const piece = pieces.find(p => p.id === selectedPiece);
  if (!piece) return;
  const faction = factions.find(f => f.id === piece.faction);
  if (!faction) return;

  panel.append(
    h('div', { class: 'intel-section' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
        h('div', { style: { width: '32px', height: '32px', borderRadius: '50%', background: faction.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: 'white' } }, getPieceSymbol(piece.type)),
        h('div', {},
          h('div', { style: { fontWeight: '600', fontSize: '14px' } }, piece.name),
          h('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${faction.icon} ${faction.name}`),
        ),
        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '4px' } },
          h('button', { class: 'btn btn--ghost btn--sm', onclick: () => openEditPieceModal(piece) }, '✏️ Edit'),
          h('button', { class: 'btn btn--ghost btn--sm', style: { color: 'var(--danger)' }, onclick: () => removePiece(piece) }, '🗑️'),
        ),
      ),
    ),
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, 'OBJECTIVES'),
      h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Public Goal'), h('div', { class: 'intel-card__value' }, piece.goal || '—')),
      piece.hiddenGoal ? h('div', { class: 'intel-card', style: { borderColor: 'rgba(168,85,247,0.3)' } }, h('div', { class: 'intel-card__label', style: { color: 'var(--faction-purple)' } }, '🤫 Hidden Goal'), h('div', { class: 'intel-card__value' }, piece.hiddenGoal)) : null,
    ),
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, 'RESOURCES'),
      ...Object.entries(piece.resources).map(([key, value]) =>
        h('div', { class: 'intel-card' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
            h('span', { class: 'intel-card__label' }, key.charAt(0).toUpperCase() + key.slice(1)),
            h('span', { style: { fontSize: '12px', fontWeight: '600' } }, `${value}%`),
          ),
          h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${value}%`, background: value > 70 ? 'var(--success)' : value > 40 ? 'var(--warning)' : 'var(--danger)' } })),
        )
      )
    ),
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, 'STATUS'),
      h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Momentum'), h('div', { class: `intel-card__value momentum-${piece.momentum}` }, `${piece.momentum === 'rising' ? '▲' : piece.momentum === 'falling' ? '▼' : '■'} ${piece.momentum.charAt(0).toUpperCase() + piece.momentum.slice(1)}`)),
    ),
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, '🧠 AI RECOMMENDATION'),
      h('div', { class: 'ai-suggestion' }, getAIRecommendation(piece)),
    )
  );
}

function getAIRecommendation(piece) {
  const recs = {
    'p1': 'Aurelian\'s hidden objective conflicts with public Dominion goals. Consider introducing an internal faction that discovers this truth.',
    'p2': 'Fleet Admiral Koss is purely military-focused. A political crisis could force them to choose between loyalty and survival.',
    'p3': 'Senator Vex has rising momentum and high political power. Positioned for a betrayal arc.',
    'p4': 'AXIOM Prime lacks political influence. Consider an arc where they attempt to gain legitimacy.',
    'p5': 'Unit-7\'s infiltration goal could create an unexpected knowledge-sharing alliance with Dr. Voss.',
    'p6': 'The Overmind has no allies. A potential wild card—consider having it approach a weakened faction.',
    'p7': 'Captain Sera is falling. They need a victory or revelation to regain momentum.',
    'p8': 'Dr. Orin Voss has high knowledge but low everything else. Vulnerable to manipulation.',
  };
  return recs[piece.id] || `${piece.name} is in a ${piece.momentum} position. Analyze their relationships and resource balance to identify the next logical narrative move.`;
}


// ─── Render: Timeline Slider ─────────────────────────────────────────────────

function renderTimelineSlider() {
  return h('div', { class: 'conflict-board__timeline' },
    h('span', { class: 'timeline-label' }, '⏪ Story Start'),
    h('input', { class: 'timeline-slider', type: 'range', min: '0', max: '100', value: '50', oninput: (e) => { const l = document.getElementById('timeline-position'); if (l) l.textContent = `Position: ${e.target.value}%`; } }),
    h('span', { class: 'timeline-label' }, 'Current ▶'),
    h('span', { class: 'timeline-label', id: 'timeline-position', style: { color: 'var(--accent-primary)' } }, 'Position: 50%'),
  );
}

// ─── Interaction Handlers ────────────────────────────────────────────────────

function selectPiece(pieceId) {
  selectedPiece = selectedPiece === pieceId ? null : pieceId;
  document.querySelectorAll('.chess-piece').forEach(el => {
    el.classList.toggle('chess-piece--selected', el.dataset.pieceId === selectedPiece);
  });
  const intelPanel = document.querySelector('.conflict-board__intel');
  if (intelPanel) {
    const newPanel = renderIntelPanel();
    intelPanel.parentNode.replaceChild(newPanel, intelPanel);
  }
}

function selectFaction(factionId) {
  document.querySelectorAll('.faction-card').forEach(card => card.classList.remove('faction-card--selected'));
}

function handleDragStart(e, piece) {
  dragState = piece;
  e.target.classList.add('chess-piece--dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.target.classList.remove('chess-piece--dragging');
  dragState = null;
}

function handleDrop(e, row, col) {
  e.preventDefault();
  if (!dragState) return;
  const piece = pieces.find(p => p.id === dragState.id);
  if (piece) {
    piece.position = { row, col };
    rerenderBoard();
    triggerSave();
  }
}

function toggleHeatmap() {
  document.querySelectorAll('.chessboard__cell').forEach(cell => {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const nearby = conflictLines.filter(line => {
      const fp = pieces.find(p => p.id === line.from);
      const tp = pieces.find(p => p.id === line.to);
      if (!fp || !tp) return false;
      const mr = (fp.position.row + tp.position.row) / 2;
      const mc = (fp.position.col + tp.position.col) / 2;
      return Math.abs(mr - row) < 2 && Math.abs(mc - col) < 2;
    });
    cell.classList.remove('chessboard__cell--heatmap-low', 'chessboard__cell--heatmap-med', 'chessboard__cell--heatmap-high');
    if (nearby.length > 2) cell.classList.add('chessboard__cell--heatmap-high');
    else if (nearby.length > 0) cell.classList.add('chessboard__cell--heatmap-med');
  });
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function updateBoardSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const boards = [
    { id: 'global', name: 'Global Strategic Board', icon: '♟️' },
    { id: 'dominion', name: 'Dominion Internal', icon: '🦅' },
    { id: 'colonial', name: 'Colonial Resistance', icon: '🌟' },
  ];
  boards.forEach(b => sidebar.appendChild(h('div', { class: `sidebar-item ${b.id === 'global' ? 'sidebar-item--active' : ''}` }, h('span', { class: 'sidebar-item__icon' }, b.icon), h('span', { class: 'sidebar-item__label' }, b.name))));

  sidebar.appendChild(h('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' } }));
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Pieces'));

  pieces.forEach(piece => {
    const faction = factions.find(f => f.id === piece.faction);
    if (!faction) return;
    sidebar.appendChild(h('div', { class: 'sidebar-item', onclick: () => selectPiece(piece.id) },
      h('span', { class: 'sidebar-item__icon', style: { color: faction.color } }, getPieceSymbol(piece.type)),
      h('span', { class: 'sidebar-item__label' }, piece.name),
      h('span', { class: `sidebar-item__count momentum-${piece.momentum}` }, piece.momentum === 'rising' ? '▲' : piece.momentum === 'falling' ? '▼' : '■'),
    ));
  });
}
