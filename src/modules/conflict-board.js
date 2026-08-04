/**
 * LoreForge Planner - Strategic Conflict Board
 * The PRIMARY planning interface - a chess-inspired strategic visualization
 * Supports creating, editing, and removing factions and character pieces.
 */

import { h, createSVGElement } from '../core/renderer.js';
import { boardStore, appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import { propagateSceneOutcome } from '../core/progression.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';

// ─── Board Data (loaded from localStorage or defaults) ───────────────────────

const DEFAULT_FACTIONS = [
  { id: 'f1', name: 'The Dominion', color: '#ef4444', icon: '🦅', goal: 'Secure the Void Conduit', goalProgress: 60 },
  { id: 'f2', name: 'Machinae Collective', color: '#3b82f6', icon: '🤖', goal: 'Prevent Dominion Expansion', goalProgress: 35 },
  { id: 'f3', name: 'The Swarm', color: '#22c55e', icon: '🐛', goal: 'Assimilate the System', goalProgress: 45 },
  { id: 'f4', name: 'Free Colonies', color: '#f59e0b', icon: '🌟', goal: 'Survive the War', goalProgress: 25 },
];

const DEFAULT_PIECES = [
  { id: 'p1', name: 'Aurelian', faction: 'f1', type: 'king', role: 'antagonist', position: { row: 7, col: 3 }, momentum: 'rising', goal: 'Control all Conduits', hiddenGoal: 'Reshape humanity through Void evolution', resources: { political: 85, military: 90, economic: 75, knowledge: 60 } },
  { id: 'p2', name: 'Fleet Admiral Koss', faction: 'f1', type: 'rook', role: 'henchman', position: { row: 6, col: 1 }, momentum: 'stable', goal: 'Protect Dominion borders', hiddenGoal: '', resources: { political: 40, military: 95, economic: 50, knowledge: 30 } },
  { id: 'p3', name: 'Senator Vex', faction: 'f1', type: 'bishop', role: 'henchman', position: { row: 6, col: 5 }, momentum: 'rising', goal: 'Eliminate political opposition', hiddenGoal: '', resources: { political: 90, military: 20, economic: 80, knowledge: 70 } },
  { id: 'p4', name: 'AXIOM Prime', faction: 'f2', type: 'king', role: 'opponent', position: { row: 0, col: 4 }, momentum: 'stable', goal: 'Achieve synthetic consciousness', hiddenGoal: '', resources: { political: 30, military: 70, economic: 60, knowledge: 95 } },
  { id: 'p5', name: 'Unit-7 Vanguard', faction: 'f2', type: 'knight', role: 'opponent', position: { row: 2, col: 2 }, momentum: 'rising', goal: 'Infiltrate Dominion networks', hiddenGoal: '', resources: { political: 10, military: 80, economic: 20, knowledge: 85 } },
  { id: 'p6', name: 'The Overmind', faction: 'f3', type: 'queen', role: 'antagonist', position: { row: 1, col: 6 }, momentum: 'rising', goal: 'Consume all organic life', hiddenGoal: '', resources: { political: 5, military: 85, economic: 10, knowledge: 50 } },
  { id: 'p7', name: 'Captain Sera', faction: 'f4', type: 'knight', role: 'protagonist', position: { row: 4, col: 3 }, momentum: 'falling', goal: 'Unite the Free Colonies', hiddenGoal: '', resources: { political: 60, military: 40, economic: 30, knowledge: 45 } },
  { id: 'p8', name: 'Dr. Orin Voss', faction: 'f4', type: 'bishop', role: 'ally', position: { row: 5, col: 6 }, momentum: 'stable', goal: 'Unlock Void technology safely', hiddenGoal: '', resources: { political: 20, military: 10, economic: 40, knowledge: 90 } },
];

const DEFAULT_CONFLICT_LINES = [
  { from: 'p1', to: 'p4', type: 'opposition' },
  { from: 'p1', to: 'p6', type: 'opposition' },
  { from: 'p2', to: 'p5', type: 'opposition' },
  { from: 'p3', to: 'p7', type: 'manipulation' },
  { from: 'p4', to: 'p6', type: 'competition' },
  { from: 'p7', to: 'p8', type: 'alliance' },
  { from: 'p1', to: 'p3', type: 'alliance' },
  { from: 'p5', to: 'p8', type: 'hidden' },
];

const DEFAULT_SCENES = [
  { id: 'sc1', title: 'The Conduit Discovery', order: 1, location: 'The Breach', summary: 'Dominion scouts discover the largest Void Conduit. AXIOM Prime detects the signal simultaneously.', participants: ['p1', 'p4', 'p2'], conflictType: 'competition', outcome: 'Dominion claims territory first', powerShift: { f1: 10, f2: -5 }, status: 'completed' },
  { id: 'sc2', title: 'Senate Betrayal', order: 2, location: 'Citadel Prime', summary: 'Senator Vex maneuvers to discredit Captain Sera\'s colonial petition, cutting off diplomatic options.', participants: ['p3', 'p7'], conflictType: 'manipulation', outcome: 'Sera loses political credibility', powerShift: { f1: 5, f4: -15 }, status: 'completed' },
  { id: 'sc3', title: 'Unit-7 Infiltration', order: 3, location: 'Dominion Networks', summary: 'Unit-7 Vanguard breaches Dominion military databases. Dr. Voss receives leaked research data.', participants: ['p5', 'p2', 'p8'], conflictType: 'opposition', outcome: 'Partial success — detected but data extracted', powerShift: { f2: 10, f1: -5, f4: 5 }, status: 'completed' },
  { id: 'sc4', title: 'Swarm Assault on Obsidian', order: 4, location: 'Obsidian', summary: 'The Overmind launches a full bio-assault on Obsidian, overwhelming the mining colony in hours.', participants: ['p6', 'p2'], conflictType: 'opposition', outcome: 'Swarm victory — planet falls', powerShift: { f3: 20, f1: -10 }, status: 'completed' },
  { id: 'sc5', title: 'The Alliance Proposal', order: 5, location: 'Nexus Hub', summary: 'Captain Sera proposes a colonial-Machinae alliance against both Dominion and Swarm threats.', participants: ['p7', 'p4', 'p8'], conflictType: 'alliance', outcome: 'Pending — AXIOM deliberating', powerShift: {}, status: 'active' },
  { id: 'sc6', title: 'Void Weapon Test', order: 6, location: 'Classified', summary: 'The Dominion secretly tests a Void-powered weapon on an asteroid. The energy signature is detected galaxy-wide.', participants: ['p1', 'p2'], conflictType: 'escalation', outcome: 'Unknown', powerShift: {}, status: 'planned' },
];

// Load persisted data or use defaults (defaults only for demo project 'proj1')
// New projects start completely empty
const _isDemo = getActiveProjectId() === 'proj1';
const factions = loadData('factions', _isDemo ? DEFAULT_FACTIONS : []);
const pieces = loadData('pieces', _isDemo ? DEFAULT_PIECES : []);
const conflictLines = loadData('conflictLines', _isDemo ? DEFAULT_CONFLICT_LINES : []);
const scenes = loadData('scenes', _isDemo ? DEFAULT_SCENES : []);

const aiSuggestions = [
  { icon: '⚠️', text: 'Captain Sera currently has no meaningful opposition. Consider adding a direct antagonist or increasing pressure from the Dominion.' },
  { icon: '💥', text: 'Aurelian and AXIOM Prime plans are likely to collide at the Void Conduit. This creates a natural escalation point.' },
  { icon: '🔄', text: 'The Swarm has become too dominant in sector 7. No faction is currently defending that territory.' },
  { icon: '🗡️', text: 'Senator Vex would logically betray Aurelian once Conduit control is achieved. Their hidden objectives conflict.' },
  { icon: '🤝', text: 'Unit-7 and Dr. Orin Voss share knowledge-focused goals. An unlikely alliance could create interesting narrative tension.' },
];

const strategicLayers = ['All', 'Political', 'Military', 'Personal', 'Economic', 'Knowledge', 'Mystery'];
const PIECE_TYPES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const PIECE_ROLES = ['protagonist', 'ally', 'antagonist', 'henchman', 'opponent'];
const MOMENTUM_OPTIONS = ['rising', 'stable', 'falling'];
const FACTION_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b'];
const FACTION_ICONS = ['🦅', '🤖', '🐛', '🌟', '⚔️', '🛡️', '🔥', '🌀', '👑', '💀', '🐉', '🕷️', '🦊', '🐺', '🦁', '🏴', '⚡', '🌑', '☀️', '🎭'];

// ─── Multi-Board System ──────────────────────────────────────────────────────

const boards = [
  { id: 'global', name: 'Global Strategic Board' },
];
let activeBoardId = 'global';

let selectedPiece = null;
let dragState = null;
let boardSize = 'md';
let activeView = 'macro'; // 'macro' or 'micro'
let activeSceneId = null;

// ─── Scene Data (Micro Board) ────────────────────────────────────────────────

// (scenes already loaded above from localStorage)


// Expose pieces, scenes, and factions globally for cross-module access
window.__loreforge_pieces = pieces;
window.__loreforge_scenes = scenes;
window.__loreforge_factions = factions;

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
  const state = { name: '', faction: factions[0]?.id || '', type: 'pawn', role: 'opponent', goal: '', hiddenGoal: '', momentum: 'stable', resources: { political: 50, military: 50, economic: 50, knowledge: 50 } };

  const factionSelect = h('select', { class: 'input', onchange: (e) => state.faction = e.target.value },
    ...factions.map(f => h('option', { value: f.id }, `${f.icon} ${f.name}`))
  );

  const typeSelect = h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
    ...PIECE_TYPES.map(t => h('option', { value: t }, `${getPieceSymbol(t)} ${t.charAt(0).toUpperCase() + t.slice(1)}`))
  );

  const roleSelect = h('select', { class: 'input', onchange: (e) => state.role = e.target.value },
    ...PIECE_ROLES.map(r => h('option', { value: r }, `${getRoleIcon(r)} ${r.charAt(0).toUpperCase() + r.slice(1)}`))
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
    createFormField('Role', roleSelect),
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
      role: state.role,
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

  const roleSelect = h('select', { class: 'input', onchange: (e) => state.role = e.target.value },
    ...PIECE_ROLES.map(r => h('option', { value: r, ...(r === state.role ? { selected: 'selected' } : {}) }, `${getRoleIcon(r)} ${r.charAt(0).toUpperCase() + r.slice(1)}`))
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
    createFormField('Role', roleSelect),
    createFormField('Momentum', momentumSelect),
    createFormField('Public Goal', h('input', { class: 'input', value: state.goal, oninput: (e) => state.goal = e.target.value })),
    createFormField('Hidden Goal (optional)', h('input', { class: 'input', value: state.hiddenGoal || '', oninput: (e) => state.hiddenGoal = e.target.value })),
    createFormField('Resources', resourceSliders),
  );

  showModal(`Edit Piece: ${piece.name}`, content, () => {
    Object.assign(piece, { name: state.name, faction: state.faction, type: state.type, role: state.role, momentum: state.momentum, goal: state.goal, hiddenGoal: state.hiddenGoal, resources: state.resources });
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
  // Persist all board data to localStorage
  saveData('factions', factions);
  saveData('pieces', pieces);
  saveData('conflictLines', conflictLines);
  saveData('scenes', scenes);
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 300);
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

function getRoleIcon(role) {
  switch (role) {
    case 'protagonist': return '⭐';
    case 'ally': return '🤝';
    case 'antagonist': return '💀';
    case 'henchman': return '🗡️';
    case 'opponent': return '⚔️';
    default: return '●';
  }
}

// ─── Reset Board Positions ───────────────────────────────────────────────────
// Places pieces in opposing starting positions based on their role:
// Protagonists & Allies → bottom rows (6-7)
// Antagonists & Henchmen → top rows (0-1)
// Opponents → middle rows (2-5)

function resetBoardPositions() {
  if (!confirm('Reset all piece positions based on their roles?\n\nProtagonists & Allies → bottom (your side)\nAntagonists & Henchmen → top (opposing side)\nOpponents → middle (contested space)')) return;

  const protagonists = pieces.filter(p => p.role === 'protagonist');
  const allies = pieces.filter(p => p.role === 'ally');
  const antagonists = pieces.filter(p => p.role === 'antagonist');
  const henchmen = pieces.filter(p => p.role === 'henchman');
  const opponents = pieces.filter(p => p.role === 'opponent');

  // Place antagonists on row 0, henchmen on row 1
  antagonists.forEach((p, i) => { p.position = { row: 0, col: Math.min(i * 2 + 1, 7) }; });
  henchmen.forEach((p, i) => { p.position = { row: 1, col: Math.min(i * 2, 7) }; });

  // Place opponents in middle rows
  opponents.forEach((p, i) => {
    const row = 3 + Math.floor(i / 4);
    const col = (i % 4) * 2 + 1;
    p.position = { row: Math.min(row, 5), col: Math.min(col, 7) };
  });

  // Place allies on row 6, protagonists on row 7
  allies.forEach((p, i) => { p.position = { row: 6, col: Math.min(i * 2, 7) }; });
  protagonists.forEach((p, i) => { p.position = { row: 7, col: Math.min(i * 2 + 1, 7) }; });

  // Handle pieces with no role — put them in middle
  pieces.filter(p => !p.role).forEach((p, i) => {
    p.position = { row: 4, col: Math.min(i, 7) };
  });

  rerenderBoard();
  triggerSave();
}

// ─── New Board Modal ─────────────────────────────────────────────────────────

function openNewBoardModal() {
  const state = { name: '' };
  const content = h('div', {},
    createFormField('Board Name', h('input', { class: 'input', placeholder: 'e.g. Book 1 Board, Faction Internal, Character Arc...', oninput: (e) => state.name = e.target.value })),
    h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.6' } },
      'Boards let you view the same pieces from different strategic perspectives. ',
      'All boards share the same factions and pieces but can have independent positions.'
    ),
  );

  showModal('Create New Board', content, () => {
    if (!state.name.trim()) return;
    boards.push({ id: generateId(), name: state.name });
    activeBoardId = boards[boards.length - 1].id;
    rerenderBoard();
    triggerSave();
  });
}

// ─── Render: Main Export ─────────────────────────────────────────────────────

export function renderConflictBoard(container) {
  if (activeView === 'macro') {
    renderMacroBoard(container);
  } else {
    renderMicroBoard(container);
  }
}

function renderMacroBoard(container) {
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
        h('button', { class: `board-tab ${activeView === 'macro' ? 'board-tab--active' : ''}`, onclick: () => switchView('macro') }, '🌐 Macro (Story)'),
        h('button', { class: `board-tab ${activeView === 'micro' ? 'board-tab--active' : ''}`, onclick: () => switchView('micro') }, '🎬 Micro (Scenes)'),
      )
    ),
    h('div', { class: 'conflict-board__toolbar-center' },
      ...(activeView === 'macro' ? [
        // Board selector
        h('select', { class: 'input', style: { width: 'auto', fontSize: '11px', padding: '3px 8px' }, onchange: (e) => { activeBoardId = e.target.value; } },
          ...boards.map(b => h('option', { value: b.id, ...(b.id === activeBoardId ? { selected: 'selected' } : {}) }, b.name))
        ),
        h('button', { class: 'btn btn--sm btn--ghost', onclick: openNewBoardModal, title: 'New Board' }, '+'),
        h('span', { style: { width: '1px', height: '16px', background: 'var(--border-subtle)' } }),
        ...strategicLayers.slice(0, 4).map((layer, i) =>
          h('button', {
            class: `conflict-board__layer-btn ${i === 0 ? 'conflict-board__layer-btn--active' : ''}`,
            onclick: (e) => {
              document.querySelectorAll('.conflict-board__layer-btn').forEach(b => b.classList.remove('conflict-board__layer-btn--active'));
              e.target.classList.add('conflict-board__layer-btn--active');
            }
          }, layer)
        ),
      ] : [
        h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, `${scenes.length} scenes • ${scenes.filter(s => s.status === 'completed').length} completed`),
      ])
    ),
    h('div', { class: 'conflict-board__toolbar-left' },
      ...(activeView === 'macro' ? [
        h('button', { class: 'btn btn--sm btn--ghost', onclick: toggleHeatmap, title: 'Toggle Heatmap' }, '🔥'),
        h('button', { class: 'btn btn--sm btn--ghost', onclick: resetBoardPositions, title: 'Reset Board Positions' }, '🔄 Reset'),
        h('button', { class: 'btn btn--sm btn--primary', onclick: openAddPieceModal }, '+ Piece'),
      ] : [
        h('button', { class: 'btn btn--sm btn--primary', onclick: openAddSceneModal }, '+ Add Scene'),
      ])
    )
  );
}

