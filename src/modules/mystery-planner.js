/**
 * LoreForge Planner - Mystery Planner
 * Investigation board style mystery tracking
 */

import { h } from '../core/renderer.js';
import { loadData, persistState, getActiveProjectId } from '../core/persist.js';
import { confirmDialog } from '../ui/modal.js';
import { expandableText } from '../ui/expandable-text.js';

let demoMysteries = [
  { id: 'm1', title: 'The Void Conduit Origin', question: 'Who created the Void Conduits and why?', truth: 'An ancient civilization built them as escape routes from a dying universe', status: 'active', importance: 'critical', progress: 30, clues: 4, redHerrings: 2 },
  { id: 'm2', title: 'Aurelian\'s True Agenda', question: 'What does Aurelian really want with the Conduits?', truth: 'He wants to merge human consciousness with Void energy', status: 'active', importance: 'major', progress: 15, clues: 2, redHerrings: 1 },
  { id: 'm3', title: 'The Swarm Intelligence', question: 'Is the Swarm truly mindless or secretly calculating?', truth: 'The Swarm is a fallen AI from the ancient civilization', status: 'active', importance: 'major', progress: 45, clues: 6, redHerrings: 3 },
  { id: 'm4', title: 'Dr. Voss\'s Discovery', question: 'What did Dr. Voss find in the Quantum Rift?', truth: 'A message from the future warning about Void evolution', status: 'developing', importance: 'moderate', progress: 60, clues: 5, redHerrings: 0 },
  { id: 'm5', title: 'The Missing Colony', question: 'What happened to Colony Theta-9?', truth: 'They willingly merged with the Swarm', status: 'unresolved', importance: 'minor', progress: 10, clues: 1, redHerrings: 2 },
];

const demoClues = [
  { id: 'cl1', mystery: 'm1', text: 'Ancient markings found on all Conduit surfaces', type: 'evidence', position: { x: 100, y: 80 } },
  { id: 'cl2', mystery: 'm1', text: 'Energy signature matches no known technology', type: 'evidence', position: { x: 300, y: 120 } },
  { id: 'cl3', mystery: 'm1', text: 'Similar structures found in 3 galaxies', type: 'evidence', position: { x: 200, y: 220 } },
  { id: 'cl4', mystery: 'm1', text: 'Dominion claims they are natural phenomena', type: 'red-herring', position: { x: 450, y: 100 } },
  { id: 'cl5', mystery: 'm1', text: 'AXIOM detects consciousness patterns within', type: 'foreshadowing', position: { x: 350, y: 280 } },
  { id: 'cl6', mystery: 'm1', text: 'The Truth', type: 'reveal', position: { x: 550, y: 200 } },
];

// Load persisted data
const _saved_mysteries = loadData("mysteries", null);
const _isDemo_mysteries = getActiveProjectId() === "proj1";
if (_saved_mysteries) { demoMysteries.length = 0; demoMysteries.push(..._saved_mysteries); } else if (!_isDemo_mysteries) { demoMysteries.length = 0; }

export function renderMysteryPlanner(container) {
  const board = h('div', { class: 'mystery-board' },
    renderMysteryList(),
    renderMysteryCanvas(),
    demoMysteries.length > 0
      ? renderMysteryDetail(demoMysteries[0])
      : h("div", { class: "character-detail", style: { display: "flex", alignItems: "center", justifyContent: "center" } },
          h("div", { style: { textAlign: "center", color: "var(--text-muted)" } },
            h("div", { style: { fontSize: "48px", marginBottom: "16px", opacity: "0.5" } }, "🔍"),
            h("div", { style: { fontSize: "16px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "8px" } }, "No Mysteries Yet"),
            h("div", { style: { fontSize: "13px", marginBottom: "16px" } }, "Create your first entry to get started."),
            h("button", { class: "btn btn--primary", onclick: openAddMysteryModal }, "+ New"),
          )
        )
  );
  container.appendChild(board);
  updateMysterySidebar();
}


function renderMysteryList() {
  return h('div', { class: 'mystery-board__list' },
    h('div', { style: { marginBottom: '12px' } },
      h('input', { class: 'input', placeholder: 'Search mysteries...', style: { fontSize: '12px' } }),
    ),
    ...demoMysteries.map(mystery => 
      h('div', { 
        class: `mystery-card ${mystery.id === 'm1' ? 'mystery-card--active' : ''}`,
        onclick: (e) => {
          if (e.target.closest('.card-actions')) return;
          document.querySelectorAll('.mystery-card').forEach(c => c.classList.remove('mystery-card--active'));
          e.currentTarget.classList.add('mystery-card--active');
        }
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          h('div', { class: 'mystery-card__title' }, `🔍 ${mystery.title}`),
          h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
            h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditMysteryModal(mystery); } }, '✏️'),
            h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteMystery(mystery); } }, '🗑️'),
          ),
          h('span', { class: `tag ${mystery.importance === 'critical' ? 'tag--danger' : mystery.importance === 'major' ? 'tag--warning' : 'tag--accent'}` }, mystery.importance),
        ),
        h('div', { class: 'mystery-card__question' }, `"${mystery.question}"`),
        h('div', { class: 'mystery-card__status', style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' } },
          h('div', { class: 'progress', style: { flex: 1 } },
            h('div', { class: 'progress__bar', style: { width: `${mystery.progress}%` } })
          ),
          h('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${mystery.progress}%`),
        ),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)' } },
          h('span', {}, `${mystery.clues} clues`),
          h('span', {}, `${mystery.redHerrings} red herrings`),
          h('span', { class: `tag tag--${mystery.status === 'active' ? 'success' : mystery.status === 'developing' ? 'accent' : 'warning'}`, style: { fontSize: '9px' } }, mystery.status),
        ),
      )
    ),
    h('div', { style: { marginTop: '12px' } },
      h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddMysteryModal }, '+ New Mystery')
    ),
  );
}

