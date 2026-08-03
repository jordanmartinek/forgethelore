/**
 * LoreForge Planner - Application Shell
 * Main layout with activity bar, sidebar, top bar, and content area
 */

import { h, render } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { ObjectIcons } from '../core/objects.js';
import { renderConflictBoard } from '../modules/conflict-board.js';
import { renderWorldBuilder } from '../modules/world-builder.js';
import { renderCharacterPlanner } from '../modules/character-planner.js';
import { renderMysteryPlanner } from '../modules/mystery-planner.js';
import { renderTimeline } from '../modules/timeline.js';
import { renderKnowledgeGraph } from '../modules/knowledge-graph.js';
import { renderAnalytics } from '../modules/analytics.js';
import { renderLocationPlanner } from '../modules/location-planner.js';
import { renderReligionPlanner } from '../modules/religion-planner.js';
import { renderPoliticsPlanner } from '../modules/politics-planner.js';
import { renderOrganizationPlanner } from '../modules/organization-planner.js';
import { renderSpeciesPlanner } from '../modules/species-planner.js';
import { renderTechnologyPlanner } from '../modules/technology-planner.js';
import { renderMilitaryPlanner } from '../modules/military-planner.js';
import { renderCommandPalette } from './command-palette.js';

// Module definitions
const modules = [
  { id: 'conflict-board', icon: '♟️', label: 'Strategic Board', category: 'core' },
  { id: 'world-builder', icon: '🌌', label: 'World Builder', category: 'core' },
  { id: 'characters', icon: '👤', label: 'Characters', category: 'planning' },
  { id: 'factions', icon: '⚔️', label: 'Factions', category: 'planning' },
  { id: 'locations', icon: '📍', label: 'Locations', category: 'planning' },
  { id: 'species', icon: '🧬', label: 'Species', category: 'planning' },
  { id: 'organizations', icon: '🏢', label: 'Organizations', category: 'planning' },
  { id: 'religions', icon: '🕯️', label: 'Religions', category: 'planning' },
  { id: 'politics', icon: '🏛️', label: 'Politics', category: 'planning' },
  { id: 'military', icon: '⚔️', label: 'Military', category: 'planning' },
  { id: 'technology', icon: '⚙️', label: 'Technology', category: 'planning' },
  { id: 'mysteries', icon: '🔍', label: 'Mysteries', category: 'planning' },
  { id: 'timeline', icon: '⏳', label: 'Timeline', category: 'planning' },
  { id: 'canon', icon: '📜', label: 'Canon', category: 'planning' },
  { id: 'knowledge-graph', icon: '🕸️', label: 'Knowledge Graph', category: 'analysis' },
  { id: 'relationships', icon: '💫', label: 'Relationships', category: 'analysis' },
  { id: 'knowledge-matrix', icon: '📚', label: 'Knowledge Matrix', category: 'analysis' },
  { id: 'analytics', icon: '📊', label: 'Analytics', category: 'analysis' },
];

export function initAppShell() {
  const app = document.getElementById('app');
  
  const layout = h('div', { class: 'app-layout' },
    createTopBar(),
    createActivityBar(),
    createSidebar(),
    createMainContent(),
    createStatusBar()
  );
  
  render(app, layout);
  
  // Render initial module
  renderActiveModule();
  
  // Subscribe to state changes
  appStore.subscribe((state, prev) => {
    if (state.activeModule !== prev.activeModule) {
      renderActiveModule();
      updateActivityBar();
      updateSidebar();
    }
    if (state.saveStatus !== prev.saveStatus) {
      updateSaveIndicator();
    }
    if (state.commandPaletteOpen !== prev.commandPaletteOpen) {
      if (state.commandPaletteOpen) {
        renderCommandPalette();
      } else {
        const palette = document.querySelector('.command-palette');
        if (palette) palette.remove();
      }
    }
  });
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts();
}

