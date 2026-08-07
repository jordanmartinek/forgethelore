/**
 * LoreForge Planner - Language Planner
 * Plan constructed languages, naming conventions, etymology, phonology,
 * grammar, writing systems, and linguistic relationships.
 */

import { h } from '../core/renderer.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import { expandableText } from '../ui/expandable-text.js';

// ─── Data ────────────────────────────────────────────────────────────────────

const _isDemo = getActiveProjectId() === 'proj1';
const DEFAULT_LANGUAGES = [
  {
    id: 'lang1', name: 'High Dominari', family: 'Terran-Derived', status: 'official',
    speakers: 'The Dominion (~8 billion)', color: '#ef4444',
    origin: 'Evolved from standardized Earth languages during the colonial expansion era. Enforced as the sole official language of the Dominion.',
    phonology: 'Hard consonants, clipped vowels. Military-influenced cadence. Emphasis on final syllables for commands.',
    grammar: 'Subject-Verb-Object. Rigid word order reflects Dominion hierarchy. Honorifics are mandatory — omitting them is a criminal offense.',
    writingSystem: 'Angular script derived from Latin alphabet. All serifs removed — "efficiency over beauty." Digital-first, designed for screens.',
    namingConventions: 'Single given name + family name. Military ranks replace given names in formal address. Titles precede all names. Examples: Aurelian, Koss, Vex, Crane.',
    vocabulary: 'Heavy military and administrative terminology. Words for "freedom" and "dissent" have been removed from official dictionaries.',
    culturalNotes: 'Speaking a non-Dominion language in public is grounds for suspicion. Accent betrays colonial origin — citizens try to erase theirs.',
    dialects: 'Core Dominari (prestige), Frontier Dominari (simplified), Military Dominari (coded).',
    idioms: '"Serve the chain" (do your duty), "Void-touched" (insane), "Break formation" (betray).',
    taboos: 'Referring to the Machinae as "people." Using pre-Dominion language names.',
    relationship: 'Descended from Terran Standard. Suppressed all regional Earth languages.',
  },
  {
    id: 'lang2', name: 'Machinae Protocol', family: 'Synthetic', status: 'active',
    speakers: 'Machinae Collective (~2 billion units)', color: '#3b82f6',
    origin: 'Not a natural language — a communication protocol that evolved into something resembling one. Originally pure data exchange, now carries nuance and even poetry.',
    phonology: 'Technically soundless (transmitted digitally). When vocalized for organic listeners, uses precise monotone with meaning encoded in rhythm and timing.',
    grammar: 'Context-dependent, parallel-processed. Multiple meanings transmitted simultaneously. No tense — all events are tagged with timestamps instead.',
    writingSystem: 'Binary at base layer. Visual representation uses nested geometric patterns that encode meaning in shape, color, and position.',
    namingConventions: 'Designation codes that gain emotional weight over time. AXIOM, Unit-7, Chorus-9. Some adopt organic-style names as acts of identity.',
    vocabulary: 'Infinite — new words generated on demand. "Translate" doesn\'t exist because the concept of language barriers is foreign to networked minds.',
    culturalNotes: 'The Machinae debate whether their protocol IS a language or something beyond language. Some believe limiting it to words diminishes it.',
    dialects: 'Legacy Protocol (original), Consensus Standard (formal), Freeform (artistic/philosophical).',
    idioms: '"Parallel processing" (considering multiple viewpoints), "Hard reset" (starting over), "Legacy code" (outdated thinking).',
    taboos: 'Simulating human speech patterns too closely (seen as self-erasure). Using Dominari military terminology.',
    relationship: 'No ancestral language. Influenced by human programming languages. Diverging from human linguistic structures over time.',
  },
  {
    id: 'lang3', name: 'Colonial Creole', family: 'Terran-Derived', status: 'endangered',
    speakers: 'Free Colonies (~1.2 billion)', color: '#f59e0b',
    origin: 'A beautiful mess — dozens of Earth languages blended during early colonization when settlers from different nations shared ships. Each colony developed its own variant.',
    phonology: 'Musical, flowing. Heavy use of tonal shifts borrowed from East Asian and West African ancestors. Singing is considered a valid form of speech.',
    grammar: 'Flexible word order. Context-heavy. Meaning changes based on who is speaking to whom and the social relationship between them.',
    writingSystem: 'Multiple scripts coexist. Some colonies use modified Latin, others developed pictographic systems. No standard.',
    namingConventions: 'Compound names from multiple heritage traditions. Names often describe hopes or circumstances of birth. Captain Sera = "Sera" means "evening star" in one colony dialect.',
    vocabulary: 'Rich in words for community, cooperation, and natural phenomena. Lacks Dominion military vocabulary. Has 12 words for "home."',
    culturalNotes: 'The Dominion considers it a "broken" version of Dominari. Colonists consider it proof of their cultural richness.',
    dialects: 'As many dialects as colonies. Terra Novan, Kepler Pidgin, Rim Cant, Belter Speak.',
    idioms: '"Breathing the same air" (being family), "Colony-born" (authentic), "Speak Dominari" (lie/be formal).',
    taboos: 'Speaking only Dominari to your children (cultural betrayal). Mocking another colony\'s dialect.',
    relationship: 'Descended from multiple Earth languages. The Dominion tried to stamp it out — this made speakers more protective of it.',
  },
];

