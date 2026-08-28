/**
 * LoreForge Planner - Application Shell
 * Redesigned layout: text-based sidebar navigation + project dashboard
 * Grouped into Write, Plan, World, and Analysis categories
 */

import { h, render } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { db } from '../core/database.js';
import { getNavGroups, getModuleLabel, renderModuleById } from '../core/registry.js';
import { APP_NAME, APP_VERSION } from '../core/version.js';
import { timeAgo, formatNumber, countWords } from '../core/format.js';
import { renderCommandPalette } from './command-palette.js';

// ─── Navigation Structure ────────────────────────────────────────────────────
// Sidebar groups are derived from the single module registry (core/registry.js)
// so nav labels, the module dispatcher, and the command palette never drift.

const navGroups = getNavGroups();

// ─── App Shell Init ──────────────────────────────────────────────────────────

export function initAppShell() {
  const app = document.getElementById('app');

  // Set default module to dashboard
  if (appStore.getState().activeModule === 'conflict-board') {
    appStore.setState({ activeModule: 'dashboard' });
  }

  const layout = h('div', { class: 'app-layout' },
    createTopBar(),
    createNavSidebar(),
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
      updateNavHighlight();
      updateBreadcrumbs();
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

// ─── Top Bar ─────────────────────────────────────────────────────────────────

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
        h('span', { class: 'topbar__breadcrumb topbar__breadcrumb--current' }, 'Dashboard')
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

function updateBreadcrumbs() {
  const breadcrumbs = document.getElementById('breadcrumbs');
  if (!breadcrumbs) return;
  const state = appStore.getState();
  const label = getModuleLabel(state.activeModule);
  breadcrumbs.innerHTML = '';
  breadcrumbs.appendChild(
    h('span', { class: 'topbar__breadcrumb topbar__breadcrumb--current' }, label)
  );
}

// ─── Text-based Navigation Sidebar ──────────────────────────────────────────

function createNavSidebar() {
  const nav = h('nav', { class: 'nav-sidebar', id: 'nav-sidebar' },
    // Dashboard link at top
    h('div', { class: 'nav-sidebar__home' },
      h('a', {
        class: `nav-sidebar__home-link ${appStore.getState().activeModule === 'dashboard' ? 'nav-sidebar__home-link--active' : ''}`,
        href: '#',
        dataset: { module: 'dashboard' },
        onclick: (e) => { e.preventDefault(); appStore.setState({ activeModule: 'dashboard' }); }
      }, '🏠 Dashboard')
    ),
    // Navigation groups
    ...navGroups.map(group => createNavGroup(group)),
    // Collapse toggle at bottom
    h('div', { class: 'nav-sidebar__footer' },
      h('button', {
        class: 'btn btn--ghost btn--sm nav-sidebar__collapse-btn',
        id: 'sidebar-collapse-btn',
        onclick: toggleNavSidebar,
        title: 'Collapse Sidebar',
      }, '◀ Collapse')
    )
  );

  return nav;
}

function createNavGroup(group) {
  const state = appStore.getState();
  const isExpanded = true; // All groups expanded by default

  return h('div', { class: 'nav-sidebar__group', dataset: { group: group.id } },
    h('div', {
      class: 'nav-sidebar__group-header',
      onclick: (e) => toggleNavGroup(e, group.id),
    },
      h('span', { class: 'nav-sidebar__group-chevron' }, '▾'),
      h('span', { class: 'nav-sidebar__group-label' }, group.label),
    ),
    h('div', { class: 'nav-sidebar__group-items' },
      ...group.items.map(item =>
        h('a', {
          class: `nav-sidebar__item ${state.activeModule === item.id ? 'nav-sidebar__item--active' : ''}`,
          href: '#',
          dataset: { module: item.id },
          onclick: (e) => { e.preventDefault(); appStore.setState({ activeModule: item.id }); }
        }, item.label)
      )
    )
  );
}

function toggleNavGroup(e, groupId) {
  const groupEl = e.currentTarget.closest('.nav-sidebar__group');
  if (groupEl) {
    groupEl.classList.toggle('nav-sidebar__group--collapsed');
  }
}

function toggleNavSidebar() {
  const layout = document.querySelector('.app-layout');
  if (!layout) return;
  const isCollapsed = layout.classList.toggle('app-layout--sidebar-collapsed');
  const btn = document.getElementById('sidebar-collapse-btn');
  if (btn) {
    btn.textContent = isCollapsed ? '▶' : '◀ Collapse';
    btn.title = isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
  }
}

function updateNavHighlight() {
  const state = appStore.getState();
  // Update active item
  document.querySelectorAll('.nav-sidebar__item').forEach(el => {
    if (el.dataset.module === state.activeModule) {
      el.classList.add('nav-sidebar__item--active');
    } else {
      el.classList.remove('nav-sidebar__item--active');
    }
  });
  // Update dashboard link
  const homeLink = document.querySelector('.nav-sidebar__home-link');
  if (homeLink) {
    if (state.activeModule === 'dashboard') {
      homeLink.classList.add('nav-sidebar__home-link--active');
    } else {
      homeLink.classList.remove('nav-sidebar__home-link--active');
    }
  }
}

// ─── Main Content ────────────────────────────────────────────────────────────

function createMainContent() {
  return h('main', { class: 'main-content', id: 'main-content' });
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function createStatusBar() {
  return h('footer', { class: 'statusbar' },
    h('div', { class: 'statusbar__left' },
      h('span', {}, `${APP_NAME} v${APP_VERSION}`),
      h('span', { id: 'status-objects' }, '0 objects'),
    ),
    h('div', { class: 'statusbar__right' },
      h('span', { id: 'status-module' }, 'Dashboard'),
      h('span', {}, 'Ctrl+K: Commands'),
    )
  );
}

// ─── Dashboard (Home Screen) ─────────────────────────────────────────────────

async function renderDashboard(container) {
  const state = appStore.getState();
  const activeProject = state.projects.find(p => p.id === state.activeProjectId);
  const projectName = activeProject ? activeProject.name : 'LoreForge';
  const projectIcon = activeProject ? activeProject.icon : '🏰';

  // Get data for stats
  let objectCount = 0;
  let wordCount = 0;
  let recentItems = [];
  try {
    const objects = await db.getAll('objects');
    objectCount = objects.length;
    // Calculate word count from text fields
    objects.forEach(obj => {
      if (obj.content) wordCount += countWords(obj.content);
      if (obj.description) wordCount += countWords(obj.description);
      if (obj.notes) wordCount += countWords(obj.notes);
      if (obj.text) wordCount += countWords(obj.text);
      if (obj.body) wordCount += countWords(obj.body);
    });
    // Get recent items sorted by updatedAt
    recentItems = objects
      .filter(obj => obj.updatedAt)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 8);
  } catch (e) {
    // DB might be empty
  }

  const dashboard = h('div', { class: 'dashboard' },
    // Header
    h('div', { class: 'dashboard__header' },
      h('div', { class: 'dashboard__greeting' },
        h('h1', { class: 'dashboard__title' }, `${projectIcon} ${projectName}`),
        h('p', { class: 'dashboard__subtitle' }, activeProject?.description || 'Your creative planning workspace'),
      ),
    ),

    // Stats Row
    h('div', { class: 'dashboard__stats' },
      createStatCard('📝', 'Word Count', formatNumber(wordCount), 'Across all entries'),
      createStatCard('📦', 'Total Objects', String(objectCount), 'Characters, locations, etc.'),
      createStatCard('🗂️', 'Projects', String(state.projects.length), 'Active universes'),
      createStatCard('💾', 'Status', state.saveStatus === 'saved' ? 'Saved' : state.saveStatus === 'saving' ? 'Saving...' : 'Offline', 'Data persistence'),
    ),

    // Quick Actions
    h('div', { class: 'dashboard__section' },
      h('h2', { class: 'dashboard__section-title' }, 'Quick Actions'),
      h('div', { class: 'dashboard__actions' },
        createQuickAction('📖', 'Open Manuscript', () => appStore.setState({ activeModule: 'manuscript' })),
        createQuickAction('⚡', 'Quick Log', () => appStore.setState({ activeModule: 'quick-log' })),
        createQuickAction('💭', 'Brainstorm', () => appStore.setState({ activeModule: 'brainstorm' })),
        createQuickAction('♟️', 'Strategic Board', () => appStore.setState({ activeModule: 'conflict-board' })),
        createQuickAction('👤', 'Characters', () => appStore.setState({ activeModule: 'characters' })),
        createQuickAction('🕸️', 'Knowledge Graph', () => appStore.setState({ activeModule: 'knowledge-graph' })),
        createQuickAction('📊', 'Analytics', () => appStore.setState({ activeModule: 'analytics' })),
        createQuickAction('⏳', 'Timeline', () => appStore.setState({ activeModule: 'timeline' })),
      ),
    ),

    // Recent Items
    h('div', { class: 'dashboard__section' },
      h('h2', { class: 'dashboard__section-title' }, 'Recent Items'),
      recentItems.length > 0
        ? h('div', { class: 'dashboard__recent' },
            ...recentItems.map(item => createRecentItem(item))
          )
        : h('div', { class: 'dashboard__empty' },
            h('p', {}, 'No items yet. Start by creating objects in any module!'),
          ),
    ),

    // Navigation Guide
    h('div', { class: 'dashboard__section' },
      h('h2', { class: 'dashboard__section-title' }, 'Modules Overview'),
      h('div', { class: 'dashboard__modules-grid' },
        ...navGroups.map(group =>
          h('div', { class: 'dashboard__module-group' },
            h('h3', { class: 'dashboard__module-group-title' }, group.label),
            h('ul', { class: 'dashboard__module-list' },
              ...group.items.map(item =>
                h('li', {},
                  h('a', {
                    href: '#',
                    class: 'dashboard__module-link',
                    onclick: (e) => { e.preventDefault(); appStore.setState({ activeModule: item.id }); }
                  }, item.label)
                )
              )
            )
          )
        )
      ),
    ),
  );

  container.appendChild(dashboard);
}

function createStatCard(icon, label, value, description) {
  return h('div', { class: 'dashboard__stat-card' },
    h('div', { class: 'dashboard__stat-icon' }, icon),
    h('div', { class: 'dashboard__stat-info' },
      h('div', { class: 'dashboard__stat-value' }, value),
      h('div', { class: 'dashboard__stat-label' }, label),
      h('div', { class: 'dashboard__stat-desc' }, description),
    )
  );
}

function createQuickAction(icon, label, onclick) {
  return h('button', { class: 'dashboard__action-btn', onclick },
    h('span', { class: 'dashboard__action-icon' }, icon),
    h('span', { class: 'dashboard__action-label' }, label),
  );
}

function createRecentItem(item) {
  const typeIcons = {
    character: '👤', location: '📍', faction: '⚔️', scene: '🎬',
    note: '📝', event: '📅', species: '🧬', religion: '🕯️',
    organization: '🏢', military: '⚔️', technology: '⚙️',
  };
  const icon = typeIcons[item.type] || '📋';
  const timeStr = item.updatedAt ? timeAgo(item.updatedAt) : '';

  return h('div', { class: 'dashboard__recent-item' },
    h('span', { class: 'dashboard__recent-icon' }, icon),
    h('div', { class: 'dashboard__recent-info' },
      h('span', { class: 'dashboard__recent-name' }, item.name || item.title || 'Untitled'),
      h('span', { class: 'dashboard__recent-meta' }, `${item.type || 'object'} · ${timeStr}`),
    ),
  );
}

// countWords, formatNumber, timeAgo now come from core/format.js

// ─── Module Rendering ────────────────────────────────────────────────────────

function renderActiveModule() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const state = appStore.getState();
  content.innerHTML = '';

  // Dispatch through the registry; unknown ids fall back to a placeholder.
  if (state.activeModule === 'dashboard') {
    renderDashboard(content);
  } else if (!renderModuleById(state.activeModule, content)) {
    renderPlaceholderModule(content, state.activeModule);
  }

  // Update status bar
  const statusModule = document.getElementById('status-module');
  const label = getModuleLabel(state.activeModule);
  if (statusModule) {
    statusModule.textContent = label;
  }
}

function renderPlaceholderModule(container, moduleId) {
  const label = getModuleLabel(moduleId);
  container.appendChild(
    h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state__icon' }, '📋'),
      h('div', { class: 'empty-state__title' }, `${label} Module`),
      h('div', { class: 'empty-state__description' },
        'This module is ready to be configured. Start by adding objects from the sidebar or use the command palette (Ctrl+K) to get started.'
      )
    )
  );
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
    h('div', { style: { padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' } },
      h('span', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Your Projects'),
      h('button', { class: 'btn btn--primary btn--sm', onclick: () => { menu.remove(); openNewProjectModal(); } }, '+ New'),
    ),
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
    h('div', { style: { padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${state.projects.length} projects`),
      h('button', { class: 'btn btn--ghost btn--sm', onclick: () => { menu.remove(); openNewProjectModal(); } }, '+ Create New Project'),
    ),
  );

  document.body.appendChild(menu);

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
  const current = state.projects.find(p => p.id === state.activeProjectId);
  if (current) current.lastOpened = Date.now();

  appStore.setState({ activeProjectId: projectId });
  localStorage.setItem('loreforge_activeProjectId', projectId);
  localStorage.setItem('loreforge_projects', JSON.stringify(state.projects));

  window.location.reload();
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

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

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
      toggleNavSidebar();
    }

    // Escape
    if (e.key === 'Escape') {
      appStore.setState({ commandPaletteOpen: false, contextMenu: null });
    }

    // Home / Dashboard
    if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
      e.preventDefault();
      appStore.setState({ activeModule: 'dashboard' });
    }
  });
}
