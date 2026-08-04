/**
 * LoreForge Planner - Character & Faction Planner
 */

import { h } from '../core/renderer.js';
import { loadData, saveData } from '../core/persist.js';
import { expandableText } from '../ui/expandable-text.js';
import { appStore } from '../core/store.js';

let demoCharacters = [
  { id: 'c1', name: 'Aurelian', role: 'Supreme Commander', faction: 'The Dominion', color: '#ef4444', momentum: 'rising', status: 'active', description: 'The charismatic and ruthless leader of the Dominion. Publicly champions human survival but secretly pursues Void evolution.' },
  { id: 'c2', name: 'Fleet Admiral Koss', role: 'Military Commander', faction: 'The Dominion', color: '#ef4444', momentum: 'stable', status: 'active', description: 'A loyal military strategist torn between duty and growing doubts about Dominion methods.' },
  { id: 'c3', name: 'Senator Vex', role: 'Political Operative', faction: 'The Dominion', color: '#ef4444', momentum: 'rising', status: 'active', description: 'Master manipulator working to consolidate political power. Plans diverge from Aurelian.' },
  { id: 'c4', name: 'AXIOM Prime', role: 'AI Consciousness', faction: 'Machinae Collective', color: '#3b82f6', momentum: 'stable', status: 'active', description: 'The first synthetic consciousness seeking to prove AI sentience deserves sovereignty.' },
  { id: 'c5', name: 'Unit-7 Vanguard', role: 'Infiltration Specialist', faction: 'Machinae Collective', color: '#3b82f6', momentum: 'rising', status: 'active', description: 'A hybrid synthetic-organic entity capable of infiltrating human networks.' },
  { id: 'c6', name: 'The Overmind', role: 'Hive Intelligence', faction: 'The Swarm', color: '#22c55e', momentum: 'rising', status: 'active', description: 'A collective consciousness that absorbs and integrates all organic life it encounters.' },
  { id: 'c7', name: 'Captain Sera', role: 'Resistance Leader', faction: 'Free Colonies', color: '#f59e0b', momentum: 'falling', status: 'active', description: 'Once a Dominion officer who defected. Struggles to unite fractured colonial factions.' },
  { id: 'c8', name: 'Dr. Orin Voss', role: 'Void Researcher', faction: 'Free Colonies', color: '#f59e0b', momentum: 'stable', status: 'active', description: 'Brilliant scientist studying Void technology. His discoveries could change the war.' },
];

// Load persisted data (replaces demo data if user has saved)
const _savedChars = loadData("characters", null);
if (_savedChars) { demoCharacters.length = 0; demoCharacters.push(..._savedChars); }

export function renderCharacterPlanner(container, mode = 'characters') {
  const planner = h('div', { class: 'character-planner' },
    renderCharacterList(mode),
    demoCharacters.length > 0
      ? renderCharacterDetail(demoCharacters[0])
      : h('div', { class: 'character-detail', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: { textAlign: 'center', color: 'var(--text-muted)' } },
            h('div', { style: { fontSize: '48px', marginBottom: '16px', opacity: '0.5' } }, '👤'),
            h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'No Characters Yet'),
            h('div', { style: { fontSize: '13px', marginBottom: '16px' } }, 'Create your first character to get started.'),
            h('button', { class: 'btn btn--primary', onclick: openAddCharacterModal }, '+ New Character'),
          )
        )
  );
  container.appendChild(planner);
  updateCharacterSidebar(mode);
}


function renderCharacterList(mode) {
  const chars = mode === 'factions' 
    ? [...new Set(demoCharacters.map(c => c.faction))].map(f => ({ name: f, characters: demoCharacters.filter(c => c.faction === f) }))
    : null;
  
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('input', { class: 'input', placeholder: 'Search characters...', style: { fontSize: '12px' } }),
    ),
  );
  
  if (mode === 'factions' && chars) {
    chars.forEach(faction => {
      list.appendChild(h('div', { style: { padding: '8px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, faction.name));
      faction.characters.forEach(char => {
        list.appendChild(createCharacterCard(char));
      });
    });
  } else {
    demoCharacters.forEach(char => {
      list.appendChild(createCharacterCard(char));
    });
  }
  
  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddCharacterModal }, '+ New Character')
  ));
  
  return list;
}

