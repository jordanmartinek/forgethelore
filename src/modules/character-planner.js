/**
 * LoreForge Planner - Character & Faction Planner
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { loadData, saveData, persistState, getActiveProjectId } from '../core/persist.js';
import { expandableText } from '../ui/expandable-text.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';
import { getBoardFactions, getFactionData } from '../core/entities.js';

// Combined faction list from both the strategic board and the faction planner,
// read live through the entity layer (replaces window.__loreforge_* globals).
function allFactionSources() {
  return [...getBoardFactions(), ...getFactionData()];
}

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
if (_savedChars) {
  demoCharacters.length = 0;
  demoCharacters.push(..._savedChars);
} else if (getActiveProjectId() === 'proj1') {
  // Demo project: persist the seed characters so the unified data layer
  // (entity graph, search) sees them without waiting for the first edit.
  // Uses saveData (not persistState) since this runs at module load.
  saveData('characters', demoCharacters);
} else {
  // New/non-demo projects start empty rather than inheriting demo characters.
  demoCharacters.length = 0;
}

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
  const factionColors = {};
  // Build faction color map from all sources
  allFactionSources().forEach(f => { factionColors[f.name] = f.color; });
  
  // Get unique factions for filter
  const allFactions = [...new Set(demoCharacters.map(c => c.faction))];
  
  const list = h('div', { class: 'character-list' },
    // Search
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search characters...', style: { fontSize: '12px', marginBottom: '6px' }, oninput: (e) => filterCharacterList(e.target.value, list) }),
    ),
    // Filter by faction
    h('div', { style: { padding: '0 12px 8px' } },
      h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 8px' }, onchange: (e) => filterCharactersByFaction(e.target.value) },
        h('option', { value: '' }, 'All Factions'),
        ...allFactions.map(f => h('option', { value: f }, f))
      ),
    ),
  );
  
  demoCharacters.forEach(char => {
    const fColor = factionColors[char.faction] || char.color || '#6366f1';
    list.appendChild(createCharacterCard(char, fColor));
  });
  
  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddCharacterModal }, '+ New Character')
  ));
  
  return list;
}

function filterCharacterList(query, list) {
  const lower = query.toLowerCase();
  list.querySelectorAll('.character-card').forEach(card => {
    const name = card.querySelector('.character-card__name')?.textContent?.toLowerCase() || '';
    const role = card.querySelector('.character-card__role')?.textContent?.toLowerCase() || '';
    card.style.display = (name.includes(lower) || role.includes(lower)) ? '' : 'none';
  });
}

function filterCharactersByFaction(faction) {
  const container = document.querySelector('.main-content');
  if (!container) return;
  container.innerHTML = '';
  
  if (!faction) {
    renderCharacterPlanner(container, 'characters');
    return;
  }
  
  // Temporarily filter and re-render
  const filtered = demoCharacters.filter(c => c.faction === faction);
  const factionColors = {};
  allFactionSources().forEach(f => { factionColors[f.name] = f.color; });
  
  const allFactions = [...new Set(demoCharacters.map(c => c.faction))];
  
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search characters...', style: { fontSize: '12px', marginBottom: '6px' } }),
    ),
    h('div', { style: { padding: '0 12px 8px' } },
      h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 8px' }, onchange: (e) => filterCharactersByFaction(e.target.value) },
        h('option', { value: '' }, 'All Factions'),
        ...allFactions.map(f => h('option', { value: f, ...(f === faction ? { selected: 'selected' } : {}) }, f))
      ),
    ),
  );
  filtered.forEach(char => {
    const fColor = factionColors[char.faction] || char.color || '#6366f1';
    list.appendChild(createCharacterCard(char, fColor));
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddCharacterModal }, '+ New Character')));
  
  const planner = h('div', { class: 'character-planner' },
    list,
    filtered.length > 0
      ? renderCharacterDetail(filtered[0])
      : h('div', { class: 'character-detail', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: { textAlign: 'center', color: 'var(--text-muted)' } },
            h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' } }, `No characters in "${faction}"`),
          ))
  );
  container.appendChild(planner);
}

function createCharacterCard(char, factionColor) {
  const color = factionColor || char.color || '#6366f1';
  return h('div', { 
    class: 'character-card',
    dataset: { faction: char.faction },
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
    h('div', { class: 'character-card__avatar', style: { background: color } }, char.name[0]),
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
  const state = { ...char };
  const factionOptions = [
    ...allFactionSources().map(f => f.name),
    ...new Set(demoCharacters.map(c => c.faction)),
    'Independent', 'Other'
  ].filter((v, i, a) => a.indexOf(v) === i);
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', value: state.name || '', oninput: (e) => state.name = e.target.value })),
    formField('Role', h('input', { class: 'input', value: state.role || '', oninput: (e) => state.role = e.target.value })),
    formField('Faction', h('select', { class: 'input', onchange: (e) => state.faction = e.target.value },
      ...factionOptions.map(f => h('option', { value: f, ...(f === state.faction ? { selected: 'selected' } : {}) }, f)))),
    formField('Archetype', h('input', { class: 'input', value: state.archetype || '', placeholder: 'e.g. The Mentor, Anti-Hero, Trickster...', oninput: (e) => state.archetype = e.target.value })),
    formField('Resource Specialty', h('input', { class: 'input', value: state.resourceSpecialty || '', placeholder: 'e.g. Military sway, Monetary wealth, Crew loyalty, Political capital...', oninput: (e) => state.resourceSpecialty = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Brief overview of this character...', value: state.description || '', label: 'Description', oninput: (e) => state.description = e.target.value })),
    formField('Biography / Backstory', expandableText({ placeholder: 'Their history before the story begins...', value: state.biography || '', label: 'Biography', oninput: (e) => state.biography = e.target.value })),
    formField('Personality', expandableText({ placeholder: 'How they act, think, and feel...', value: state.personality || '', label: 'Personality', oninput: (e) => state.personality = e.target.value })),
    formField('Traits & Strengths (comma-separated)', h('input', { class: 'input', value: state.traits || '', placeholder: 'Brave, Intelligent, Charismatic, Strategic...', oninput: (e) => state.traits = e.target.value })),
    formField('Flaws & Weaknesses (comma-separated)', h('input', { class: 'input', value: state.flaws || '', placeholder: 'Arrogant, Impulsive, Distrustful...', oninput: (e) => state.flaws = e.target.value })),
    formField('Fears', expandableText({ placeholder: 'What terrifies them? What do they avoid?', value: state.fears || '', label: 'Fears', oninput: (e) => state.fears = e.target.value })),
    formField('Goals (What They Want)', expandableText({ placeholder: 'Their conscious desire — what drives external action...', value: state.goals || '', label: 'Goals', oninput: (e) => state.goals = e.target.value })),
    formField('Needs (What They Actually Need)', expandableText({ placeholder: 'The unconscious need — what would truly fulfill them...', value: state.needs || '', label: 'Needs', oninput: (e) => state.needs = e.target.value })),
    formField('Motivations', expandableText({ placeholder: 'Why do they pursue their goals? What pushes them?', value: state.motivations || '', label: 'Motivations', oninput: (e) => state.motivations = e.target.value })),
    formField('Character Arc', expandableText({ placeholder: 'How they change from beginning to end...', value: state.arc || '', label: 'Character Arc', oninput: (e) => state.arc = e.target.value })),
    formField('Secrets', expandableText({ placeholder: 'What are they hiding? Who knows?', value: state.secrets || '', label: 'Secrets', oninput: (e) => state.secrets = e.target.value })),
    formField('Lies They Believe', expandableText({ placeholder: 'False beliefs that drive their behavior...', value: state.lies || '', label: 'Lies They Believe', oninput: (e) => state.lies = e.target.value })),
    formField('Internal Conflict', expandableText({ placeholder: 'The war within themselves...', value: state.internalConflict || '', label: 'Internal Conflict', oninput: (e) => state.internalConflict = e.target.value })),
    formField('Appearance', expandableText({ placeholder: 'Physical description, distinguishing features...', value: state.appearance || '', label: 'Appearance', oninput: (e) => state.appearance = e.target.value })),
    formField('Speech & Mannerisms', expandableText({ placeholder: 'How they talk, move, their habits...', value: state.speech || '', label: 'Speech & Mannerisms', oninput: (e) => state.speech = e.target.value })),
    formField('Skills & Abilities', expandableText({ placeholder: 'What can they do? Training, talents...', value: state.skills || '', label: 'Skills', oninput: (e) => state.skills = e.target.value })),
    formField('Relationships', expandableText({ placeholder: 'Key relationships and dynamics...', value: state.relationships || '', label: 'Relationships', oninput: (e) => state.relationships = e.target.value })),
    formField('Notes', expandableText({ placeholder: 'Any other notes...', value: state.notes || '', label: 'Notes', oninput: (e) => state.notes = e.target.value })),
  );
  showModal(`Edit: ${char.name}`, content, () => {
    Object.assign(char, state);
    const container = document.querySelector('.main-content');
    if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderCharacterPlanner(container, 'characters'); });
    persistState("characters", demoCharacters);
  });
}

async function deleteCharacter(char) {
  const ok = await confirmDialog({ title: `Delete "${char.name}"?`, message: 'This character will be permanently removed.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = demoCharacters.findIndex(c => c.id === char.id);
  if (idx !== -1) demoCharacters.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderCharacterPlanner(container, 'characters'); });
  persistState("characters", demoCharacters);
}


function renderCharacterDetail(char) {
  return h('div', { class: 'character-detail' }, renderCharacterDetailContent(char));
}

function renderCharacterDetailContent(char) {
  const factionColors = {};
  allFactionSources().forEach(f => { factionColors[f.name] = f.color; });
  const color = factionColors[char.faction] || char.color || '#6366f1';

  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700', color: 'white' } }, char.name[0]),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, char.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${char.role} • ${char.faction}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: 'tag tag--accent' }, char.status || 'active'),
          char.archetype ? h('span', { class: 'tag' }, char.archetype) : null,
          char.resourceSpecialty ? h('span', { class: 'tag tag--warning' }, `💎 ${char.resourceSpecialty}`) : null,
        )
      )
    ),

    // Core Identity
    createCollapsible('Description', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.description || 'Not yet defined.')),
    createCollapsible('Biography / Backstory', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.biography || 'Not yet defined.')),

    // Psychology
    createCollapsible('Personality', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.personality || 'Not yet defined.')),
    createCollapsible('Traits & Strengths', true,
      char.traits ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...char.traits.split(',').map(t => t.trim()).filter(Boolean).map(t => h('span', { class: 'tag tag--success' }, t)))
      : h('p', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Not yet defined.')
    ),
    createCollapsible('Flaws & Weaknesses', true,
      char.flaws ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...char.flaws.split(',').map(t => t.trim()).filter(Boolean).map(t => h('span', { class: 'tag tag--danger' }, t)))
      : h('p', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Not yet defined.')
    ),
    createCollapsible('Fears', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.fears || 'Not yet defined.')),

    // Motivation
    createCollapsible('Goals (What They Want)', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.goals || 'Not yet defined.')),
    createCollapsible('Needs (What They Actually Need)', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.needs || 'Not yet defined.')),
    createCollapsible('Motivations', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.motivations || 'Not yet defined.')),

    // Narrative
    createCollapsible('Character Arc', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.arc || 'Not yet defined.')),
    createCollapsible('Secrets', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.secrets || 'Not yet defined.')),
    createCollapsible('Lies They Believe', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.lies || 'Not yet defined.')),
    createCollapsible('Internal Conflict', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.internalConflict || 'Not yet defined.')),

    // Physical / External
    createCollapsible('Appearance', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.appearance || 'Not yet defined.')),
    createCollapsible('Speech & Mannerisms', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.speech || 'Not yet defined.')),
    createCollapsible('Skills & Abilities', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.skills || 'Not yet defined.')),

    // World
    createCollapsible('Relationships', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.relationships || 'Not yet defined.')),
    createCollapsible('Notes', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, char.notes || 'Not yet defined.')),
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
  const factionOptions = [
    ...allFactionSources().map(f => f.name),
    ...new Set(demoCharacters.map(c => c.faction)),
    'Independent', 'Other'
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate
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
    if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderCharacterPlanner(container, 'characters'); });
    persistState("characters", demoCharacters);
  });
}

// showModal / formField now come from the shared, accessible ui/modal.js
