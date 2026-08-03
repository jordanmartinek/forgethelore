/**
 * LoreForge Planner - Reactive State Store
 * A lightweight reactive store inspired by Zustand
 */

export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(partial) {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    const prevState = state;
    state = { ...state, ...nextState };
    
    listeners.forEach(listener => {
      try {
        listener(state, prevState);
      } catch (e) {
        console.error('Store listener error:', e);
      }
    });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}

// Application Store
export const appStore = createStore({
  // Navigation
  activeModule: 'conflict-board',
  breadcrumbs: [{ id: 'home', label: 'LoreForge', icon: '🏰' }],
  
  // Save State
  saveStatus: 'saved', // 'saved' | 'saving' | 'offline'
  lastSaved: Date.now(),
  
  // UI State
  commandPaletteOpen: false,
  detailPanelOpen: false,
  selectedObjectId: null,
  contextMenu: null,
  projectMenuOpen: false,
  
  // Projects
  activeProjectId: 'proj1',
  projects: [
    { id: 'proj1', name: 'Void Dominion', icon: '🌌', lastOpened: Date.now(), description: 'Sci-fi universe — Dominion, Machinae, Swarm, Free Colonies' },
    { id: 'proj2', name: 'The Shattered Kingdoms', icon: '⚔️', lastOpened: Date.now() - 86400000, description: 'Fantasy epic — warring kingdoms, ancient magic, prophecy' },
    { id: 'proj3', name: 'Neon Requiem', icon: '🌃', lastOpened: Date.now() - 172800000, description: 'Cyberpunk noir — megacorps, hackers, rogue AI' },
  ],
  
  // Sidebar
  sidebarCollapsed: false,
  
  // Boards
  activeBoard: 'global',
  boards: [],
  
  // World Builder
  worldPath: [],
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
});

// Object Store (all planning objects)
export const objectStore = createStore({
  objects: new Map(),
  relationships: new Map(),
  history: [],
  historyIndex: -1,
});

// Conflict Board Store
export const boardStore = createStore({
  boards: [{
    id: 'global',
    name: 'Global Strategic Board',
    factions: [],
    pieces: [],
    objectives: [],
    conflictLines: [],
    activeLayer: 'all',
    timelinePosition: 50,
  }],
  activeBoardId: 'global',
  selectedPieceId: null,
  showHeatmap: false,
  showConflictLines: true,
});