function createTopBar() {
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar__left' },
      h('span', { class: 'topbar__logo' }, 'LoreForge'),
      h('div', { class: 'topbar__breadcrumbs', id: 'breadcrumbs' },
        h('span', { class: 'topbar__breadcrumb topbar__breadcrumb--current' }, 'Strategic Board')
      )
    ),
    h('div', { class: 'topbar__center' },
      h('button', { 
        class: 'btn btn--ghost btn--sm',
        onclick: () => appStore.setState({ commandPaletteOpen: true }),
        title: 'Command Palette (Ctrl+K)',
      }, '🔍 Search or command...',
        h('span', { style: { marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' } }, '⌘K')
      )
    ),
    h('div', { class: 'topbar__right' },
      createSaveIndicator(),
      h('button', { class: 'btn btn--ghost btn--icon', title: 'Settings' }, '⚙'),
    )
  );
}

function createSaveIndicator() {
  return h('div', { class: 'save-indicator save-indicator--saved', id: 'save-indicator' },
    h('span', { class: 'save-indicator__dot' }),
    h('span', { class: 'save-indicator__text' }, 'All Changes Saved')
  );
}

function updateSaveIndicator() {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;
  
  const state = appStore.getState();
  indicator.className = `save-indicator save-indicator--${state.saveStatus}`;
  
  const text = indicator.querySelector('.save-indicator__text');
  switch (state.saveStatus) {
    case 'saved': text.textContent = 'All Changes Saved'; break;
    case 'saving': text.textContent = 'Saving...'; break;
    case 'offline': text.textContent = 'Offline (Queued)'; break;
  }
}

function createActivityBar() {
  const bar = h('nav', { class: 'activity-bar', id: 'activity-bar' });
  
  const coreModules = modules.filter(m => m.category === 'core');
  const planningModules = modules.filter(m => m.category === 'planning');
  const analysisModules = modules.filter(m => m.category === 'analysis');
  
  const renderGroup = (group) => group.map(mod => 
    h('div', {
      class: `activity-bar__item ${appStore.getState().activeModule === mod.id ? 'activity-bar__item--active' : ''}`,
      title: mod.label,
      dataset: { module: mod.id },
      onclick: () => {
        appStore.setState({ activeModule: mod.id });
      }
    }, mod.icon)
  );
  
  bar.append(
    ...renderGroup(coreModules),
    h('div', { class: 'activity-bar__separator' }),
    ...renderGroup(planningModules),
    h('div', { class: 'activity-bar__separator' }),
    ...renderGroup(analysisModules)
  );
  
  return bar;
}

function updateActivityBar() {
  const items = document.querySelectorAll('.activity-bar__item');
  const active = appStore.getState().activeModule;
  
  items.forEach(item => {
    if (item.dataset.module === active) {
      item.classList.add('activity-bar__item--active');
    } else {
      item.classList.remove('activity-bar__item--active');
    }
  });
}

function createSidebar() {
  return h('aside', { class: 'sidebar', id: 'sidebar' },
    h('div', { class: 'sidebar__header' },
      h('span', { class: 'sidebar__title', id: 'sidebar-title' }, 'Strategic Board'),
      h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Add New', onclick: handleAddNew }, '+')
    ),
    h('div', { class: 'sidebar__content', id: 'sidebar-content' })
  );
}

function updateSidebar() {
  const title = document.getElementById('sidebar-title');
  const content = document.getElementById('sidebar-content');
  const state = appStore.getState();
  const mod = modules.find(m => m.id === state.activeModule);
  
  if (title && mod) {
    title.textContent = mod.label;
  }
  
  // Update breadcrumbs
  const breadcrumbs = document.getElementById('breadcrumbs');
  if (breadcrumbs && mod) {
    breadcrumbs.innerHTML = '';
    breadcrumbs.appendChild(
      h('span', { class: 'topbar__breadcrumb topbar__breadcrumb--current' }, mod.label)
    );
  }
}

function createMainContent() {
  return h('main', { class: 'main-content', id: 'main-content' });
}

function createStatusBar() {
  return h('footer', { class: 'statusbar' },
    h('div', { class: 'statusbar__left' },
      h('span', {}, 'LoreForge Planner v0.1.0'),
      h('span', { id: 'status-objects' }, '0 objects'),
    ),
    h('div', { class: 'statusbar__right' },
      h('span', { id: 'status-module' }, 'Strategic Board'),
      h('span', {}, 'Ctrl+K: Commands'),
    )
  );
}

function renderActiveModule() {
  const content = document.getElementById('main-content');
  if (!content) return;
  
  const state = appStore.getState();
  content.innerHTML = '';
  
  switch (state.activeModule) {
    case 'conflict-board':
      renderConflictBoard(content);
      break;
    case 'world-builder':
      renderWorldBuilder(content);
      break;
    case 'characters':
    case 'factions':
      renderCharacterPlanner(content, state.activeModule);
      break;
    case 'locations':
      renderLocationPlanner(content);
      break;
    case 'species':
      renderSpeciesPlanner(content);
      break;
    case 'organizations':
      renderOrganizationPlanner(content);
      break;
    case 'religions':
      renderReligionPlanner(content);
      break;
    case 'politics':
      renderPoliticsPlanner(content);
      break;
    case 'military':
      renderMilitaryPlanner(content);
      break;
    case 'technology':
      renderTechnologyPlanner(content);
      break;
    case 'mysteries':
      renderMysteryPlanner(content);
      break;
    case 'timeline':
      renderTimeline(content);
      break;
    case 'knowledge-graph':
    case 'relationships':
      renderKnowledgeGraph(content);
      break;
    case 'analytics':
      renderAnalytics(content);
      break;
    default:
      renderPlaceholderModule(content, state.activeModule);
  }
  
  // Update status bar
  const statusModule = document.getElementById('status-module');
  const mod = modules.find(m => m.id === state.activeModule);
  if (statusModule && mod) {
    statusModule.textContent = mod.label;
  }
  
  updateSidebar();
}

function renderPlaceholderModule(container, moduleId) {
  const mod = modules.find(m => m.id === moduleId);
  container.appendChild(
    h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state__icon' }, mod?.icon || '📋'),
      h('div', { class: 'empty-state__title' }, `${mod?.label || moduleId} Module`),
      h('div', { class: 'empty-state__description' }, 
        'This module is ready to be configured. Start by adding objects from the sidebar or use the command palette (Ctrl+K) to get started.'
      )
    )
  );
}

