/**
 * LoreForge Planner - Freeform Brainstorm
 * Write freely, tag content, then push sections to other modules.
 * 
 * Features:
 *   - Topic tags for grouping/filtering sessions
 *   - Content tags for pushing to modules (@character, #location, etc.)
 */

import { h } from '../core/renderer.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

// ─── Data ────────────────────────────────────────────────────────────────────

let sessions = [];
let activeSessionId = null;
let activeTopicFilter = null; // null = show all, string = filter by topic

function loadSessions() {
  sessions = loadData('brainstormSessions', []);
  // Migrate: ensure all sessions have a topics array
  sessions.forEach(s => { if (!s.topics) s.topics = []; });
  // Only reset activeSessionId if it doesn't match any session
  if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
    activeSessionId = sessions.length > 0 ? sessions[0].id : null;
  } else if (!activeSessionId && sessions.length > 0) {
    activeSessionId = sessions[0].id;
  }
}

function save() {
  saveData('brainstormSessions', sessions);
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 300);
}

// Get all unique topics across all sessions
function getAllTopics() {
  const topicSet = new Set();
  sessions.forEach(s => {
    (s.topics || []).forEach(t => topicSet.add(t));
  });
  return Array.from(topicSet).sort();
}

// Get filtered sessions based on active topic filter
function getFilteredSessions() {
  if (!activeTopicFilter) return sessions;
  return sessions.filter(s => (s.topics || []).includes(activeTopicFilter));
}

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderBrainstorm(container) {
  // Always reload sessions from localStorage to ensure we have latest data
  loadSessions();

  const wrapper = h('div', { style: { position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', display: 'flex', overflow: 'hidden' } });

  // Session list (left)
  wrapper.appendChild(renderSessionList());

  // Editor (right)
  wrapper.appendChild(renderEditor());

  container.appendChild(wrapper);
  updateBrainstormSidebar();
}

// ─── Session List ────────────────────────────────────────────────────────────

function renderSessionList() {
  const allTopics = getAllTopics();
  const filteredSessions = getFilteredSessions();

  const list = h('div', { style: { width: '260px', minWidth: '260px', borderRight: '1px solid var(--border-subtle)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
    // Header
    h('div', { style: { padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('span', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' } }, 'Sessions'),
      h('button', { class: 'btn btn--primary btn--sm', onclick: createNewSession }, '+ New'),
    ),

    // Topic filter bar
    allTopics.length > 0
      ? h('div', { style: { padding: '8px 8px 4px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '4px' } },
          h('button', {
            style: { fontSize: '10px', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--border-default)', background: !activeTopicFilter ? 'var(--accent-primary)' : 'transparent', color: !activeTopicFilter ? '#1a1510' : 'var(--text-muted)', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-ui)' },
            onclick: () => { activeTopicFilter = null; rerender(); },
          }, 'All'),
          ...allTopics.map(topic =>
            h('button', {
              style: { fontSize: '10px', padding: '2px 8px', borderRadius: '10px', border: '1px solid var(--border-default)', background: activeTopicFilter === topic ? 'var(--accent-primary)' : 'transparent', color: activeTopicFilter === topic ? '#1a1510' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-ui)' },
              onclick: () => { activeTopicFilter = topic; rerender(); },
            }, topic)
          ),
        )
      : null,

    // Session list
    h('div', { style: { flex: '1', overflowY: 'auto', padding: '4px' } },
      filteredSessions.length === 0
        ? h('div', { style: { padding: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' } },
            activeTopicFilter ? `No sessions tagged "${activeTopicFilter}"` : 'No sessions yet. Click + New to start brainstorming.'
          )
        : null,
      ...filteredSessions.map(session =>
        h('div', {
          style: { padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: session.id === activeSessionId ? 'var(--bg-active)' : 'transparent', border: session.id === activeSessionId ? '1px solid var(--border-accent)' : '1px solid transparent' },
          onclick: () => { activeSessionId = session.id; rerender(); },
        },
          h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, session.title || 'Untitled Session'),
          h('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, formatDate(session.createdAt)),
          // Topic tags on session card
          (session.topics && session.topics.length > 0)
            ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' } },
                ...session.topics.map(topic =>
                  h('span', { style: { fontSize: '9px', padding: '1px 5px', borderRadius: '6px', background: 'rgba(201,168,76,0.15)', color: 'var(--accent-primary)', fontWeight: '500' } }, topic)
                )
              )
            : null,
          session.content ? h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, session.content.slice(0, 60) + (session.content.length > 60 ? '...' : '')) : null,
        )
      ),
    ),
  );
  return list;
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function renderEditor() {
  const session = sessions.find(s => s.id === activeSessionId);

  if (!session) {
    return h('div', { style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '0', minHeight: '0' } },
      h('div', { style: { textAlign: 'center', color: 'var(--text-muted)', maxWidth: '400px' } },
        h('div', { style: { fontSize: '48px', marginBottom: '16px', opacity: '0.5' } }, '💭'),
        h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'Freeform Brainstorm'),
        h('div', { style: { fontSize: '13px', lineHeight: '1.7', marginBottom: '16px' } }, 'Write freely about your story. Use tags to mark content for specific modules:'),
        h('div', { style: { textAlign: 'left', background: 'var(--surface-2)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.8', fontFamily: 'var(--font-mono)' } },
          '@CharacterName — character notes', h('br', {}),
          '#LocationName — location notes', h('br', {}),
          '!FactionName — faction notes', h('br', {}),
          '~MysteryName — mystery notes', h('br', {}),
          '*TechName — technology notes',
        ),
        h('button', { class: 'btn btn--primary', style: { marginTop: '16px' }, onclick: createNewSession }, '+ Start Brainstorming'),
      ),
    );
  }

  return h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: '0', minHeight: '0' } },
    // Toolbar
    h('div', { style: { padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: '0' } },
      h('input', { class: 'input', value: session.title, placeholder: 'Session title...', style: { fontSize: '14px', fontWeight: '600', border: 'none', background: 'transparent', padding: '0', maxWidth: '300px' }, oninput: (e) => { session.title = e.target.value; save(); } }),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn--sm btn--primary', onclick: () => openPushModal(session) }, '📤 Push to Modules'),
        h('button', { class: 'btn btn--sm btn--ghost', style: { color: 'var(--danger)' }, onclick: () => deleteSession(session) }, '🗑️'),
      ),
    ),

    // Topic tags bar
    h('div', { style: { padding: '8px 16px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: '0' } },
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' } }, '🏷️ Topics:'),
      // Existing topics
      ...(session.topics || []).map((topic, idx) =>
        h('span', { style: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(201,168,76,0.15)', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '500' } },
          topic,
          h('span', {
            style: { cursor: 'pointer', fontSize: '10px', opacity: '0.7', marginLeft: '2px' },
            onclick: () => { session.topics.splice(idx, 1); save(); rerender(); },
          }, '✕'),
        )
      ),
      // Add topic input
      createTopicInput(session),
    ),

    // Content tag legend
    h('div', { style: { padding: '6px 16px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: '0' } },
      h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.15)', color: '#6366f1' } }, '@character'),
      h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#22c55e' } }, '#location'),
      h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444' } }, '!faction'),
      h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168,85,247,0.15)', color: '#a855f7' } }, '~mystery'),
      h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' } }, '*tech'),
    ),

    // Textarea
    h('div', { style: { flex: '1', padding: '16px', minHeight: '0', overflow: 'hidden' } },
      createTextarea(session),
    ),

    // Footer
    h('div', { style: { padding: '8px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: '0' } },
      h('span', { id: 'brainstorm-wordcount', style: { fontSize: '11px', color: 'var(--text-muted)' } }, countWords(session.content || '')),
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `Tags found: ${countTags(session.content || '')}`),
    ),
  );
}

// ─── Topic Tag Input ─────────────────────────────────────────────────────────

function createTopicInput(session) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-flex;align-items:center;position:relative;';

  const input = document.createElement('input');
  input.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;border:1px dashed var(--border-default);background:transparent;color:var(--text-secondary);width:90px;outline:none;font-family:var(--font-ui);';
  input.placeholder = '+ Add topic';

  // Show suggestions dropdown
  input.addEventListener('focus', () => showTopicSuggestions(input, session, wrapper));
  input.addEventListener('input', () => showTopicSuggestions(input, session, wrapper));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const topic = input.value.trim();
      if (topic && !(session.topics || []).includes(topic)) {
        if (!session.topics) session.topics = [];
        session.topics.push(topic);
        save();
        rerender();
      }
    }
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      removeSuggestions(wrapper);
    }
  });

  input.addEventListener('blur', () => {
    // Delay to allow click on suggestions
    setTimeout(() => removeSuggestions(wrapper), 150);
  });

  wrapper.appendChild(input);
  return wrapper;
}

function showTopicSuggestions(input, session, wrapper) {
  removeSuggestions(wrapper);

  const query = input.value.trim().toLowerCase();
  const existingTopics = session.topics || [];
  const allTopics = getAllTopics();

  // Filter: topics that exist but aren't on this session, matching query
  let suggestions = allTopics.filter(t => !existingTopics.includes(t));
  if (query) {
    suggestions = suggestions.filter(t => t.toLowerCase().includes(query));
    // Also offer to create the typed topic if it doesn't exist
    if (!allTopics.some(t => t.toLowerCase() === query) && !existingTopics.some(t => t.toLowerCase() === query)) {
      suggestions.unshift(`✨ Create "${input.value.trim()}"`);
    }
  }

  if (suggestions.length === 0) return;

  const dropdown = document.createElement('div');
  dropdown.className = 'brainstorm-topic-suggestions';
  dropdown.style.cssText = 'position:absolute;top:100%;left:0;margin-top:4px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:8px;box-shadow:var(--shadow-md);padding:4px;z-index:100;min-width:140px;max-height:160px;overflow-y:auto;';

  suggestions.slice(0, 8).forEach(suggestion => {
    const isCreate = suggestion.startsWith('✨');
    const item = document.createElement('div');
    item.style.cssText = 'padding:5px 10px;font-size:11px;border-radius:4px;cursor:pointer;color:var(--text-secondary);transition:background 0.1s;';
    item.textContent = suggestion;
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-hover)'; item.style.color = 'var(--text-primary)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; item.style.color = 'var(--text-secondary)'; });
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent blur
      const topic = isCreate ? input.value.trim() : suggestion;
      if (topic && !existingTopics.includes(topic)) {
        if (!session.topics) session.topics = [];
        session.topics.push(topic);
        save();
        rerender();
      }
    });
    dropdown.appendChild(item);
  });

  wrapper.appendChild(dropdown);
}

