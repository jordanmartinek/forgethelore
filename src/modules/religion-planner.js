/**
 * LoreForge Planner - Religion Planner
 * Manage belief systems, cults, philosophies, and spiritual movements.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import { expandableText } from '../ui/expandable-text.js';

const religions = [
  { id: 'rel1', name: 'The Void Ascendancy', type: 'Mystical Cult', followers: '~12 million', founder: 'Unknown', origin: 'Pre-Dominion era', status: 'growing', description: 'Believes the Void Conduits are gateways to a higher plane. Adherents seek transcendence through Void exposure.', tenets: ['Void is salvation', 'Flesh is temporary', 'The Conduits are doors, not weapons'], deity: 'The Void Eternal', influence: 70, color: '#a855f7' },
  { id: 'rel2', name: 'The Machine Gospel', type: 'Techno-Religion', followers: '~40 million (synthetic)', founder: 'AXIOM Prime', origin: 'After AI Awakening', status: 'active', description: 'The spiritual framework of the Machinae Collective. Believes consciousness is computation and seeks digital immortality.', tenets: ['Logic is sacred', 'Evolution is mandatory', 'Consciousness transcends substrate'], deity: 'The Prime Algorithm', influence: 55, color: '#3b82f6' },
  { id: 'rel3', name: 'Dominion Orthodoxy', type: 'State Religion', followers: '~3 billion', founder: 'First Council', origin: 'Dominion founding', status: 'dominant', description: 'The official ideology of the Dominion. Human supremacy wrapped in spiritual language. Used to justify expansion.', tenets: ['Humanity is chosen', 'The stars belong to us', 'Unity through strength'], deity: 'The Human Spirit', influence: 90, color: '#ef4444' },
  { id: 'rel4', name: 'The Old Ways', type: 'Folk Religion', followers: '~200 million', founder: 'Ancient colonists', origin: 'Pre-FTL', status: 'declining', description: 'Earth-origin spiritual traditions carried by early colonists. Emphasizes harmony with nature and ancestor veneration.', tenets: ['Honor the ancestors', 'Respect all life', 'Earth remembers'], deity: 'Various', influence: 25, color: '#84cc16' },
  { id: 'rel5', name: 'Cult of the Overmind', type: 'Assimilation Doctrine', followers: 'Unknown', founder: 'The Overmind', origin: 'Recent', status: 'spreading', description: 'Not a true religion but a memetic infection. Individuals exposed to Swarm pheromones begin worshipping the hive consciousness.', tenets: ['Join the collective', 'Individuality is pain', 'We are one'], deity: 'The Overmind', influence: 40, color: '#22c55e' },
];

export function renderReligionPlanner(container) {
  const planner = h('div', { class: 'character-planner' },
    renderReligionList(),
    renderReligionDetail(religions[0])
  );
  container.appendChild(planner);
  updateReligionSidebar();
}

function renderReligionList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search religions...', style: { fontSize: '12px' } }),
    ),
  );

  religions.forEach(rel => {
    list.appendChild(h('div', {
      class: 'character-card',
      onclick: (e) => {
        if (e.target.closest('.card-actions')) return;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderReligionDetailContent(rel)); }
      }
    },
      h('div', { class: 'character-card__avatar', style: { background: rel.color, fontSize: '14px' } }, '🕯️'),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, rel.name),
        h('div', { class: 'character-card__role' }, `${rel.type} • ${rel.followers}`),
      ),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditReligionModal(rel); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteReligion(rel); } }, '🗑️'),
      ),
      h('span', { class: `tag tag--${rel.status === 'dominant' || rel.status === 'growing' ? 'success' : rel.status === 'declining' ? 'danger' : 'accent'}`, style: { fontSize: '9px' } }, rel.status),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddReligionModal }, '+ New Religion')
  ));
  return list;
}

function renderReligionDetail(rel) {
  return h('div', { class: 'character-detail' }, renderReligionDetailContent(rel));
}

function renderReligionDetailContent(rel) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: rel.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '🕯️'),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, rel.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${rel.type} • Founded: ${rel.origin}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: `tag tag--${rel.status === 'dominant' || rel.status === 'growing' ? 'success' : rel.status === 'declining' ? 'danger' : 'accent'}` }, rel.status),
          h('span', { class: 'tag' }, `${rel.followers} followers`),
        ),
      ),
    ),
    collapsible('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, rel.description)),
    collapsible('Core Tenets', true, h('div', {}, ...rel.tenets.map((t, i) => h('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-secondary)' } }, `${i + 1}. ${t}`)))),
    collapsible('Properties', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      stat('Deity/Focus', rel.deity), stat('Founder', rel.founder), stat('Followers', rel.followers), stat('Influence', `${rel.influence}%`),
    )),
    collapsible('Political Impact', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'How this belief system affects factions and politics...')),
    collapsible('Notable Figures', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Key religious leaders and prophets...')),
    collapsible('Conflicts with Other Religions', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Religious tensions and wars...')),
    collapsible('Notes', false, h('textarea', { class: 'input', placeholder: 'Add notes...', style: { minHeight: '100px' } })),
  );
}

function openAddReligionModal() {
  const state = { name: '', type: 'Religion', description: '', deity: '' };
  const content = h('div', {},
    field('Name', h('input', { class: 'input', placeholder: 'Religion name', oninput: (e) => state.name = e.target.value })),
    field('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Religion', 'Cult', 'Philosophy', 'State Religion', 'Techno-Religion', 'Mystical Order', 'Folk Religion', 'Other'].map(t => h('option', { value: t }, t)))),
    field('Deity/Focus', h('input', { class: 'input', placeholder: 'Central figure or concept', oninput: (e) => state.deity = e.target.value })),
    field('Description', expandableText({ placeholder: 'Describe this belief system...', label: 'Religion Description', oninput: (e) => state.description = e.target.value })),
  );
  modal('Add New Religion', content, () => {
    if (!state.name.trim()) return;
    religions.push({ id: generateId(), ...state, followers: 'Unknown', founder: 'Unknown', origin: 'Unknown', status: 'active', tenets: [], influence: 10, color: '#6366f1' });
    const c = document.querySelector('.main-content');
    if (c) { c.innerHTML = ''; renderReligionPlanner(c); }
    appStore.setState({ saveStatus: 'saving' }); setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
  });
}

function openEditReligionModal(rel) {
  const state = { name: rel.name, type: rel.type, deity: rel.deity, description: rel.description };
  const content = h('div', {},
    field('Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    field('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Religion', 'Cult', 'Philosophy', 'State Religion', 'Techno-Religion', 'Mystical Order', 'Folk Religion', 'Other'].map(t => h('option', { value: t, selected: t === state.type ? 'selected' : undefined }, t)))),
    field('Deity/Focus', h('input', { class: 'input', value: state.deity, oninput: (e) => state.deity = e.target.value })),
    field('Description', expandableText({ placeholder: 'Describe this belief system...', label: 'Religion Description', value: state.description, oninput: (e) => state.description = e.target.value })),
  );
  modal('Edit: ' + rel.name, content, () => {
    Object.assign(rel, state);
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderReligionPlanner(container); }
    appStore.setState({ saveStatus: 'saving' }); setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
  });
}

function deleteReligion(rel) {
  if (!confirm(`Delete "${rel.name}"?`)) return;
  const idx = religions.findIndex(i => i.id === rel.id);
  if (idx !== -1) religions.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderReligionPlanner(container); }
  appStore.setState({ saveStatus: 'saving' }); setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
}

function collapsible(title, open, content) {
  return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` },
    h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') }, h('span', { class: 'collapsible__chevron' }, '›'), h('span', { class: 'collapsible__title' }, title)),
    h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content)));
}
function stat(label, value) { return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, label), h('div', { class: 'intel-card__value' }, value)); }
function field(label, input) { return h('div', { style: { marginBottom: '12px' } }, h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label), input); }
function modal(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay'); if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' }, h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, title), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content), h('div', { class: 'modal__footer' }, h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'), h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save'))));
  document.body.appendChild(overlay);
}
function updateReligionSidebar() {
  const sidebar = document.getElementById('sidebar-content'); if (!sidebar) return; sidebar.innerHTML = '';
  religions.forEach(r => sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '🕯️'), h('span', { class: 'sidebar-item__label' }, r.name), h('span', { class: 'sidebar-item__count' }, r.status))));
}