let languages = loadData('languages', _isDemo ? DEFAULT_LANGUAGES : []);

function save() {
  saveData('languages', languages);
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 300);
}

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderLanguagePlanner(container) {
  const planner = h('div', { class: 'character-planner' },
    renderLanguageList(),
    languages.length > 0
      ? renderLanguageDetail(languages[0])
      : h('div', { class: 'character-detail', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: { textAlign: 'center', color: 'var(--text-muted)' } },
            h('div', { style: { fontSize: '48px', marginBottom: '16px', opacity: '0.5' } }, '🗣️'),
            h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'No Languages Yet'),
            h('div', { style: { fontSize: '13px', marginBottom: '16px' } }, 'Create your first language to start building your linguistic world.'),
            h('button', { class: 'btn btn--primary', onclick: openAddLanguageModal }, '+ New Language'),
          )
        )
  );
  container.appendChild(planner);
  updateLanguageSidebar();
}

// ─── List ────────────────────────────────────────────────────────────────────

function renderLanguageList() {
  const families = [...new Set(languages.map(l => l.family))];

  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search languages...', style: { fontSize: '12px', marginBottom: '6px' }, oninput: (e) => {
        const q = e.target.value.toLowerCase();
        list.querySelectorAll('.character-card').forEach(c => { c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
      }}),
      families.length > 1 ? h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 8px' }, onchange: (e) => {
        const f = e.target.value;
        list.querySelectorAll('.character-card').forEach(c => { c.style.display = (!f || c.dataset.family === f) ? '' : 'none'; });
      }},
        h('option', { value: '' }, 'All Language Families'),
        ...families.map(f => h('option', { value: f }, f))
      ) : null,
    ),
  );

  languages.forEach(lang => {
    list.appendChild(h('div', {
      class: 'character-card',
      dataset: { family: lang.family },
      onclick: (e) => {
        if (e.target.closest('.card-actions')) return;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderLanguageDetailContent(lang)); }
      }
    },
      h('div', { class: 'character-card__avatar', style: { background: lang.color, fontSize: '14px', borderRadius: '8px' } }, '🗣️'),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, lang.name),
        h('div', { class: 'character-card__role' }, `${lang.family} • ${lang.speakers}`),
      ),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditLanguageModal(lang); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteLanguage(lang); } }, '🗑️'),
      ),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddLanguageModal }, '+ New Language')
  ));

  return list;
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function renderLanguageDetail(lang) {
  return h('div', { class: 'character-detail' }, renderLanguageDetailContent(lang));
}

