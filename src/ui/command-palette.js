/**
 * LoreForge Planner - Command Palette
 * VS Code-style palette for quick actions AND global content search.
 *
 * Improvements over the original:
 *   - Navigation commands are generated from the module registry (no drift).
 *   - Typing searches your actual data (characters, scenes, factions, …) via
 *     core/search.js, not just command names.
 *   - Accessible: role="dialog"/listbox/option, aria-selected, aria-activedescendant.
 *   - Uses the accessible promptDialog + toast instead of window.prompt.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { ObjectTypes, createObject } from '../core/objects.js';
import { MODULES } from '../core/registry.js';
import { searchContent } from '../core/search.js';
import { promptDialog, openModal } from './modal.js';
import { toastSuccess, toastInfo } from './toast.js';
import { exportProject } from './export-import.js';
import { openAISettings } from './ai-settings-panel.js';
import { openSyncSettings } from './sync-settings-panel.js';
import { syncNow } from '../core/sync/sync-init.js';
import { isSyncConfigured } from '../core/sync/sync-settings.js';
import { getInsights } from '../core/ai.js';

// Navigation commands generated from the registry.
const navCommands = MODULES.map((m) => ({
  id: `nav-${m.id}`,
  icon: m.icon,
  label: `Go to ${m.label}`,
  category: 'Navigate',
  action: () => appStore.setState({ activeModule: m.id }),
}));

// Object-creation commands (write to the IndexedDB object system).
const createCommands = [
  { type: ObjectTypes.CHARACTER, icon: '👤', label: 'Create New Character' },
  { type: ObjectTypes.FACTION, icon: '⚔️', label: 'Create New Faction' },
  { type: ObjectTypes.PLANET, icon: '🪐', label: 'Create New Planet' },
  { type: ObjectTypes.MYSTERY, icon: '🔍', label: 'Create New Mystery' },
  { type: ObjectTypes.WAR, icon: '🔥', label: 'Create New War/Conflict' },
  { type: ObjectTypes.TECHNOLOGY, icon: '⚙️', label: 'Create New Technology' },
  { type: ObjectTypes.ORGANIZATION, icon: '🏢', label: 'Create New Organization' },
  { type: ObjectTypes.EVENT, icon: '📅', label: 'Create New Event' },
].map((c) => ({
  id: `create-${c.type}`,
  icon: c.icon,
  label: c.label,
  category: 'Create',
  action: () => promptCreate(c.type),
}));

const utilityCommands = [
  { id: 'goto-dashboard', icon: '🏠', label: 'Go to Dashboard', category: 'Navigate', action: () => appStore.setState({ activeModule: 'dashboard' }) },
  { id: 'ai-settings', icon: '🧠', label: 'AI Settings (Bring Your Own Key)', category: 'Utility', action: () => openAISettings() },
  { id: 'sync-settings', icon: '☁️', label: 'Cloud Sync Settings', category: 'Utility', action: () => openSyncSettings() },
  { id: 'sync-now', icon: '🔄', label: 'Sync Now', category: 'Utility', action: () => { if (isSyncConfigured()) { syncNow(); toastInfo('Syncing…'); } else { openSyncSettings(); } } },
  { id: 'analyze', icon: '🔍', label: 'Analyze Story for Issues', category: 'Utility', action: () => runAnalysis() },
  { id: 'export', icon: '📦', label: 'Export Project', category: 'Utility', action: () => exportProject() },
  { id: 'import-panel', icon: '📥', label: 'Open Export / Import', category: 'Utility', action: () => appStore.setState({ activeModule: 'export-import' }) },
];

const commands = [...utilityCommands, ...navCommands, ...createCommands];

let selectedIndex = 0;
let currentResults = [];

export function renderCommandPalette() {
  const existing = document.querySelector('.command-palette');
  if (existing) existing.remove();

  selectedIndex = 0;
  const previouslyFocused = document.activeElement;

  const input = h('input', {
    class: 'command-palette__input',
    type: 'text',
    placeholder: 'Search your world, run a command, or create…',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'palette-results',
    'aria-autocomplete': 'list',
    oninput: (e) => { computeResults(e.target.value); renderResultsInto(); },
    onkeydown: handlePaletteKeydown,
  });

  const overlay = h('div', {
    class: 'command-palette',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Command palette',
    onclick: (e) => { if (e.target === overlay) close(); },
  },
    h('div', { class: 'command-palette__dialog' },
      h('div', { class: 'command-palette__input-wrapper' },
        h('span', { class: 'command-palette__icon' }, '🔍'),
        input,
      ),
      h('div', { class: 'command-palette__results', id: 'palette-results', role: 'listbox' }),
    )
  );

  document.body.appendChild(overlay);

  // Restore focus when the palette closes.
  overlay._restoreFocus = previouslyFocused;

  computeResults('');
  renderResultsInto();

  setTimeout(() => input.focus(), 30);
}

function close() {
  appStore.setState({ commandPaletteOpen: false });
}

/**
 * Build the result list for a query: content search hits first (when the query
 * is a real search), then matching commands.
 */
