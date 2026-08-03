/**
 * LoreForge Planner - Command Palette
 * VS Code-style command palette for quick actions
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { ObjectTypes, ObjectIcons, createObject } from '../core/objects.js';

const commands = [
  // Navigation
  { id: 'nav-board', icon: '♟️', label: 'Go to Strategic Board', shortcut: 'Alt+1', action: () => appStore.setState({ activeModule: 'conflict-board' }) },
  { id: 'nav-world', icon: '🌌', label: 'Go to World Builder', shortcut: 'Alt+2', action: () => appStore.setState({ activeModule: 'world-builder' }) },
  { id: 'nav-chars', icon: '👤', label: 'Go to Characters', shortcut: 'Alt+3', action: () => appStore.setState({ activeModule: 'characters' }) },
  { id: 'nav-factions', icon: '⚔️', label: 'Go to Factions', shortcut: 'Alt+4', action: () => appStore.setState({ activeModule: 'factions' }) },
  { id: 'nav-mystery', icon: '🔍', label: 'Go to Mysteries', shortcut: 'Alt+5', action: () => appStore.setState({ activeModule: 'mysteries' }) },
  { id: 'nav-timeline', icon: '⏳', label: 'Go to Timeline', shortcut: 'Alt+6', action: () => appStore.setState({ activeModule: 'timeline' }) },
  { id: 'nav-tech', icon: '⚙️', label: 'Go to Technology', shortcut: 'Alt+7', action: () => appStore.setState({ activeModule: 'technology' }) },
  { id: 'nav-graph', icon: '🕸️', label: 'Go to Knowledge Graph', shortcut: 'Alt+8', action: () => appStore.setState({ activeModule: 'knowledge-graph' }) },
  { id: 'nav-analytics', icon: '📊', label: 'Go to Analytics', shortcut: 'Alt+9', action: () => appStore.setState({ activeModule: 'analytics' }) },
  
  // Create Objects
  { id: 'create-character', icon: '👤', label: 'Create New Character', category: 'Create', action: () => promptCreate(ObjectTypes.CHARACTER) },
  { id: 'create-faction', icon: '⚔️', label: 'Create New Faction', category: 'Create', action: () => promptCreate(ObjectTypes.FACTION) },
  { id: 'create-planet', icon: '🪐', label: 'Create New Planet', category: 'Create', action: () => promptCreate(ObjectTypes.PLANET) },
  { id: 'create-mystery', icon: '🔍', label: 'Create New Mystery', category: 'Create', action: () => promptCreate(ObjectTypes.MYSTERY) },
  { id: 'create-war', icon: '🔥', label: 'Create New War/Conflict', category: 'Create', action: () => promptCreate(ObjectTypes.WAR) },
  { id: 'create-tech', icon: '⚙️', label: 'Create New Technology', category: 'Create', action: () => promptCreate(ObjectTypes.TECHNOLOGY) },
  { id: 'create-org', icon: '🏢', label: 'Create New Organization', category: 'Create', action: () => promptCreate(ObjectTypes.ORGANIZATION) },
  { id: 'create-event', icon: '📅', label: 'Create New Event', category: 'Create', action: () => promptCreate(ObjectTypes.EVENT) },
  { id: 'create-secret', icon: '🤫', label: 'Create New Secret', category: 'Create', action: () => promptCreate(ObjectTypes.SECRET) },
  { id: 'create-objective', icon: '🎯', label: 'Create New Objective', category: 'Create', action: () => promptCreate(ObjectTypes.OBJECTIVE) },
  
  // Board Actions
  { id: 'board-new', icon: '♟️', label: 'Create New Board', category: 'Board', action: () => {} },
  { id: 'board-simulate', icon: '🧠', label: 'Run AI Simulation', category: 'Board', action: () => {} },
  { id: 'board-heatmap', icon: '🔥', label: 'Toggle Heatmap', category: 'Board', action: () => {} },
  
  // Utility
  { id: 'snapshot', icon: '📸', label: 'Create Snapshot', category: 'Utility', action: () => {} },
  { id: 'export', icon: '📦', label: 'Export Project', category: 'Utility', action: () => {} },
];

let selectedIndex = 0;
let filteredCommands = [...commands];

export function renderCommandPalette() {
  // Remove existing
  const existing = document.querySelector('.command-palette');
  if (existing) existing.remove();
  
  selectedIndex = 0;
  filteredCommands = [...commands];
  
  const overlay = h('div', { 
    class: 'command-palette',
    onclick: (e) => {
      if (e.target === overlay) {
        appStore.setState({ commandPaletteOpen: false });
      }
    }
  },
    h('div', { class: 'command-palette__dialog' },
      h('div', { class: 'command-palette__input-wrapper' },
        h('span', { class: 'command-palette__icon' }, '🔍'),
        h('input', { 
          class: 'command-palette__input',
          type: 'text',
          placeholder: 'Search commands, objects, or create new...',
          autofocus: true,
          oninput: (e) => filterCommands(e.target.value),
          onkeydown: handlePaletteKeydown,
        })
      ),
      h('div', { class: 'command-palette__results', id: 'palette-results' },
        ...renderResults()
      )
    )
  );
  
  document.body.appendChild(overlay);
  
  // Focus input
  setTimeout(() => {
    overlay.querySelector('input')?.focus();
  }, 50);
}

function renderResults() {
  return filteredCommands.slice(0, 12).map((cmd, i) => 
    h('div', {
      class: `command-palette__item ${i === selectedIndex ? 'command-palette__item--selected' : ''}`,
      onclick: () => executeCommand(cmd),
    },
      h('span', { class: 'command-palette__item-icon' }, cmd.icon),
      h('span', { class: 'command-palette__item-label' }, cmd.label),
      cmd.shortcut ? h('span', { class: 'command-palette__item-shortcut' }, cmd.shortcut) : null
    )
  );
}

function filterCommands(query) {
  const lower = query.toLowerCase();
  filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(lower) ||
    (cmd.category && cmd.category.toLowerCase().includes(lower))
  );
  selectedIndex = 0;
  updateResults();
}

function updateResults() {
  const results = document.getElementById('palette-results');
  if (!results) return;
  results.innerHTML = '';
  renderResults().forEach(el => { if (el) results.appendChild(el); });
}

function handlePaletteKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
    updateResults();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filteredCommands[selectedIndex]) {
      executeCommand(filteredCommands[selectedIndex]);
    }
  }
}

function executeCommand(cmd) {
  appStore.setState({ commandPaletteOpen: false });
  cmd.action();
}

function promptCreate(type) {
  const name = prompt(`Enter name for new ${type}:`);
  if (name) {
    createObject(type, name);
    // TODO: Show toast notification
  }
}
