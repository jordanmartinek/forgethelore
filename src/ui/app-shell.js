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
import { renderFactionPlanner } from '../modules/faction-planner.js';
import { renderRelationshipPlanner } from '../modules/relationship-planner.js';
import { renderCharacterArc } from '../modules/character-arc.js';
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
  { id: 'knowledge-matrix', icon: '📈', label: 'Character Arcs', category: 'analysis' },
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
  const state = appStore.getState();
  const activeProject = state.projects.find(p => p.id === state.activeProjectId);
  const projectName = activeProject ? activeProject.name : 'LoreForge';
  const projectIcon = activeProject ? activeProject.icon : '🏰';

  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar__left' },
      h('div', { style: { position: 'relative' } },
        h('button', {
          class: 'btn btn--ghost btn--sm',
          style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', fontSize: '13px' },
          onclick: toggleProjectMenu,
          id: 'project-switcher-btn',
          title: 'Switch Project',
        },
          h('span', {}, projectIcon),
          h('span', { class: 'topbar__logo' }, projectName),
          h('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, '▼'),
        ),
      ),
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
    ...renderGroup(analysisModules),
    // Spacer pushes toggle to bottom
    h('div', { style: { flex: '1' } }),
    h('div', {
      class: 'activity-bar__item',
      title: 'Toggle Sidebar (Ctrl+B)',
      onclick: toggleSidebar,
      id: 'activity-bar-sidebar-toggle',
    }, '☰')
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
      h('div', { style: { display: 'flex', gap: '4px' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Add New', onclick: handleAddNew }, '+'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Collapse Sidebar', id: 'sidebar-toggle', onclick: toggleSidebar }, '◀'),
      )
    ),
    h('div', { class: 'sidebar__content', id: 'sidebar-content' })
  );
}

function toggleSidebar() {
  const layout = document.querySelector('.app-layout');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (!layout) return;
  
  const isCollapsed = layout.classList.toggle('app-layout--sidebar-collapsed');
  appStore.setState({ sidebarCollapsed: isCollapsed });
  
  if (toggleBtn) {
    toggleBtn.textContent = isCollapsed ? '▶' : '◀';
    toggleBtn.title = isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
  }
}

// ─── Project Switcher ────────────────────────────────────────────────────────

function toggleProjectMenu() {
  const existing = document.getElementById('project-menu');
  if (existing) { existing.remove(); return; }

  const state = appStore.getState();
  const btn = document.getElementById('project-switcher-btn');
  const rect = btn ? btn.getBoundingClientRect() : { left: 16, bottom: 44 };

  const menu = h('div', {
    id: 'project-menu',
    style: {
      position: 'fixed', top: `${rect.bottom + 4}px`, left: `${rect.left}px`,
      width: '320px', maxHeight: '420px', overflowY: 'auto',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
      zIndex: 'var(--z-dropdown)', padding: 'var(--space-sm)',
      animation: 'scaleIn 0.15s ease',
    }
  },
    // Header
    h('div', { style: { padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' } },
      h('span', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Your Projects'),
      h('button', { class: 'btn btn--primary btn--sm', onclick: () => { menu.remove(); openNewProjectModal(); } }, '+ New'),
    ),

    // Project list
    ...state.projects.map(project =>
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
          background: project.id === state.activeProjectId ? 'var(--bg-active)' : 'transparent',
          border: project.id === state.activeProjectId ? '1px solid var(--border-accent)' : '1px solid transparent',
          transition: 'all 0.1s ease',
        },
        onmouseenter: (e) => { if (project.id !== state.activeProjectId) e.currentTarget.style.background = 'var(--bg-hover)'; },
        onmouseleave: (e) => { if (project.id !== state.activeProjectId) e.currentTarget.style.background = 'transparent'; },
        onclick: () => { switchProject(project.id); menu.remove(); },
      },
        h('div', { style: { width: '36px', height: '36px', borderRadius: '8px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: '0' } }, project.icon),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' } }, project.name),
          project.description ? h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, project.description) : null,
        ),
        project.id === state.activeProjectId
          ? h('span', { style: { fontSize: '10px', color: 'var(--accent-primary)', fontWeight: '600' } }, '● Active')
          : h('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, timeAgo(project.lastOpened)),
      )
    ),

    // Footer
    h('div', { style: { padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${state.projects.length} projects`),
      h('button', { class: 'btn btn--ghost btn--sm', onclick: () => { menu.remove(); openNewProjectModal(); } }, '+ Create New Project'),
    ),
  );

  document.body.appendChild(menu);

  // Close on click outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 10);
}

function switchProject(projectId) {
  const state = appStore.getState();
  // Update lastOpened on current project
  const current = state.projects.find(p => p.id === state.activeProjectId);
  if (current) current.lastOpened = Date.now();

  appStore.setState({ activeProjectId: projectId });

  // Update the top bar to show new project name
  const newProject = state.projects.find(p => p.id === projectId);
  if (newProject) {
    newProject.lastOpened = Date.now();
    // Re-render topbar project name
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.parentNode.replaceChild(createTopBar(), topbar);
    }
  }

  // Trigger save indicator
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
}

function openNewProjectModal() {
  const state = { name: '', icon: '📖', description: '' };
  const PROJECT_ICONS = ['📖', '🌌', '⚔️', '🌃', '🏰', '🚀', '🐉', '🔮', '🌍', '💫', '🎭', '🕸️', '🌊', '⚡', '👑', '🗡️', '🛸', '🌑', '🔥', '🧬'];

  const iconGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
    ...PROJECT_ICONS.map(ic => h('span', {
      style: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '6px', background: ic === state.icon ? 'var(--bg-active)' : 'transparent', fontSize: '18px', border: ic === state.icon ? '1px solid var(--border-accent)' : '1px solid transparent' },
      onclick: (e) => { state.icon = ic; e.currentTarget.parentElement.querySelectorAll('span').forEach(s => { s.style.background = 'transparent'; s.style.border = '1px solid transparent'; }); e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.border = '1px solid var(--border-accent)'; }
    }, ic))
  );

  const content = h('div', {},
    h('div', { style: { marginBottom: '12px' } },
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Project Name'),
      h('input', { class: 'input', placeholder: 'e.g. The Void Dominion, Book of Shadows...', oninput: (e) => state.name = e.target.value }),
    ),
    h('div', { style: { marginBottom: '12px' } },
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Icon'),
      iconGrid,
    ),
    h('div', { style: { marginBottom: '12px' } },
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Description (optional)'),
      h('input', { class: 'input', placeholder: 'A short description of this universe...', oninput: (e) => state.description = e.target.value }),
    ),
  );

  // Use a simple modal
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, 'Create New Project'), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
        h('button', { class: 'btn btn--primary', onclick: () => {
          if (!state.name.trim()) return;
          const newId = `proj_${Date.now()}`;
          const appState = appStore.getState();
          appState.projects.push({ id: newId, name: state.name, icon: state.icon, lastOpened: Date.now(), description: state.description });
          switchProject(newId);
          overlay.remove();
        } }, 'Create Project'),
      ),
    )
  );
  document.body.appendChild(overlay);
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
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
      renderCharacterPlanner(content, state.activeModule);
      break;
    case 'factions':
      renderFactionPlanner(content);
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
      renderKnowledgeGraph(content);
      break;
    case 'relationships':
      renderRelationshipPlanner(content);
      break;
    case 'knowledge-matrix':
      renderCharacterArc(content);
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
    
    // Toggle sidebar
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
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