function handleAddNew() {
  appStore.setState({ commandPaletteOpen: true });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      appStore.setState({ commandPaletteOpen: !appStore.getState().commandPaletteOpen });
    }
    
    // Escape
    if (e.key === 'Escape') {
      appStore.setState({ commandPaletteOpen: false, contextMenu: null });
    }
    
    // Quick module switch
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (modules[idx]) {
        appStore.setState({ activeModule: modules[idx].id });
      }
    }
    
    // Undo (Ctrl+Z)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      // Undo logic would go here
    }
  });
  
  // Right-click context menu
  document.addEventListener('contextmenu', (e) => {
    const target = e.target.closest('[data-contextmenu]');
    if (target) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, target.dataset.contextmenu);
    }
  });
}

function showContextMenu(x, y, type) {
  // Remove existing
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();
  
  const items = getContextMenuItems(type);
  
  const menu = h('div', { class: 'context-menu', style: { left: `${x}px`, top: `${y}px` } },
    ...items.map(item => {
      if (item.separator) return h('div', { class: 'context-menu__separator' });
      return h('div', { 
        class: 'context-menu__item',
        onclick: () => { item.action(); menu.remove(); }
      }, 
        h('span', {}, item.icon || ''),
        h('span', {}, item.label)
      );
    })
  );
  
  document.body.appendChild(menu);
  
  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

function getContextMenuItems(type) {
  return [
    { icon: '✏️', label: 'Edit', action: () => {} },
    { icon: '📋', label: 'Duplicate', action: () => {} },
    { separator: true },
    { icon: '🔗', label: 'Create Relationship', action: () => {} },
    { icon: '🎯', label: 'Add to Board', action: () => {} },
    { separator: true },
    { icon: '🗑️', label: 'Delete', action: () => {} },
  ];
}
