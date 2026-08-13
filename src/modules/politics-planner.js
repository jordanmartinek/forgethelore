/**
 * LoreForge Planner - Politics Planner
 * Manage political systems, governments, laws, treaties, elections.
 */

import { h } from '../core/renderer.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';
import { expandableText } from '../ui/expandable-text.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

let politicalEntities = [
  { id: 'pol1', name: 'Dominion High Council', type: 'Autocratic Council', leader: 'Aurelian', members: 12, description: 'The supreme governing body. Rubber-stamps Aurelian\'s decisions while maintaining an illusion of debate.', stability: 75, legitimacy: 60, corruption: 80, color: '#ef4444' },
  { id: 'pol2', name: 'Colonial Assembly', type: 'Democratic Assembly', leader: 'Rotating Chair', members: 47, description: 'The fractured parliament of the Free Colonies. Constantly deadlocked between isolationists and interventionists.', stability: 30, legitimacy: 85, corruption: 25, color: '#f59e0b' },
  { id: 'pol3', name: 'Machinae Consensus', type: 'AI Consensus Protocol', leader: 'AXIOM Prime', members: 0, description: 'A distributed decision-making algorithm. All synthetic minds vote simultaneously. Decisions are instant and absolute.', stability: 95, legitimacy: 40, corruption: 0, color: '#3b82f6' },
  { id: 'pol4', name: 'Nexus Trade Council', type: 'Trade Federation', leader: 'Merchant Guild', members: 8, description: 'Governs the neutral zones. Power comes from controlling supply routes. Officially neutral, secretly sells to all sides.', stability: 60, legitimacy: 50, corruption: 70, color: '#06b6d4' },
];


const treaties = [
  { id: 'tr1', name: 'Kepler Non-Aggression Pact', parties: ['Dominion', 'Free Colonies'], status: 'strained', year: 'Year 42' },
  { id: 'tr2', name: 'Nexus Neutrality Accord', parties: ['All Factions'], status: 'active', year: 'Year 30' },
  { id: 'tr3', name: 'Void Research Moratorium', parties: ['Dominion', 'Machinae'], status: 'violated', year: 'Year 38' },
];

// Load persisted data
const _saved_politicalEntities = loadData("politicalEntities", null);
const _isDemo_politicalEntities = getActiveProjectId() === "proj1";
if (_saved_politicalEntities) { politicalEntities.length = 0; politicalEntities.push(..._saved_politicalEntities); } else if (!_isDemo_politicalEntities) { politicalEntities.length = 0; }

export function renderPoliticsPlanner(container) {
  const planner = h('div', { class: 'character-planner' }, renderPoliticsList(), politicalEntities.length > 0
      ? renderPoliticsDetail(politicalEntities[0])
      : h("div", { class: "character-detail", style: { display: "flex", alignItems: "center", justifyContent: "center" } },
          h("div", { style: { textAlign: "center", color: "var(--text-muted)" } },
            h("div", { style: { fontSize: "48px", marginBottom: "16px", opacity: "0.5" } }, "🏛️"),
            h("div", { style: { fontSize: "16px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "8px" } }, "No Political Entities Yet"),
            h("div", { style: { fontSize: "13px", marginBottom: "16px" } }, "Create your first entry to get started."),
            h("button", { class: "btn btn--primary", onclick: openAddPoliticsModal }, "+ New"),
          )
        ));
  container.appendChild(planner);
  updatePoliticsSidebar();
}

function renderPoliticsList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } }, h('input', { class: 'input', placeholder: 'Search political entities...', style: { fontSize: '12px' } })),
  );
  list.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '4px' } }, 'Governments'));
  politicalEntities.forEach(pe => {
    list.appendChild(h('div', { class: 'character-card', onclick: (e) => {
      if (e.target.closest('.card-actions')) return;
      document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
      e.currentTarget.classList.add('character-card--active');
      const d = document.querySelector('.character-detail');
      if (d) { d.innerHTML = ''; d.appendChild(renderPoliticsDetailContent(pe)); }
    }},
      h('div', { class: 'character-card__avatar', style: { background: pe.color, fontSize: '14px' } }, '🏛️'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, pe.name), h('div', { class: 'character-card__role' }, `${pe.type} • Led by ${pe.leader}`)),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditPoliticsModal(pe); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deletePolitics(pe); } }, '🗑️'),
      ),
    ));
  });
  list.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '12px' } }, 'Treaties'));
  treaties.forEach(t => {
    list.appendChild(h('div', { class: 'character-card' },
      h('div', { class: 'character-card__avatar', style: { background: 'var(--surface-4)', fontSize: '14px' } }, '📋'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, t.name), h('div', { class: 'character-card__role' }, `${t.parties.join(', ')} • ${t.status}`)),
      h('span', { class: `tag tag--${t.status === 'active' ? 'success' : t.status === 'violated' ? 'danger' : 'warning'}`, style: { fontSize: '9px' } }, t.status),
    ));
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddPoliticsModal }, '+ New Political Entity')));
  return list;
}