function switchView(view) {
  activeView = view;
  activeSceneId = null;
  selectedPiece = null;
  rerenderBoard();
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

  // Conflict lines SVG (inside the board for proper overlay)
  board.appendChild(createConflictLinesSVG());
  canvas.appendChild(board);

  return canvas;
}

function createPieceElement(piece, faction) {
  // Use percentage-based positioning so pieces scale with the board
  const pctLeft = (piece.position.col + 0.5) / 8 * 100;
  const pctTop = (piece.position.row + 0.5) / 8 * 100;
  const momentumIcon = piece.momentum === 'rising' ? '▲' : piece.momentum === 'falling' ? '▼' : '■';

  return h('div', {
    class: `chess-piece ${selectedPiece === piece.id ? 'chess-piece--selected' : ''}`,
    style: { left: `calc(${pctLeft}% - 24px)`, top: `calc(${pctTop}% - 24px)`, background: faction.color, borderColor: selectedPiece === piece.id ? 'var(--accent-primary)' : faction.color },
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
  const svg = createSVGElement('svg', { class: 'conflict-lines', style: 'position:absolute;inset:0;pointer-events:none;z-index:5;width:100%;height:100%;' });
  svg.setAttribute('viewBox', '0 0 800 800');
  svg.setAttribute('preserveAspectRatio', 'none');

  conflictLines.forEach(line => {
    const from = pieces.find(p => p.id === line.from);
    const to = pieces.find(p => p.id === line.to);
    if (!from || !to) return;
    const x1 = (from.position.col + 0.5) / 8 * 800;
    const y1 = (from.position.row + 0.5) / 8 * 800;
    const x2 = (to.position.col + 0.5) / 8 * 800;
    const y2 = (to.position.row + 0.5) / 8 * 800;
    svg.appendChild(createSVGElement('line', {
      x1: String(x1), y1: String(y1),
      x2: String(x2), y2: String(y2),
      class: `conflict-line conflict-line--${line.type}`,
    }));
  });

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


// ═══════════════════════════════════════════════════════════════════════════════
// ─── MICRO BOARD (Scene-Level Conflict) ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function renderMicroBoard(container) {
  const board = h('div', { class: 'conflict-board' },
    renderToolbar(),
    renderSceneList(),
    renderSceneCanvas(),
    renderSceneIntel(),
    renderSceneTimeline()
  );
  container.appendChild(board);
  updateMicroSidebar();
}

// ─── Scene List (Left Panel) ─────────────────────────────────────────────────

function renderSceneList() {
  const panel = h('div', { class: 'conflict-board__factions' },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
      h('div', { class: 'intel-section__title' }, 'SCENES'),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: openAddSceneModal, title: 'Add Scene' }, '+'),
    ),
    ...scenes.map((scene, idx) =>
      h('div', {
        class: `faction-card ${activeSceneId === scene.id ? 'faction-card--selected' : ''}`,
        onclick: () => { activeSceneId = scene.id; rerenderBoard(); },
        style: { borderLeftWidth: '3px', borderLeftColor: getConflictColor(scene.conflictType) },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } },
          h('span', { style: { fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600' } }, `SCENE ${scene.order}`),
          h('span', { class: `tag tag--${scene.status === 'completed' ? 'success' : scene.status === 'active' ? 'warning' : 'accent'}`, style: { fontSize: '9px' } }, scene.status),
        ),
        h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' } }, scene.title),
        h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, `📍 ${scene.location}`),
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
          ...scene.participants.map(pid => {
            const p = pieces.find(pp => pp.id === pid);
            const f = p ? factions.find(ff => ff.id === p.faction) : null;
            return p ? h('span', { style: { fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: f ? f.color : '#666', color: 'white' } }, p.name.split(' ')[0]) : null;
          }).filter(Boolean)
        ),
        h('div', { style: { marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' } },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: getConflictColor(scene.conflictType) } }),
          h('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, scene.conflictType),
        ),
      )
    ),
    h('div', { style: { marginTop: '12px' } },
      h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddSceneModal }, '+ Add Scene'),
    ),
  );
  return panel;
}