function createCharacterCard(char) {
  return h('div', { 
    class: 'character-card',
    onclick: (e) => {
      if (e.target.closest('.card-actions')) return;
      document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
      e.currentTarget.classList.add('character-card--active');
      const detail = document.querySelector('.character-detail');
      if (detail) {
        detail.innerHTML = '';
        detail.appendChild(renderCharacterDetailContent(char));
      }
    }
  },
    h('div', { class: 'character-card__avatar', style: { background: char.color } }, char.name[0]),
    h('div', { class: 'character-card__info' },
      h('div', { class: 'character-card__name' }, char.name),
      h('div', { class: 'character-card__role' }, `${char.role} • ${char.faction}`),
    ),
    h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
      h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditCharacterModal(char); } }, '✏️'),
      h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteCharacter(char); } }, '🗑️'),
    ),
  );
}

function openEditCharacterModal(char) {
  const state = { name: char.name, role: char.role, faction: char.faction, description: char.description };
  const factionOptions = [...new Set(demoCharacters.map(c => c.faction)), 'Independent', 'Other'];
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    formField('Role', h('input', { class: 'input', value: state.role, oninput: (e) => state.role = e.target.value })),
    formField('Faction', h('select', { class: 'input', onchange: (e) => state.faction = e.target.value },
      ...factionOptions.map(f => h('option', { value: f, ...(f === state.faction ? { selected: 'selected' } : {}) }, f)))),
    formField('Description', expandableText({ placeholder: 'Describe this character...', value: state.description, label: 'Character Description', oninput: (e) => state.description = e.target.value })),
  );
  showModal(`Edit: ${char.name}`, content, () => {
    Object.assign(char, { name: state.name, role: state.role, faction: state.faction, description: state.description });
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderCharacterPlanner(container, 'characters'); }
    saveData("characters", demoCharacters); appStore.setState({ saveStatus: "saving" }); setTimeout(() => appStore.setState({ saveStatus: "saved" }), 300);
  });
}

function deleteCharacter(char) {
  if (!confirm(`Delete "${char.name}"?`)) return;
  const idx = demoCharacters.findIndex(c => c.id === char.id);
  if (idx !== -1) demoCharacters.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderCharacterPlanner(container, 'characters'); }
  saveData("characters", demoCharacters); appStore.setState({ saveStatus: "saving" }); setTimeout(() => appStore.setState({ saveStatus: "saved" }), 300);
}


function renderCharacterDetail(char) {
  return h('div', { class: 'character-detail' }, renderCharacterDetailContent(char));
}

function renderCharacterDetailContent(char) {
  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '50%', background: char.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700', color: 'white' } }, char.name[0]),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, char.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${char.role} • ${char.faction}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: 'tag tag--accent' }, char.status),
          h('span', { class: `tag ${char.momentum === 'rising' ? 'tag--success' : char.momentum === 'falling' ? 'tag--danger' : ''}` }, `${char.momentum === 'rising' ? '▲' : char.momentum === 'falling' ? '▼' : '■'} ${char.momentum}`),
        )
      )
    ),
    
    // Collapsible sections
    createCollapsible('Overview', true,
      h('div', {},
        h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, char.description),
      )
    ),
    createCollapsible('Strategic Position', true,
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
        createStatCard('Political', Math.floor(Math.random() * 100)),
        createStatCard('Military', Math.floor(Math.random() * 100)),
        createStatCard('Economic', Math.floor(Math.random() * 100)),
        createStatCard('Knowledge', Math.floor(Math.random() * 100)),
      )
    ),
    createCollapsible('Goals & Objectives', true,
      h('div', {},
        h('div', { class: 'intel-card', style: { marginBottom: '8px' } },
          h('div', { class: 'intel-card__label' }, 'Public Goal'),
          h('div', { class: 'intel-card__value' }, 'Control all Void Conduits'),
        ),
        h('div', { class: 'intel-card', style: { borderColor: 'rgba(168,85,247,0.3)' } },
          h('div', { class: 'intel-card__label', style: { color: 'var(--faction-purple)' } }, '🤫 Hidden Goal'),
          h('div', { class: 'intel-card__value' }, 'Reshape humanity through Void evolution'),
        ),
      )
    ),
    createCollapsible('Relationships', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Click to manage relationships...')),
    createCollapsible('Knowledge', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Track what this character knows...')),
    createCollapsible('Timeline', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Key events in this character\'s story...')),
    createCollapsible('Notes', false, h('div', {}, h('textarea', { class: 'input', placeholder: 'Add notes...', style: { minHeight: '100px' } }))),
    createCollapsible('AI Summary', false, h('div', { class: 'ai-suggestion' }, '🧠 AI analysis will appear here based on the character\'s current position, relationships, and strategic context.')),
  );
}