function computeResults(query) {
  const q = (query || '').trim();
  const lower = q.toLowerCase();

  const commandMatches = (q
    ? commands.filter((c) =>
        c.label.toLowerCase().includes(lower) ||
        (c.category && c.category.toLowerCase().includes(lower)))
    : commands
  ).map((c) => ({ kind: 'command', ...c }));

  const contentHits = q.length >= 2
    ? searchContent(q, 8).map((hit) => ({
        kind: 'content',
        id: `content-${hit.module}-${hit.title}`,
        icon: hit.icon,
        label: hit.title,
        sublabel: `${hit.typeLabel} · ${hit.snippet}`,
        action: () => appStore.setState({ activeModule: hit.module }),
      }))
    : [];

  // Content results lead when searching; commands fill the rest.
  currentResults = [...contentHits, ...commandMatches].slice(0, 14);
  selectedIndex = 0;
}

function renderResultsInto() {
  const results = document.getElementById('palette-results');
  if (!results) return;
  results.innerHTML = '';

  if (currentResults.length === 0) {
    results.appendChild(h('div', { class: 'command-palette__empty', style: { padding: '16px', color: 'var(--text-muted)', fontSize: '13px' } }, 'No matches found.'));
    return;
  }

  currentResults.forEach((item, i) => {
    const optionId = `palette-option-${i}`;
    results.appendChild(
      h('div', {
        class: `command-palette__item ${i === selectedIndex ? 'command-palette__item--selected' : ''}`,
        id: optionId,
        role: 'option',
        'aria-selected': i === selectedIndex ? 'true' : 'false',
        onclick: () => executeItem(item),
        onmouseenter: () => { selectedIndex = i; syncSelection(); },
      },
        h('span', { class: 'command-palette__item-icon' }, item.icon),
        h('span', { class: 'command-palette__item-label' }, item.label),
        item.sublabel
          ? h('span', { class: 'command-palette__item-sub', style: { marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.sublabel)
          : (item.shortcut ? h('span', { class: 'command-palette__item-shortcut' }, item.shortcut) : null),
      )
    );
  });

  const input = document.querySelector('.command-palette__input');
  if (input) input.setAttribute('aria-activedescendant', `palette-option-${selectedIndex}`);
}

function syncSelection() {
  const results = document.getElementById('palette-results');
  if (!results) return;
  Array.from(results.children).forEach((el, i) => {
    const sel = i === selectedIndex;
    el.classList.toggle('command-palette__item--selected', sel);
    el.setAttribute('aria-selected', sel ? 'true' : 'false');
  });
  const input = document.querySelector('.command-palette__input');
  if (input) input.setAttribute('aria-activedescendant', `palette-option-${selectedIndex}`);
  results.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function handlePaletteKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
    syncSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    syncSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentResults[selectedIndex]) executeItem(currentResults[selectedIndex]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function executeItem(item) {
  close();
  if (typeof item.action === 'function') item.action();
}

async function runAnalysis() {
  toastInfo('Analyzing your story…');
  const { insights, usedAI } = await getInsights();
  const issues = insights.filter((i) => i.kind === 'issue');
  const suggestions = insights.filter((i) => i.kind !== 'issue');

  const section = (heading, items, emptyMsg) => h('div', { style: { marginBottom: '16px' } },
    h('div', { style: { fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px' } }, heading),
    items.length
      ? h('div', {}, ...items.map((i) =>
          h('div', { style: { display: 'flex', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' } },
            h('span', {}, i.icon),
            h('div', {},
              h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, i.title),
              i.detail ? h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' } }, i.detail) : null,
            ),
          )))
      : h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, emptyMsg),
  );

  openModal({
    title: usedAI ? '🧠 AI Story Analysis' : '🔍 Story Analysis (offline)',
    content: h('div', {},
      section(`Consistency Issues (${issues.length})`, issues, 'No consistency issues found.'),
      section(`Strategic Suggestions (${suggestions.length})`, suggestions, 'No suggestions right now.'),
      !usedAI ? h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' } }, 'Tip: add an API key in AI Settings for richer, model-generated analysis.') : null,
    ),
    actions: [{ label: 'Close', variant: 'primary' }],
  });
}

async function promptCreate(type) {
  const name = await promptDialog({
    title: `Create ${type}`,
    label: 'Name',
    placeholder: `Enter a name for the new ${type}…`,
  });
  if (name) {
    createObject(type, name);
    toastSuccess(`Created ${type}: ${name}`);
  }
}