// ─── Scene Canvas (Center) ───────────────────────────────────────────────────

function renderSceneCanvas() {
  const canvas = h('div', { class: 'conflict-board__canvas' });

  if (!activeSceneId) {
    canvas.style.display = 'flex';
    canvas.style.alignItems = 'center';
    canvas.style.justifyContent = 'center';
    canvas.appendChild(h('div', { style: { textAlign: 'center', color: 'var(--text-muted)' } },
      h('div', { style: { fontSize: '48px', marginBottom: '16px', opacity: '0.5' } }, '🎬'),
      h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'Select a Scene'),
      h('div', { style: { fontSize: '13px', maxWidth: '300px' } }, 'Click a scene from the left panel to see its dedicated conflict board.'),
    ));
    return canvas;
  }

  const scene = scenes.find(s => s.id === activeSceneId);
  if (!scene) return canvas;

  // Initialize scene positions if not set
  if (!scene.positions) {
    scene.positions = {};
    const participants = scene.participants.map(pid => pieces.find(pp => pp.id === pid)).filter(Boolean);
    // Auto-position: protagonists/allies bottom, antagonists/henchmen top, opponents middle
    const proSide = participants.filter(p => p.role === 'protagonist' || p.role === 'ally');
    const antSide = participants.filter(p => p.role === 'antagonist' || p.role === 'henchman');
    const neutral = participants.filter(p => p.role === 'opponent' || !p.role);
    proSide.forEach((p, i) => { scene.positions[p.id] = { row: 7, col: Math.min(i * 2 + 2, 7) }; });
    antSide.forEach((p, i) => { scene.positions[p.id] = { row: 0, col: Math.min(i * 2 + 2, 7) }; });
    neutral.forEach((p, i) => { scene.positions[p.id] = { row: 3 + Math.floor(i / 4), col: Math.min(i * 2 + 1, 7) }; });
  }

  // Scene header above board
  canvas.appendChild(h('div', { style: { position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', zIndex: '5' } },
    h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' } }, `Scene ${scene.order} • ${scene.location}`),
    h('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' } }, scene.title),
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px' } },
      h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: getConflictColor(scene.conflictType) } }),
      h('span', { style: { fontSize: '11px', color: getConflictColor(scene.conflictType), fontWeight: '500' } }, scene.conflictType),
      h('span', { class: `tag tag--${scene.status === 'completed' ? 'success' : scene.status === 'active' ? 'warning' : 'accent'}`, style: { fontSize: '9px', marginLeft: '6px' } }, scene.status),
    ),
  ));

  // Dedicated chessboard for this scene
  const board = h('div', { class: 'chessboard chessboard--size-md', id: 'scene-chessboard' });

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      board.appendChild(h('div', {
        class: `chessboard__cell ${isLight ? 'chessboard__cell--light' : 'chessboard__cell--dark'}`,
        dataset: { row: String(row), col: String(col) },
        ondrop: (e) => handleSceneDrop(e, scene, row, col),
        ondragover: (e) => e.preventDefault(),
      }));
    }
  }

  // Place only the participating pieces at their scene-specific positions
  scene.participants.forEach(pid => {
    const piece = pieces.find(pp => pp.id === pid);
    if (!piece) return;
    const faction = factions.find(ff => ff.id === piece.faction);
    if (!faction) return;
    const pos = scene.positions[pid] || { row: 4, col: 4 };
    const pctLeft = (pos.col + 0.5) / 8 * 100;
    const pctTop = (pos.row + 0.5) / 8 * 100;
    const momentumIcon = piece.momentum === 'rising' ? '▲' : piece.momentum === 'falling' ? '▼' : '■';

    board.appendChild(h('div', {
      class: `chess-piece ${selectedPiece === piece.id ? 'chess-piece--selected' : ''}`,
      style: { left: `calc(${pctLeft}% - 24px)`, top: `calc(${pctTop}% - 24px)`, background: faction.color, borderColor: selectedPiece === piece.id ? 'var(--accent-primary)' : faction.color },
      dataset: { pieceId: piece.id },
      draggable: 'true',
      onclick: (e) => { e.stopPropagation(); selectPiece(piece.id); },
      ondragstart: (e) => { dragState = piece; e.target.classList.add('chess-piece--dragging'); e.dataTransfer.effectAllowed = 'move'; },
      ondragend: (e) => { e.target.classList.remove('chess-piece--dragging'); dragState = null; },
    },
      h('div', { class: 'chess-piece__avatar' }, getPieceSymbol(piece.type)),
      h('span', { class: `chess-piece__momentum momentum-${piece.momentum}` }, momentumIcon),
      h('span', { class: 'chess-piece__name' }, piece.name),
    ));
  });

  // Conflict lines between participants
  const svg = createSVGElement('svg', { class: 'conflict-lines', style: 'position:absolute;inset:0;pointer-events:none;z-index:5;width:100%;height:100%;' });
  svg.setAttribute('viewBox', '0 0 800 800');
  svg.setAttribute('preserveAspectRatio', 'none');
  const sceneConflicts = conflictLines.filter(l => scene.participants.includes(l.from) && scene.participants.includes(l.to));
  sceneConflicts.forEach(line => {
    const fromPos = scene.positions[line.from];
    const toPos = scene.positions[line.to];
    if (!fromPos || !toPos) return;
    svg.appendChild(createSVGElement('line', {
      x1: String((fromPos.col + 0.5) / 8 * 800),
      y1: String((fromPos.row + 0.5) / 8 * 800),
      x2: String((toPos.col + 0.5) / 8 * 800),
      y2: String((toPos.row + 0.5) / 8 * 800),
      class: `conflict-line conflict-line--${line.type}`,
    }));
  });

  canvas.appendChild(board);
  canvas.appendChild(svg);

  // Outcome label at bottom if completed
  if (scene.outcome && scene.status === 'completed') {
    canvas.appendChild(h('div', { style: { position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', padding: '6px 16px', background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: '8px', zIndex: '5' } },
      h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600' } }, 'OUTCOME'),
      h('div', { style: { fontSize: '12px', color: 'var(--text-primary)', fontWeight: '500' } }, scene.outcome),
    ));
  }

  return canvas;
}

function handleSceneDrop(e, scene, row, col) {
  e.preventDefault();
  if (!dragState) return;
  if (!scene.positions) scene.positions = {};
  scene.positions[dragState.id] = { row, col };
  rerenderBoard();
  triggerSave();
}

// ─── Scene Intel (Right Panel) ───────────────────────────────────────────────

function renderSceneIntel() {
  const panel = h('div', { class: 'conflict-board__intel' });

  if (!activeSceneId) {
    panel.append(
      h('div', { class: 'intel-section' },
        h('div', { class: 'intel-section__title' }, '📊 SCENE OVERVIEW'),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Total Scenes'), h('div', { class: 'intel-card__value' }, String(scenes.length))),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Completed'), h('div', { class: 'intel-card__value' }, String(scenes.filter(s => s.status === 'completed').length))),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Active'), h('div', { class: 'intel-card__value' }, String(scenes.filter(s => s.status === 'active').length))),
        h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, 'Planned'), h('div', { class: 'intel-card__value' }, String(scenes.filter(s => s.status === 'planned').length))),
      ),
      h('div', { class: 'intel-section' },
        h('div', { class: 'intel-section__title' }, '⚡ CUMULATIVE POWER SHIFTS'),
        ...factions.map(f => {
          const totalShift = scenes.reduce((sum, s) => sum + (s.powerShift[f.id] || 0), 0);
          return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' } },
            h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, `${f.icon} ${f.name}`),
            h('span', { style: { fontSize: '13px', fontWeight: '700', color: totalShift > 0 ? 'var(--success)' : totalShift < 0 ? 'var(--danger)' : 'var(--text-muted)' } }, `${totalShift > 0 ? '+' : ''}${totalShift}%`),
          );
        })
      ),
      h('div', { class: 'intel-section' },
        h('div', { class: 'intel-section__title' }, '🧠 AI SCENE ANALYSIS'),
        h('div', { class: 'ai-suggestion' }, '⚠️ The Dominion has gained net +10% power. If the next scene doesn\'t introduce opposition, faction balance becomes one-sided.'),
        h('div', { class: 'ai-suggestion' }, '💡 Captain Sera\'s alliance proposal (Scene 5) could rebalance power. Resolving it before the Void Weapon test creates stronger narrative tension.'),
        h('div', { class: 'ai-suggestion' }, '🔄 No scene has focused on Personal conflict. Consider a character-driven scene to break up political/military progression.'),
      ),
    );
  } else {
    const scene = scenes.find(s => s.id === activeSceneId);
    if (scene) {
      panel.append(
        h('div', { class: 'intel-section' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
            h('div', { class: 'intel-section__title' }, 'SCENE DETAILS'),
            h('button', { class: 'btn btn--ghost btn--sm', style: { color: 'var(--danger)' }, onclick: () => removeScene(scene) }, '🗑️ Delete'),
          ),
        ),
        h('div', { class: 'intel-card', style: { marginBottom: '8px' } }, h('div', { class: 'intel-card__label' }, 'Location'), h('div', { class: 'intel-card__value' }, scene.location)),
        h('div', { class: 'intel-card', style: { marginBottom: '8px' } }, h('div', { class: 'intel-card__label' }, 'Conflict Type'), h('div', { class: 'intel-card__value', style: { color: getConflictColor(scene.conflictType) } }, scene.conflictType)),
        scene.outcome ? h('div', { class: 'intel-card', style: { marginBottom: '8px' } }, h('div', { class: 'intel-card__label' }, 'Outcome'), h('div', { class: 'intel-card__value' }, scene.outcome)) : null,
        h('div', { class: 'intel-section', style: { marginTop: '16px' } },
          h('div', { class: 'intel-section__title' }, '🧠 WHAT CHANGED'),
          h('div', { class: 'ai-suggestion' }, getSceneAnalysis(scene)),
        ),
        h('div', { class: 'intel-section' },
          h('div', { class: 'intel-section__title' }, '➡️ WHAT COMES NEXT'),
          h('div', { class: 'ai-suggestion' }, getNextSceneSuggestion(scene)),
        ),
      );
    }
  }

  return panel;
}