function renderMysteryCanvas() {
  const canvas = h('div', { class: 'mystery-board__canvas' });
  
  // Investigation board background
  canvas.style.background = 'var(--bg-primary)';
  canvas.style.backgroundImage = 'radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)';
  canvas.style.backgroundSize = '30px 30px';
  
  // Clue nodes
  demoClues.forEach(clue => {
    const node = h('div', { 
      class: `clue-node clue-node--${clue.type}`,
      style: { left: `${clue.position.x}px`, top: `${clue.position.y}px` },
    },
      h('span', {}, clue.type === 'red-herring' ? '🚫' : clue.type === 'reveal' ? '💡' : clue.type === 'foreshadowing' ? '👁️' : '📎'),
      ' ',
      clue.text,
    );
    canvas.appendChild(node);
  });
  
  // Connection lines SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  
  // Draw connections between clues
  for (let i = 0; i < demoClues.length - 1; i++) {
    const from = demoClues[i];
    const to = demoClues[i + 1];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(from.position.x + 50));
    line.setAttribute('y1', String(from.position.y + 15));
    line.setAttribute('x2', String(to.position.x + 50));
    line.setAttribute('y2', String(to.position.y + 15));
    line.setAttribute('stroke', 'var(--border-strong)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4 4');
    line.setAttribute('opacity', '0.5');
    svg.appendChild(line);
  }
  
  canvas.appendChild(svg);
  
  return canvas;
}


function renderMysteryDetail(mystery) {
  return h('div', { class: 'mystery-board__detail' },
    h('div', { style: { marginBottom: '16px' } },
      h('h3', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, mystery.title),
      h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' } }, `"${mystery.question}"`),
    ),
    
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, 'TRUTH (Creator Only)'),
      h('div', { class: 'intel-card', style: { background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' } },
        h('div', { class: 'intel-card__value', style: { fontSize: '12px' } }, mystery.truth),
      ),
    ),
    
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, 'STATUS'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
        h('div', { class: 'intel-card' },
          h('div', { class: 'intel-card__label' }, 'Importance'),
          h('div', { class: 'intel-card__value' }, mystery.importance),
        ),
        h('div', { class: 'intel-card' },
          h('div', { class: 'intel-card__label' }, 'Progress'),
          h('div', { class: 'intel-card__value' }, `${mystery.progress}%`),
        ),
        h('div', { class: 'intel-card' },
          h('div', { class: 'intel-card__label' }, 'Clues Planted'),
          h('div', { class: 'intel-card__value' }, String(mystery.clues)),
        ),
        h('div', { class: 'intel-card' },
          h('div', { class: 'intel-card__label' }, 'Red Herrings'),
          h('div', { class: 'intel-card__value' }, String(mystery.redHerrings)),
        ),
      ),
    ),
    
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, 'WHO KNOWS'),
      h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } },
        h('div', { style: { marginBottom: '4px' } }, '🟢 Knows Truth: No one yet'),
        h('div', { style: { marginBottom: '4px' } }, '🟡 Suspects: AXIOM Prime, Dr. Voss'),
        h('div', {}, '🔴 False Belief: Dominion (natural phenomena)'),
      ),
    ),
    
    h('div', { class: 'intel-section' },
      h('div', { class: 'intel-section__title' }, '🧠 AI WARNINGS'),
      h('div', { class: 'ai-suggestion' }, '⚠️ This mystery has been active for 3 story arcs without significant progress. Consider planting additional clues or creating a partial reveal.'),
      h('div', { class: 'ai-suggestion' }, '💡 Dr. Voss\'s research could logically lead to discovering the Conduit origin. This creates a natural reveal path.'),
    ),
  );
}

function updateMysterySidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  
  const byStatus = { active: [], developing: [], unresolved: [] };
  demoMysteries.forEach(m => {
    (byStatus[m.status] || byStatus.active).push(m);
  });
  
  Object.entries(byStatus).forEach(([status, mysteries]) => {
    if (mysteries.length === 0) return;
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, status));
    
    mysteries.forEach(m => {
      sidebar.appendChild(
        h('div', { class: 'sidebar-item' },
          h('span', { class: 'sidebar-item__icon' }, '🔍'),
          h('span', { class: 'sidebar-item__label' }, m.title),
          h('span', { class: 'sidebar-item__count' }, `${m.progress}%`),
        )
      );
    });
  });
}


function openEditMysteryModal(mystery) {
  const state = { title: mystery.title, question: mystery.question, truth: mystery.truth, importance: mystery.importance };
  const content = h('div', {},
    ff('Title', h('input', { class: 'input', value: state.title, oninput: (e) => state.title = e.target.value })),
    ff('Central Question', h('input', { class: 'input', value: state.question, oninput: (e) => state.question = e.target.value })),
    ff('Actual Truth (Creator Only)', expandableText({ placeholder: 'The real answer...', label: 'Mystery Truth', value: state.truth, oninput: (e) => state.truth = e.target.value })),
    ff('Importance', h('select', { class: 'input', onchange: (e) => state.importance = e.target.value },
      h('option', { value: 'critical', selected: state.importance === 'critical' ? 'selected' : undefined }, 'Critical'), h('option', { value: 'major', selected: state.importance === 'major' ? 'selected' : undefined }, 'Major'), h('option', { value: 'moderate', selected: state.importance === 'moderate' ? 'selected' : undefined }, 'Moderate'), h('option', { value: 'minor', selected: state.importance === 'minor' ? 'selected' : undefined }, 'Minor'))),
  );
  modal('Edit: ' + mystery.title, content, () => {
    Object.assign(mystery, state);
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderMysteryPlanner(container); }
    persistState("mysteries", demoMysteries);
  });
}

async function deleteMystery(mystery) {
  const ok = await confirmDialog({ title: `Delete "${mystery.title}"?`, message: 'This will permanently remove it.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = demoMysteries.findIndex(i => i.id === mystery.id);
  if (idx !== -1) demoMysteries.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderMysteryPlanner(container); }
  persistState("mysteries", demoMysteries);
}


function openAddMysteryModal() {
  const state = { title: '', question: '', truth: '', importance: 'moderate' };
  const content = h('div', {},
    ff('Title', h('input', { class: 'input', placeholder: 'Mystery title', oninput: (e) => state.title = e.target.value })),
    ff('Central Question', h('input', { class: 'input', placeholder: 'What is the question this mystery poses?', oninput: (e) => state.question = e.target.value })),
    ff('Actual Truth (Creator Only)', expandableText({ placeholder: 'The real answer...', label: 'Mystery Truth', oninput: (e) => state.truth = e.target.value })),
    ff('Importance', h('select', { class: 'input', onchange: (e) => state.importance = e.target.value },
      h('option', { value: 'critical' }, 'Critical'), h('option', { value: 'major' }, 'Major'), h('option', { value: 'moderate', selected: 'selected' }, 'Moderate'), h('option', { value: 'minor' }, 'Minor'))),
  );
  modal('Add New Mystery', content, () => {
    if (!state.title.trim()) return;
    demoMysteries.push({ id: `m${Date.now()}`, title: state.title, question: state.question, truth: state.truth, status: 'active', importance: state.importance, progress: 0, clues: 0, redHerrings: 0 });
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderMysteryPlanner(container); }
    persistState("mysteries", demoMysteries);
  });
}

function ff(label, input) { return h('div', { style: { marginBottom: '12px' } }, h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label), input); }
function modal(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay'); if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' }, h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, title), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content), h('div', { class: 'modal__footer' }, h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'), h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save'))));
  document.body.appendChild(overlay);
}