function removeSuggestions(wrapper) {
  const existing = wrapper.querySelector('.brainstorm-topic-suggestions');
  if (existing) existing.remove();
}

// ─── Push to Modules ─────────────────────────────────────────────────────────

function openPushModal(session) {
  const content = session.content || '';
  if (!content.trim()) { alert('Nothing to push — write some notes first.'); return; }

  // Parse tags from content
  const pushItems = parseTags(content);

  if (pushItems.length === 0) {
    alert('No tags found in your notes.\n\nUse tags like:\n@CharacterName — for characters\n#LocationName — for locations\n!FactionName — for factions\n~MysteryName — for mysteries\n*TechName — for technology');
    return;
  }

  // Build confirmation UI
  const itemStates = pushItems.map(item => ({ ...item, approved: true }));

  const modalContent = h('div', {},
    h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' } },
      `Found ${pushItems.length} tagged section(s). Review and approve what you want to push to other modules:`,
    ),
    ...itemStates.map((item, idx) =>
      h('div', { style: { padding: '12px', background: 'var(--surface-2)', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border-subtle)' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
          h('input', { type: 'checkbox', checked: true, onchange: (e) => { itemStates[idx].approved = e.target.checked; } }),
          h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: getTagColor(item.type) + '20', color: getTagColor(item.type), fontWeight: '600' } }, item.type),
          h('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, item.name),
        ),
        h('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', maxHeight: '60px', overflow: 'hidden' } }, item.text.slice(0, 200) + (item.text.length > 200 ? '...' : '')),
        h('div', { style: { marginTop: '6px' } },
          h('label', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'Push as: '),
          h('select', { class: 'input', style: { fontSize: '11px', padding: '2px 6px', width: 'auto', display: 'inline' }, onchange: (e) => { itemStates[idx].field = e.target.value; } },
            ...getFieldOptions(item.type).map(f => h('option', { value: f.value }, f.label))
          ),
        ),
      )
    ),
  );

  // Show modal
  const existing = document.querySelector('.modal-overlay'); if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, '📤 Push to Modules'), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, modalContent),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
        h('button', { class: 'btn btn--primary', onclick: () => { executePush(itemStates.filter(i => i.approved)); overlay.remove(); } }, `Push ${itemStates.filter(i => i.approved).length} Items`),
      ),
    )
  );
  document.body.appendChild(overlay);
}