// ─── Scene Timeline (Bottom) ─────────────────────────────────────────────────

function renderSceneTimeline() {
  return h('div', { class: 'conflict-board__timeline', style: { gap: '8px', overflowX: 'auto' } },
    h('span', { style: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginRight: '8px' } }, 'Scene Flow:'),
    ...scenes.map((scene, i) =>
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer',
          padding: '4px 10px', borderRadius: '12px', whiteSpace: 'nowrap',
          background: activeSceneId === scene.id ? 'var(--accent-primary)' : scene.status === 'completed' ? 'var(--surface-3)' : 'var(--surface-2)',
          color: activeSceneId === scene.id ? 'white' : scene.status === 'completed' ? 'var(--text-secondary)' : 'var(--text-muted)',
          border: `1px solid ${activeSceneId === scene.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
          fontSize: '11px', fontWeight: '500',
        },
        onclick: () => { activeSceneId = scene.id; rerenderBoard(); },
      },
        h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: getConflictColor(scene.conflictType) } }),
        `${i + 1}. ${scene.title}`,
      )
    ),
  );
}

// ─── Scene Helpers ───────────────────────────────────────────────────────────

function getConflictColor(type) {
  const colors = { opposition: '#ef4444', alliance: '#3b82f6', manipulation: '#eab308', competition: '#f97316', escalation: '#a855f7', support: '#22c55e', hidden: '#6b7280' };
  return colors[type] || '#6366f1';
}

function getSceneAnalysis(scene) {
  const analyses = {
    'sc1': 'The Dominion gained territorial advantage but AXIOM Prime now knows the Conduit exists. This creates a race dynamic.',
    'sc2': 'Senator Vex successfully isolated Captain Sera politically. The Free Colonies lost their only diplomatic path.',
    'sc3': 'A double-edged outcome: Machinae gained intel but the Dominion now knows they were breached. Expect retaliation.',
    'sc4': 'Catastrophic loss for the Dominion. The Swarm proved it can overwhelm even defended positions. Military doctrine must change.',
    'sc5': 'This alliance, if formed, would create the first real counter to Dominion supremacy. High stakes.',
    'sc6': 'If successful, this changes the entire strategic calculus. No faction can oppose a Void weapon directly.',
  };
  return analyses[scene.id] || 'Analyzing scene impact on the strategic landscape...';
}

function getNextSceneSuggestion(scene) {
  const suggestions = {
    'sc1': 'Logical follow-up: AXIOM Prime dispatches Unit-7 to gather intelligence on Dominion Conduit operations.',
    'sc2': 'Captain Sera needs a win. Consider a scene where she achieves something outside political channels — perhaps a military or personal victory.',
    'sc3': 'The Dominion will respond to the breach. Fleet Admiral Koss should be tasked with hunting Unit-7.',
    'sc4': 'The galaxy reacts to Obsidian\'s fall. Political scenes showing faction responses would build tension.',
    'sc5': 'Aurelian should learn of this proposal and attempt to sabotage it — perhaps through Senator Vex.',
    'sc6': 'The weapon test detection forces every faction to respond. This should trigger multiple simultaneous scenes.',
  };
  return suggestions[scene.id] || 'Consider what each participant would logically do next based on this outcome.';
}

function removeScene(scene) {
  if (!confirm(`Delete scene "${scene.title}"?`)) return;
  const idx = scenes.findIndex(s => s.id === scene.id);
  if (idx !== -1) scenes.splice(idx, 1);
  // Re-number
  scenes.forEach((s, i) => s.order = i + 1);
  activeSceneId = null;
  rerenderBoard();
  triggerSave();
}

function openAddSceneModal() {
  const state = { title: '', location: '', summary: '', conflictType: 'opposition', participants: [], status: 'planned' };

  const participantCheckboxes = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', maxHeight: '120px', overflowY: 'auto' } },
    ...pieces.map(p => {
      const f = factions.find(ff => ff.id === p.faction);
      return h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', background: 'var(--surface-2)' } },
        h('input', { type: 'checkbox', onchange: (e) => {
          if (e.target.checked) { state.participants.push(p.id); }
          else { state.participants = state.participants.filter(id => id !== p.id); }
        }}),
        h('span', { style: { color: f ? f.color : '#666' } }, getPieceSymbol(p.type)),
        p.name,
      );
    })
  );

  const content = h('div', {},
    createFormField('Scene Title', h('input', { class: 'input', placeholder: 'e.g. The Conduit Discovery', oninput: (e) => state.title = e.target.value })),
    createFormField('Location', h('input', { class: 'input', placeholder: 'Where does this scene take place?', oninput: (e) => state.location = e.target.value })),
    createFormField('Summary', h('textarea', { class: 'input', placeholder: 'What happens in this scene?', style: { minHeight: '60px' }, oninput: (e) => state.summary = e.target.value })),
    createFormField('Conflict Type', h('select', { class: 'input', onchange: (e) => state.conflictType = e.target.value },
      ...['opposition', 'alliance', 'manipulation', 'competition', 'escalation', 'support', 'hidden'].map(t => h('option', { value: t }, t.charAt(0).toUpperCase() + t.slice(1)))
    )),
    createFormField('Status', h('select', { class: 'input', onchange: (e) => state.status = e.target.value },
      h('option', { value: 'planned' }, 'Planned'),
      h('option', { value: 'active' }, 'Active'),
      h('option', { value: 'completed' }, 'Completed'),
    )),
    createFormField('Participants', participantCheckboxes),
  );

  showModal('Add New Scene', content, () => {
    if (!state.title.trim()) return;
    scenes.push({
      id: generateId(),
      title: state.title,
      order: scenes.length + 1,
      location: state.location,
      summary: state.summary,
      participants: [...state.participants],
      conflictType: state.conflictType,
      outcome: '',
      powerShift: {},
      status: state.status,
    });
    activeSceneId = scenes[scenes.length - 1].id;
    
    // Auto-propagate if scene is completed
    const newScene = scenes[scenes.length - 1];
    if (newScene.status === 'completed' && Object.keys(newScene.powerShift).length > 0) {
      propagateSceneOutcome(newScene, pieces);
    }
    
    rerenderBoard();
    triggerSave();
  });
}

// ─── Micro Sidebar ───────────────────────────────────────────────────────────

function updateMicroSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Scene Progression'));

  scenes.forEach(scene => {
    sidebar.appendChild(h('div', {
      class: `sidebar-item ${activeSceneId === scene.id ? 'sidebar-item--active' : ''}`,
      onclick: () => { activeSceneId = scene.id; rerenderBoard(); },
    },
      h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: getConflictColor(scene.conflictType), flexShrink: '0' } }),
      h('span', { class: 'sidebar-item__label' }, `${scene.order}. ${scene.title}`),
      h('span', { class: `sidebar-item__count` }, scene.status === 'completed' ? '✓' : scene.status === 'active' ? '●' : '○'),
    ));
  });

  sidebar.appendChild(h('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' } }));
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Conflict Types Used'));

  const typeCounts = {};
  scenes.forEach(s => { typeCounts[s.conflictType] = (typeCounts[s.conflictType] || 0) + 1; });
  Object.entries(typeCounts).forEach(([type, count]) => {
    sidebar.appendChild(h('div', { class: 'sidebar-item' },
      h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: getConflictColor(type), flexShrink: '0' } }),
      h('span', { class: 'sidebar-item__label' }, type),
      h('span', { class: 'sidebar-item__count' }, String(count)),
    ));
  });
}