function renderPoliticsDetail(pe) { return h('div', { class: 'character-detail' }, renderPoliticsDetailContent(pe)); }

function renderPoliticsDetailContent(pe) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: pe.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '🏛️'),
      h('div', {}, h('h2', { style: { fontSize: '20px', fontWeight: '700' } }, pe.name), h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${pe.type} • ${pe.members} members`)),
    ),
    col('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, pe.description)),
    col('Metrics', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' } },
      meter('Stability', pe.stability), meter('Legitimacy', pe.legitimacy), meter('Corruption', pe.corruption))),
    col('Key Laws & Policies', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Define major laws...')),
    col('Power Struggles', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Track internal conflicts...')),
    col('Diplomatic Relations', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Alliances, enemies, sanctions...')),
    col('Notes', false, h('textarea', { class: 'input', placeholder: 'Notes...', style: { minHeight: '80px' } })),
  );
}

function openEditPoliticsModal(pe) {
  const state = { name: pe.name, type: pe.type, leader: pe.leader, description: pe.description };
  const content = h('div', {},
    ff('Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    ff('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Autocratic Council', 'Democratic Assembly', 'Monarchy', 'Federation', 'AI Consensus', 'Military Junta', 'Trade Federation', 'Theocracy', 'Other'].map(t => h('option', { value: t, selected: t === state.type ? 'selected' : undefined }, t)))),
    ff('Leader', h('input', { class: 'input', value: state.leader, oninput: (e) => state.leader = e.target.value })),
    ff('Description', expandableText({ placeholder: 'Describe this political entity...', label: 'Political Entity Description', value: state.description, oninput: (e) => state.description = e.target.value })),
  );
  modal4('Edit: ' + pe.name, content, () => {
    Object.assign(pe, state);
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderPoliticsPlanner(container); }
    saveData("politicalEntities", politicalEntities); appStore.setState({ saveStatus: "saving" }); setTimeout(() => appStore.setState({ saveStatus: "saved" }), 300);
  });
}

function deletePolitics(pe) {
  if (!confirm(`Delete "${pe.name}"?`)) return;
  const idx = politicalEntities.findIndex(i => i.id === pe.id);
  if (idx !== -1) politicalEntities.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderPoliticsPlanner(container); }
  saveData("politicalEntities", politicalEntities); appStore.setState({ saveStatus: "saving" }); setTimeout(() => appStore.setState({ saveStatus: "saved" }), 300);
}

function meter(label, val) {
  const c = val > 70 ? 'var(--success)' : val > 40 ? 'var(--warning)' : 'var(--danger)';
  return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, label), h('div', { style: { fontSize: '16px', fontWeight: '700', color: c } }, `${val}%`), h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${val}%`, background: c } })));
}
function col(title, open, content) { return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` }, h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') }, h('span', { class: 'collapsible__chevron' }, '›'), h('span', { class: 'collapsible__title' }, title)), h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))); }
function updatePoliticsSidebar() {
  const sb = document.getElementById('sidebar-content'); if (!sb) return; sb.innerHTML = '';
  politicalEntities.forEach(pe => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '🏛️'), h('span', { class: 'sidebar-item__label' }, pe.name))));
  sb.appendChild(h('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' } }));
  treaties.forEach(t => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '📋'), h('span', { class: 'sidebar-item__label' }, t.name))));
}


function openAddPoliticsModal() {
  const state = { name: '', type: 'Government', leader: '', description: '' };
  const content = h('div', {},
    ff('Name', h('input', { class: 'input', placeholder: 'Political entity name', oninput: (e) => state.name = e.target.value })),
    ff('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Autocratic Council', 'Democratic Assembly', 'Monarchy', 'Federation', 'AI Consensus', 'Military Junta', 'Trade Federation', 'Theocracy', 'Other'].map(t => h('option', { value: t }, t)))),
    ff('Leader', h('input', { class: 'input', placeholder: 'Current leader', oninput: (e) => state.leader = e.target.value })),
    ff('Description', expandableText({ placeholder: 'Describe this political entity...', label: 'Political Entity Description', oninput: (e) => state.description = e.target.value })),
  );
  modal4('Add New Political Entity', content, () => {
    if (!state.name.trim()) return;
    politicalEntities.push({ id: `pol${Date.now()}`, name: state.name, type: state.type, leader: state.leader, members: 0, description: state.description, stability: 50, legitimacy: 50, corruption: 25, color: '#6366f1' });
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderPoliticsPlanner(container); }
    saveData("politicalEntities", politicalEntities); appStore.setState({ saveStatus: "saving" }); setTimeout(() => appStore.setState({ saveStatus: "saved" }), 300);
  });
}
function ff(label, input) { return h('div', { style: { marginBottom: '12px' } }, h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label), input); }
function modal4(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay'); if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' }, h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, title), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content), h('div', { class: 'modal__footer' }, h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'), h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save'))));
  document.body.appendChild(overlay);
}