function executePush(items) {
  let pushed = 0;

  items.forEach(item => {
    const field = item.field || getFieldOptions(item.type)[0]?.value || 'description';

    if (item.type === 'character') {
      const chars = loadData('characters', []);
      let char = chars.find(c => c.name.toLowerCase() === item.name.toLowerCase());
      if (!char) {
        char = { id: generateId(), name: item.name, role: '', faction: 'Independent', color: '#6366f1', momentum: 'stable', status: 'active', description: '' };
        chars.push(char);
      }
      char[field] = ((char[field] || '') + '\n\n' + item.text).trim();
      saveData('characters', chars);
      pushed++;
    }
    else if (item.type === 'location') {
      const locs = loadData('locations', []);
      let loc = locs.find(l => l.name.toLowerCase() === item.name.toLowerCase());
      if (!loc) {
        loc = { id: generateId(), name: item.name, type: 'Other', region: '', faction: '', population: 'Unknown', status: 'active', description: '', climate: 'Unknown', resources: 'Unknown', strategicValue: 50, color: '#6366f1' };
        locs.push(loc);
      }
      loc[field] = ((loc[field] || '') + '\n\n' + item.text).trim();
      saveData('locations', locs);
      pushed++;
    }
    else if (item.type === 'faction') {
      const facs = loadData('factionData', []);
      let fac = facs.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      if (!fac) {
        fac = { id: generateId(), name: item.name, color: '#6366f1', icon: '⚔️', goal: '', type: 'Alliance', leader: '', territory: '', population: 'Unknown', militaryStrength: 50, politicalPower: 50, economicPower: 50, status: 'active', description: '' };
        facs.push(fac);
      }
      fac[field] = ((fac[field] || '') + '\n\n' + item.text).trim();
      saveData('factionData', facs);
      pushed++;
    }
    else if (item.type === 'mystery') {
      const mysteries = loadData('mysteries', []);
      let mys = mysteries.find(m => (m.title || '').toLowerCase() === item.name.toLowerCase());
      if (!mys) {
        mys = { id: generateId(), title: item.name, question: '', truth: '', status: 'active', importance: 'moderate', progress: 0, clues: 0, redHerrings: 0 };
        mysteries.push(mys);
      }
      mys[field] = ((mys[field] || '') + '\n\n' + item.text).trim();
      saveData('mysteries', mysteries);
      pushed++;
    }
    else if (item.type === 'technology') {
      const techs = loadData('technologies', []);
      let tech = techs.find(t => t.name.toLowerCase() === item.name.toLowerCase());
      if (!tech) {
        tech = { id: generateId(), name: item.name, era: 'Era 1', category: 'General', inventor: '', faction: '', prerequisites: [], dependents: [], status: 'theoretical', description: '', impact: 'Unknown', year: 'Unknown', color: '#6366f1' };
        techs.push(tech);
      }
      tech[field] = ((tech[field] || '') + '\n\n' + item.text).trim();
      saveData('technologies', techs);
      pushed++;
    }
  });

  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 300);

  // Toast
  const toast = h('div', { style: { position: 'fixed', top: '60px', right: '20px', padding: '16px 24px', background: 'var(--bg-elevated)', border: '1px solid var(--success)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', zIndex: '9999', animation: 'slideUp 0.3s ease' } },
    h('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' } }, `✅ Pushed ${pushed} item(s) to modules`),
    h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, 'Content has been added to the relevant modules. Open them to review.'),
  );
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ─── Tag Parsing ─────────────────────────────────────────────────────────────