function createCollapsible(title, open, content) {
  const section = h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` },
    h('div', { 
      class: 'collapsible__header',
      onclick: (e) => {
        const parent = e.currentTarget.parentElement;
        parent.classList.toggle('collapsible--open');
      }
    },
      h('span', { class: 'collapsible__chevron' }, '›'),
      h('span', { class: 'collapsible__title' }, title),
    ),
    h('div', { class: 'collapsible__body' },
      h('div', { class: 'collapsible__content' }, content)
    )
  );
  return section;
}

function createStatCard(label, value) {
  const color = value > 70 ? 'var(--success)' : value > 40 ? 'var(--warning)' : 'var(--danger)';
  return h('div', { class: 'intel-card' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, label),
      h('span', { style: { fontSize: '12px', fontWeight: '600', color } }, `${value}%`),
    ),
    h('div', { class: 'progress' },
      h('div', { class: 'progress__bar', style: { width: `${value}%`, background: color } })
    ),
  );
}

function updateCharacterSidebar(mode) {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  
  const factions = [...new Set(demoCharacters.map(c => c.faction))];
  
  factions.forEach(faction => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, faction));
    
    demoCharacters.filter(c => c.faction === faction).forEach(char => {
      sidebar.appendChild(
        h('div', { class: 'sidebar-item' },
          h('span', { class: 'sidebar-item__icon', style: { width: '18px', height: '18px', borderRadius: '50%', background: char.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white' } }, char.name[0]),
          h('span', { class: 'sidebar-item__label' }, char.name),
        )
      );
    });
  });
}


function openAddCharacterModal() {
  const state = { name: '', role: '', faction: 'Independent', description: '' };
  const factionOptions = [...new Set(demoCharacters.map(c => c.faction)), 'Independent', 'Other'];
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', placeholder: 'Character name', oninput: (e) => state.name = e.target.value })),
    formField('Role', h('input', { class: 'input', placeholder: 'e.g. Military Commander', oninput: (e) => state.role = e.target.value })),
    formField('Faction', h('select', { class: 'input', onchange: (e) => state.faction = e.target.value },
      ...factionOptions.map(f => h('option', { value: f }, f)))),
    formField('Description', expandableText({ placeholder: 'Describe this character...', label: 'Character Description', oninput: (e) => state.description = e.target.value })),
  );
  showModal('Add New Character', content, () => {
    if (!state.name.trim()) return;
    demoCharacters.push({ id: `c${Date.now()}`, name: state.name, role: state.role, faction: state.faction, color: '#6366f1', momentum: 'stable', status: 'active', description: state.description });
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderCharacterPlanner(container, 'characters'); }
    saveData("characters", demoCharacters); appStore.setState({ saveStatus: "saving" }); setTimeout(() => appStore.setState({ saveStatus: "saved" }), 300);
  });
}

function formField(label, input) {
  return h('div', { style: { marginBottom: '12px' } },
    h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label),
    input
  );
}

function showModal(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, title),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕'),
      ),
      h('div', { class: 'modal__body' }, content),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
        h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save'),
      ),
    )
  );
  document.body.appendChild(overlay);
}