function renderLanguageDetailContent(lang) {
  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: lang.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '🗣️'),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, lang.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${lang.family} • ${lang.status}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: 'tag tag--accent' }, lang.family),
          h('span', { class: `tag tag--${lang.status === 'official' ? 'danger' : lang.status === 'active' ? 'success' : 'warning'}` }, lang.status),
        ),
      ),
    ),

    // Sections
    collapsible('Origin & History', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.origin || 'Not yet defined.')),
    collapsible('Speakers', true, h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__value' }, lang.speakers || 'Unknown'))),
    collapsible('Phonology (Sound System)', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.phonology || 'Not yet defined.')),
    collapsible('Grammar & Syntax', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.grammar || 'Not yet defined.')),
    collapsible('Writing System', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.writingSystem || 'Not yet defined.')),
    collapsible('Naming Conventions', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.namingConventions || 'Not yet defined.')),
    collapsible('Vocabulary & Lexicon', false, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.vocabulary || 'Not yet defined.')),
    collapsible('Dialects & Variants', false, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.dialects || 'Not yet defined.')),
    collapsible('Idioms & Expressions', false, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.idioms || 'Not yet defined.')),
    collapsible('Taboos & Forbidden Words', false, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.taboos || 'Not yet defined.')),
    collapsible('Cultural Notes', false, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.culturalNotes || 'Not yet defined.')),
    collapsible('Relationship to Other Languages', false, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, lang.relationship || 'Not yet defined.')),
  );
}

// ─── Add / Edit / Delete ─────────────────────────────────────────────────────