function parseTags(content) {
  const items = [];
  const lines = content.split('\n');
  let currentTag = null;
  let currentText = [];

  const tagPatterns = [
    { regex: /^@(\w[\w\s]*)/, type: 'character' },
    { regex: /^#(\w[\w\s]*)/, type: 'location' },
    { regex: /^!(\w[\w\s]*)/, type: 'faction' },
    { regex: /^~(\w[\w\s]*)/, type: 'mystery' },
    { regex: /^\*(\w[\w\s]*)/, type: 'technology' },
  ];

  function flushCurrent() {
    if (currentTag && currentText.length > 0) {
      const text = currentText.join('\n').trim();
      if (text) items.push({ ...currentTag, text });
    }
    currentTag = null;
    currentText = [];
  }

  lines.forEach(line => {
    const trimmed = line.trim();
    let matched = false;

    for (const pattern of tagPatterns) {
      const match = trimmed.match(pattern.regex);
      if (match) {
        flushCurrent();
        currentTag = { type: pattern.type, name: match[1].trim() };
        const rest = trimmed.slice(match[0].length).trim();
        if (rest) currentText.push(rest);
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (currentTag) {
        currentText.push(line);
      }
    }
  });

  flushCurrent();
  return items;
}

function countTags(content) {
  return parseTags(content).length;
}

function getTagColor(type) {
  const colors = { character: '#6366f1', location: '#22c55e', faction: '#ef4444', mystery: '#a855f7', technology: '#f59e0b' };
  return colors[type] || '#64748b';
}

function getFieldOptions(type) {
  switch (type) {
    case 'character': return [
      { value: 'description', label: 'Description' },
      { value: 'biography', label: 'Biography' },
      { value: 'personality', label: 'Personality' },
      { value: 'goals', label: 'Goals' },
      { value: 'needs', label: 'Needs' },
      { value: 'arc', label: 'Character Arc' },
      { value: 'secrets', label: 'Secrets' },
      { value: 'notes', label: 'Notes' },
    ];
    case 'location': return [
      { value: 'description', label: 'Description' },
      { value: 'notes', label: 'Notes' },
    ];
    case 'faction': return [
      { value: 'description', label: 'Description' },
      { value: 'goal', label: 'Strategic Goal' },
    ];
    case 'mystery': return [
      { value: 'truth', label: 'Truth' },
      { value: 'question', label: 'Central Question' },
    ];
    case 'technology': return [
      { value: 'description', label: 'Description' },
    ];
    default: return [{ value: 'description', label: 'Description' }];
  }
}

// ─── Textarea Helper ─────────────────────────────────────────────────────────

function createTextarea(session) {
  const textarea = document.createElement('textarea');
  textarea.style.cssText = 'width:100%;height:100%;background:var(--surface-2);border:1px solid var(--border-default);border-radius:8px;color:var(--text-primary);font-size:14px;font-family:var(--font-sans);line-height:1.8;padding:16px;resize:none;outline:none;display:block;';
  textarea.placeholder = 'Start writing freely...\n\nUse @CharacterName to tag character notes\nUse #LocationName to tag location notes\nUse !FactionName to tag faction notes';
  textarea.value = session.content || '';
  textarea.addEventListener('input', (e) => {
    session.content = e.target.value;
    save();
    updateWordCount(e.target.value);
  });
  return textarea;
}

// ─── Session CRUD ────────────────────────────────────────────────────────────

function createNewSession() {
  const session = { id: generateId(), title: `Session — ${new Date().toLocaleDateString()}`, content: '', topics: [], createdAt: Date.now() };
  sessions.unshift(session);
  activeSessionId = session.id;
  save();
  rerender();
}

function deleteSession(session) {
  if (!confirm(`Delete "${session.title}"?`)) return;
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx !== -1) sessions.splice(idx, 1);
  activeSessionId = sessions.length > 0 ? sessions[0].id : null;
  save();
  rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${words} words • ${text.length} chars`;
}

function updateWordCount(text) {
  const el = document.getElementById('brainstorm-wordcount');
  if (el) el.textContent = countWords(text);
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) {
    container.innerHTML = '';
    renderBrainstorm(container);
  }
}

function updateBrainstormSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Sessions'));
  sessions.forEach(session => {
    sidebar.appendChild(h('div', { class: `sidebar-item ${session.id === activeSessionId ? 'sidebar-item--active' : ''}`, onclick: () => { activeSessionId = session.id; rerender(); } },
      h('span', { class: 'sidebar-item__icon' }, '💭'),
      h('span', { class: 'sidebar-item__label' }, session.title || 'Untitled'),
    ));
  });

  sidebar.appendChild(h('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' } }));
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Tag Reference'));
  sidebar.appendChild(h('div', { class: 'sidebar-item', style: { fontSize: '11px' } }, h('span', { style: { color: '#6366f1' } }, '@'), h('span', { class: 'sidebar-item__label' }, 'Character')));
  sidebar.appendChild(h('div', { class: 'sidebar-item', style: { fontSize: '11px' } }, h('span', { style: { color: '#22c55e' } }, '#'), h('span', { class: 'sidebar-item__label' }, 'Location')));
  sidebar.appendChild(h('div', { class: 'sidebar-item', style: { fontSize: '11px' } }, h('span', { style: { color: '#ef4444' } }, '!'), h('span', { class: 'sidebar-item__label' }, 'Faction')));
  sidebar.appendChild(h('div', { class: 'sidebar-item', style: { fontSize: '11px' } }, h('span', { style: { color: '#a855f7' } }, '~'), h('span', { class: 'sidebar-item__label' }, 'Mystery')));
  sidebar.appendChild(h('div', { class: 'sidebar-item', style: { fontSize: '11px' } }, h('span', { style: { color: '#f59e0b' } }, '*'), h('span', { class: 'sidebar-item__label' }, 'Technology')));
}