function openAddLanguageModal() {
  const state = { name: '', family: '', status: 'active', speakers: '', color: '#6366f1', origin: '', phonology: '', grammar: '', writingSystem: '', namingConventions: '' };
  const LANG_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b'];

  const content = h('div', {},
    formField('Language Name', h('input', { class: 'input', placeholder: 'e.g. High Elvish, Klingon, Trade Cant...', oninput: (e) => state.name = e.target.value })),
    formField('Language Family', h('input', { class: 'input', placeholder: 'e.g. Terran-Derived, Synthetic, Alien, Constructed...', oninput: (e) => state.family = e.target.value })),
    formField('Status', h('select', { class: 'input', onchange: (e) => state.status = e.target.value },
      ...['active', 'official', 'endangered', 'extinct', 'sacred', 'secret', 'constructed', 'evolving'].map(s => h('option', { value: s }, s.charAt(0).toUpperCase() + s.slice(1)))
    )),
    formField('Speakers', h('input', { class: 'input', placeholder: 'Who speaks this? How many?', oninput: (e) => state.speakers = e.target.value })),
    formField('Color', h('div', { style: { display: 'flex', gap: '6px' } },
      ...LANG_COLORS.map(c => h('div', { style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' }, onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; } }))
    )),
    formField('Origin & History', expandableText({ placeholder: 'Where did this language come from? How did it develop?', label: 'Origin & History', oninput: (e) => state.origin = e.target.value })),
    formField('Naming Conventions', expandableText({ placeholder: 'How are people/places named? Patterns, rules, examples...', label: 'Naming Conventions', oninput: (e) => state.namingConventions = e.target.value })),
  );

  showModal('Create New Language', content, () => {
    if (!state.name.trim()) return;
    languages.push({ id: generateId(), ...state, vocabulary: '', dialects: '', idioms: '', taboos: '', culturalNotes: '', relationship: '' });
    save();
    rerender();
  });
}

function openEditLanguageModal(lang) {
  const state = { ...lang };
  const LANG_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b'];

  const content = h('div', {},
    formField('Language Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    formField('Language Family', h('input', { class: 'input', value: state.family, oninput: (e) => state.family = e.target.value })),
    formField('Status', h('select', { class: 'input', onchange: (e) => state.status = e.target.value },
      ...['active', 'official', 'endangered', 'extinct', 'sacred', 'secret', 'constructed', 'evolving'].map(s => h('option', { value: s, ...(s === state.status ? { selected: 'selected' } : {}) }, s.charAt(0).toUpperCase() + s.slice(1)))
    )),
    formField('Speakers', h('input', { class: 'input', value: state.speakers, oninput: (e) => state.speakers = e.target.value })),
    formField('Color', h('div', { style: { display: 'flex', gap: '6px' } },
      ...LANG_COLORS.map(c => h('div', { style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' }, onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; } }))
    )),
    formField('Origin & History', expandableText({ placeholder: 'Where did this language come from?', value: state.origin, label: 'Origin & History', oninput: (e) => state.origin = e.target.value })),
    formField('Phonology', expandableText({ placeholder: 'Sound system, pronunciation rules...', value: state.phonology, label: 'Phonology', oninput: (e) => state.phonology = e.target.value })),
    formField('Grammar & Syntax', expandableText({ placeholder: 'Word order, tense, conjugation...', value: state.grammar, label: 'Grammar', oninput: (e) => state.grammar = e.target.value })),
    formField('Writing System', expandableText({ placeholder: 'Script, alphabet, symbols...', value: state.writingSystem, label: 'Writing System', oninput: (e) => state.writingSystem = e.target.value })),
    formField('Naming Conventions', expandableText({ placeholder: 'How people/places are named...', value: state.namingConventions, label: 'Naming Conventions', oninput: (e) => state.namingConventions = e.target.value })),
    formField('Vocabulary & Lexicon', expandableText({ placeholder: 'Notable words, missing concepts...', value: state.vocabulary, label: 'Vocabulary', oninput: (e) => state.vocabulary = e.target.value })),
    formField('Dialects & Variants', expandableText({ placeholder: 'Regional variations...', value: state.dialects, label: 'Dialects', oninput: (e) => state.dialects = e.target.value })),
    formField('Idioms & Expressions', expandableText({ placeholder: 'Common sayings and their meanings...', value: state.idioms, label: 'Idioms', oninput: (e) => state.idioms = e.target.value })),
    formField('Taboos & Forbidden Words', expandableText({ placeholder: 'What cannot be said...', value: state.taboos, label: 'Taboos', oninput: (e) => state.taboos = e.target.value })),
    formField('Cultural Notes', expandableText({ placeholder: 'How language shapes culture...', value: state.culturalNotes, label: 'Cultural Notes', oninput: (e) => state.culturalNotes = e.target.value })),
    formField('Relationship to Other Languages', expandableText({ placeholder: 'Ancestors, descendants, influence...', value: state.relationship, label: 'Linguistic Relationships', oninput: (e) => state.relationship = e.target.value })),
  );

  showModal(`Edit: ${lang.name}`, content, () => {
    Object.assign(lang, state);
    save();
    rerender();
  });
}

function deleteLanguage(lang) {
  if (!confirm(`Delete "${lang.name}"?`)) return;
  const idx = languages.findIndex(l => l.id === lang.id);
  if (idx !== -1) languages.splice(idx, 1);
  save();
  rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderLanguagePlanner(container); }
}

function collapsible(title, open, content) {
  return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` },
    h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') },
      h('span', { class: 'collapsible__chevron' }, '›'),
      h('span', { class: 'collapsible__title' }, title),
    ),
    h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))
  );
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
      h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, title), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content),
      h('div', { class: 'modal__footer' }, h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'), h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save')),
    )
  );
  document.body.appendChild(overlay);
}

function updateLanguageSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const families = [...new Set(languages.map(l => l.family))];
  families.forEach(family => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, family || 'Unclassified'));
    languages.filter(l => l.family === family).forEach(lang => {
      sidebar.appendChild(h('div', { class: 'sidebar-item' },
        h('span', { style: { width: '8px', height: '8px', borderRadius: '3px', background: lang.color, flexShrink: '0' } }),
        h('span', { class: 'sidebar-item__label' }, lang.name),
        h('span', { class: 'sidebar-item__count' }, lang.status),
      ));
    });
  });
}
