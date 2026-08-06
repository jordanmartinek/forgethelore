/**
 * LoreForge Planner - World Builder
 * Infinite zoomable canvas with hierarchical branching.
 * Click into any node to explore its children.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { ObjectTypes, ObjectIcons, generateId } from '../core/objects.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';

// World object palette categories
const paletteCategories = [
  { name: 'Cosmic', items: [
    { type: ObjectTypes.UNIVERSE, label: 'Universe' },
    { type: ObjectTypes.GALAXY, label: 'Galaxy' },
    { type: ObjectTypes.NEBULA, label: 'Nebula' },
    { type: ObjectTypes.STAR_CLUSTER, label: 'Star Cluster' },
  ]},
  { name: 'Stellar', items: [
    { type: ObjectTypes.SOLAR_SYSTEM, label: 'Solar System' },
    { type: ObjectTypes.PLANET, label: 'Planet' },
    { type: ObjectTypes.MOON, label: 'Moon' },
    { type: ObjectTypes.ASTEROID_BELT, label: 'Asteroid Belt' },
  ]},
  { name: 'Infrastructure', items: [
    { type: ObjectTypes.SPACE_STATION, label: 'Space Station' },
    { type: ObjectTypes.MEGASTRUCTURE, label: 'Megastructure' },
    { type: ObjectTypes.FLEET, label: 'Fleet' },
    { type: ObjectTypes.SHIP, label: 'Ship' },
  ]},
  { name: 'Geography', items: [
    { type: ObjectTypes.CONTINENT, label: 'Continent' },
    { type: ObjectTypes.COUNTRY, label: 'Country' },
    { type: ObjectTypes.CITY, label: 'City' },
    { type: ObjectTypes.VILLAGE, label: 'Village' },
  ]},
  { name: 'Structures', items: [
    { type: ObjectTypes.BUILDING, label: 'Building' },
    { type: ObjectTypes.ROOM, label: 'Room' },
  ]},
  { name: 'Natural', items: [
    { type: ObjectTypes.FOREST, label: 'Forest' },
    { type: ObjectTypes.MOUNTAIN, label: 'Mountain' },
    { type: ObjectTypes.OCEAN, label: 'Ocean' },
  ]},
  { name: 'Anomalous', items: [
    { type: ObjectTypes.PORTAL, label: 'Portal' },
    { type: ObjectTypes.ARTIFACT, label: 'Artifact' },
    { type: ObjectTypes.ANOMALY, label: 'Anomaly' },
    { type: ObjectTypes.VOID_CONDUIT, label: 'Void Conduit' },
  ]},
];

// ─── Hierarchical World Data ─────────────────────────────────────────────────
// Each node can have children. Navigating "into" a node shows its children.

const _isDemo = getActiveProjectId() === 'proj1';
const DEFAULT_WORLD = {
  'root': {
    nodes: [
      { id: 'n1', type: ObjectTypes.GALAXY, name: 'Andromeda Reach', position: { x: 200, y: 150 }, color: '#6366f1' },
      { id: 'n2', type: ObjectTypes.GALAXY, name: 'Void Expanse', position: { x: 500, y: 200 }, color: '#a855f7' },
      { id: 'n10', type: ObjectTypes.ANOMALY, name: 'Quantum Rift', position: { x: 420, y: 80 }, color: '#8b5cf6' },
    ],
    connections: [{ from: 'n2', to: 'n10' }],
  },
  'n1': {
    nodes: [
      { id: 'n3', type: ObjectTypes.SOLAR_SYSTEM, name: 'Sol Prime', position: { x: 150, y: 150 }, color: '#f59e0b' },
      { id: 'n4', type: ObjectTypes.SOLAR_SYSTEM, name: 'Kepler Array', position: { x: 450, y: 180 }, color: '#06b6d4' },
    ],
    connections: [],
  },
  'n2': {
    nodes: [
      { id: 'n8', type: ObjectTypes.VOID_CONDUIT, name: 'The Breach', position: { x: 300, y: 200 }, color: '#ec4899' },
      { id: 'n9', type: ObjectTypes.FLEET, name: 'Dominion 1st Fleet', position: { x: 550, y: 250 }, color: '#ef4444' },
    ],
    connections: [],
  },
  'n3': {
    nodes: [
      { id: 'n5', type: ObjectTypes.PLANET, name: 'Terra Nova', position: { x: 200, y: 150 }, color: '#22c55e' },
    ],
    connections: [],
  },
  'n4': {
    nodes: [
      { id: 'n6', type: ObjectTypes.PLANET, name: 'Obsidian', position: { x: 200, y: 150 }, color: '#ef4444' },
      { id: 'n7', type: ObjectTypes.SPACE_STATION, name: 'Citadel Prime', position: { x: 450, y: 200 }, color: '#3b82f6' },
    ],
    connections: [{ from: 'n6', to: 'n7' }],
  },
  'n5': {
    nodes: [
      { id: 'n5c1', type: ObjectTypes.CONTINENT, name: 'Nova Prime', position: { x: 200, y: 150 }, color: '#22c55e' },
      { id: 'n5c2', type: ObjectTypes.OCEAN, name: 'The Vast Blue', position: { x: 450, y: 200 }, color: '#3b82f6' },
    ],
    connections: [],
  },
};

let worldData = loadData('worldBuilder', _isDemo ? DEFAULT_WORLD : { root: { nodes: [], connections: [] } });

function saveWorld() {
  saveData('worldBuilder', worldData);
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 300);
}

// ─── State ───────────────────────────────────────────────────────────────────

let canvasState = { zoom: 1, panX: 0, panY: 0, isPanning: false, startPan: { x: 0, y: 0 }, selectedNode: null, dragNode: null };
let worldPath = [{ id: 'root', name: 'Universe', type: 'universe' }];

function getCurrentLevel() {
  const currentId = worldPath[worldPath.length - 1].id;
  if (!worldData[currentId]) worldData[currentId] = { nodes: [], connections: [] };
  return worldData[currentId];
}

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderWorldBuilder(container) {
  const builder = h('div', { class: 'world-builder' },
    renderWorldToolbar(),
    renderPalette(),
    renderCanvas()
  );
  container.appendChild(builder);
  updateWorldSidebar();
}

function renderWorldToolbar() {
  const level = getCurrentLevel();
  return h('div', { class: 'world-builder__toolbar' },
    h('div', { class: 'world-builder__breadcrumbs' },
      ...worldPath.map((crumb, i) => [
        i > 0 ? h('span', { style: { color: 'var(--text-muted)', fontSize: '10px' } }, '›') : null,
        h('span', {
          class: `world-builder__crumb ${i === worldPath.length - 1 ? 'world-builder__crumb--current' : ''}`,
          onclick: () => navigateToLevel(i)
        }, `${ObjectIcons[crumb.type] || '🌌'} ${crumb.name}`)
      ]).flat().filter(Boolean)
    ),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${level.nodes.length} objects at this level`),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: () => navigateToLevel(0) }, '🏠 Root'),
    )
  );
}

function renderPalette() {
  return h('div', { class: 'world-builder__palette' },
    ...paletteCategories.map(category =>
      h('div', { class: 'palette-group' },
        h('div', { class: 'palette-group__title' }, category.name),
        ...category.items.map(item =>
          h('div', {
            class: 'palette-item',
            draggable: 'true',
            ondragstart: (e) => {
              e.dataTransfer.setData('text/plain', JSON.stringify(item));
              e.dataTransfer.effectAllowed = 'copy';
            }
          },
            h('span', { class: 'palette-item__icon' }, ObjectIcons[item.type]),
            h('span', {}, item.label),
          )
        )
      )
    )
  );
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

function renderCanvas() {
  const canvas = h('div', {
    class: 'world-builder__canvas',
    ondrop: handleCanvasDrop,
    ondragover: (e) => e.preventDefault(),
    onmousedown: handleCanvasMouseDown,
    onmousemove: handleCanvasMouseMove,
    onmouseup: handleCanvasMouseUp,
    onwheel: handleCanvasWheel,
  });

  canvas.appendChild(h('div', { class: 'canvas-grid', id: 'canvas-grid' }));

  const transform = h('div', {
    id: 'canvas-transform',
    style: { position: 'absolute', inset: '0', transform: `translate(${canvasState.panX}px, ${canvasState.panY}px) scale(${canvasState.zoom})`, transformOrigin: '0 0' }
  });

  const level = getCurrentLevel();

  // Nodes
  level.nodes.forEach(node => transform.appendChild(createCanvasNode(node)));

  canvas.appendChild(transform);

  // SVG for connections (rendered on top, updates dynamically)
  canvas.appendChild(renderConnections());

  // Zoom controls
  canvas.appendChild(h('div', { class: 'canvas-controls' },
    h('button', { class: 'canvas-controls__btn', onclick: () => zoomCanvas(0.1) }, '+'),
    h('div', { class: 'canvas-controls__zoom', id: 'zoom-level' }, `${Math.round(canvasState.zoom * 100)}%`),
    h('button', { class: 'canvas-controls__btn', onclick: () => zoomCanvas(-0.1) }, '−'),
    h('button', { class: 'canvas-controls__btn', onclick: resetCanvas, title: 'Reset' }, '⊡'),
  ));

  // Empty state
  if (level.nodes.length === 0) {
    canvas.appendChild(h('div', { style: { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' } },
      h('div', { style: { textAlign: 'center', color: 'var(--text-muted)' } },
        h('div', { style: { fontSize: '36px', marginBottom: '8px', opacity: '0.5' } }, '🌌'),
        h('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' } }, 'Empty Space'),
        h('div', { style: { fontSize: '12px' } }, 'Drag objects from the left palette to populate this level'),
      )
    ));
  }

  return canvas;
}

function renderConnections() {
  const level = getCurrentLevel();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'world-connections-svg';
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1;';

  level.connections.forEach(conn => {
    const from = level.nodes.find(n => n.id === conn.from);
    const to = level.nodes.find(n => n.id === conn.to);
    if (!from || !to) return;

    const x1 = (from.position.x + 60) * canvasState.zoom + canvasState.panX;
    const y1 = (from.position.y + 25) * canvasState.zoom + canvasState.panY;
    const x2 = (to.position.x + 60) * canvasState.zoom + canvasState.panX;
    const y2 = (to.position.y + 25) * canvasState.zoom + canvasState.panY;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', 'rgba(99,102,241,0.4)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(line);
  });

  return svg;
}

function updateConnections() {
  const oldSvg = document.getElementById('world-connections-svg');
  if (oldSvg) {
    const newSvg = renderConnections();
    oldSvg.parentNode.replaceChild(newSvg, oldSvg);
  }
}

// ─── Canvas Nodes ────────────────────────────────────────────────────────────

function createCanvasNode(node) {
  const hasChildren = !!worldData[node.id] && worldData[node.id].nodes.length > 0;

  return h('div', {
    class: `canvas-node ${canvasState.selectedNode === node.id ? 'canvas-node--selected' : ''}`,
    style: { left: `${node.position.x}px`, top: `${node.position.y}px`, borderLeftColor: node.color, borderLeftWidth: '3px' },
    dataset: { nodeId: node.id },
    onclick: (e) => { e.stopPropagation(); selectNode(node.id); },
    ondblclick: (e) => { e.stopPropagation(); enterNode(node); },
    onmousedown: (e) => startNodeDrag(e, node),
  },
    h('div', { class: 'canvas-node__header' },
      h('span', { class: 'canvas-node__icon' }, ObjectIcons[node.type]),
      h('span', { class: 'canvas-node__name' }, node.name),
      h('button', {
        style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', padding: '2px 4px', borderRadius: '4px' },
        title: 'Edit',
        onclick: (e) => { e.stopPropagation(); openEditNodeModal(node); },
        onmousedown: (e) => e.stopPropagation(),
      }, '✏️'),
    ),
    h('div', { class: 'canvas-node__type' }, node.type.replace(/_/g, ' ')),
    // Enter button — always visible, indicates you can drill in
    h('div', {
      class: 'canvas-node__enter',
      style: { opacity: '1', background: hasChildren ? 'var(--accent-primary)' : 'var(--surface-4)', cursor: 'pointer' },
      title: hasChildren ? `Enter (${worldData[node.id].nodes.length} children)` : 'Enter (empty — add children inside)',
      onclick: (e) => { e.stopPropagation(); enterNode(node); },
    }, '→'),
  );
}

// ─── Interaction ─────────────────────────────────────────────────────────────

function selectNode(nodeId) {
  canvasState.selectedNode = canvasState.selectedNode === nodeId ? null : nodeId;
  document.querySelectorAll('.canvas-node').forEach(el => {
    el.classList.toggle('canvas-node--selected', el.dataset.nodeId === canvasState.selectedNode);
  });
}

function enterNode(node) {
  // Create the level if it doesn't exist
  if (!worldData[node.id]) worldData[node.id] = { nodes: [], connections: [] };
  worldPath.push({ id: node.id, name: node.name, type: node.type });
  canvasState = { zoom: 1, panX: 0, panY: 0, isPanning: false, startPan: { x: 0, y: 0 }, selectedNode: null, dragNode: null };
  rerender();
}

function navigateToLevel(index) {
  worldPath = worldPath.slice(0, index + 1);
  canvasState = { zoom: 1, panX: 0, panY: 0, isPanning: false, startPan: { x: 0, y: 0 }, selectedNode: null, dragNode: null };
  rerender();
}

function handleCanvasMouseDown(e) {
  if (e.target.closest('.canvas-node') || e.target.closest('.canvas-controls')) return;
  canvasState.isPanning = true;
  canvasState.startPan = { x: e.clientX - canvasState.panX, y: e.clientY - canvasState.panY };
}

function handleCanvasMouseMove(e) {
  if (canvasState.isPanning) {
    canvasState.panX = e.clientX - canvasState.startPan.x;
    canvasState.panY = e.clientY - canvasState.startPan.y;
    updateCanvasTransform();
    updateConnections();
  }
  if (canvasState.dragNode) {
    const level = getCurrentLevel();
    const node = level.nodes.find(n => n.id === canvasState.dragNode);
    if (node) {
      node.position.x += e.movementX / canvasState.zoom;
      node.position.y += e.movementY / canvasState.zoom;
      const el = document.querySelector(`[data-node-id="${node.id}"]`);
      if (el) { el.style.left = `${node.position.x}px`; el.style.top = `${node.position.y}px`; }
      updateConnections();
    }
  }
}

function handleCanvasMouseUp() {
  if (canvasState.dragNode) saveWorld();
  canvasState.isPanning = false;
  canvasState.dragNode = null;
}

function handleCanvasWheel(e) {
  e.preventDefault();
  zoomCanvas(e.deltaY > 0 ? -0.05 : 0.05);
}

function startNodeDrag(e, node) {
  if (e.button !== 0) return;
  e.stopPropagation();
  canvasState.dragNode = node.id;
}

function handleCanvasDrop(e) {
  e.preventDefault();
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;
  try {
    const item = JSON.parse(data);
    const rect = e.target.closest('.world-builder__canvas').getBoundingClientRect();
    const x = (e.clientX - rect.left - canvasState.panX) / canvasState.zoom;
    const y = (e.clientY - rect.top - canvasState.panY) / canvasState.zoom;
    const level = getCurrentLevel();
    level.nodes.push({ id: generateId(), type: item.type, name: `New ${item.label}`, position: { x, y }, color: '#6366f1' });
    saveWorld();
    rerender();
  } catch(err) {}
}

// ─── Zoom / Pan ──────────────────────────────────────────────────────────────

function zoomCanvas(delta) {
  canvasState.zoom = Math.max(0.3, Math.min(3, canvasState.zoom + delta));
  updateCanvasTransform();
  updateConnections();
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = `${Math.round(canvasState.zoom * 100)}%`;
}

function resetCanvas() {
  canvasState.zoom = 1; canvasState.panX = 0; canvasState.panY = 0;
  updateCanvasTransform();
  updateConnections();
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = '100%';
}

function updateCanvasTransform() {
  const t = document.getElementById('canvas-transform');
  if (t) t.style.transform = `translate(${canvasState.panX}px, ${canvasState.panY}px) scale(${canvasState.zoom})`;
  const g = document.getElementById('canvas-grid');
  if (g) { g.style.backgroundSize = `${40 * canvasState.zoom}px ${40 * canvasState.zoom}px`; g.style.backgroundPosition = `${canvasState.panX}px ${canvasState.panY}px`; }
}

// ─── Edit / Delete Nodes ─────────────────────────────────────────────────────

function openEditNodeModal(node) {
  const NODE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#3b82f6', '#84cc16'];
  const state = { name: node.name, color: node.color };

  const colorGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    ...NODE_COLORS.map(c => h('div', {
      style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
      onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; }
    }))
  );

  const content = h('div', {},
    h('div', { style: { marginBottom: '12px' } },
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Name'),
      h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value }),
    ),
    h('div', { style: { marginBottom: '12px' } },
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Color'),
      colorGrid,
    ),
    h('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' } },
      h('button', { class: 'btn', style: { color: 'var(--danger)', width: '100%' }, onclick: () => { deleteNode(node); document.querySelector('.modal-overlay')?.remove(); } }, '🗑️ Delete This Node'),
    ),
  );

  // Modal
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, `Edit: ${node.name}`),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕'),
      ),
      h('div', { class: 'modal__body' }, content),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'),
        h('button', { class: 'btn btn--primary', onclick: () => {
          node.name = state.name;
          node.color = state.color;
          saveWorld();
          rerender();
          overlay.remove();
        }}, 'Save'),
      ),
    )
  );
  document.body.appendChild(overlay);
}

function deleteNode(node) {
  if (!confirm(`Delete "${node.name}" and all its children?`)) return;
  const level = getCurrentLevel();
  const idx = level.nodes.findIndex(n => n.id === node.id);
  if (idx !== -1) level.nodes.splice(idx, 1);
  // Remove connections involving this node
  level.connections = level.connections.filter(c => c.from !== node.id && c.to !== node.id);
  // Remove children data
  delete worldData[node.id];
  saveWorld();
  rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderWorldBuilder(container); }
}

function updateWorldSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const level = getCurrentLevel();

  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px' } }, `Level: ${worldPath[worldPath.length-1].name}`));

  level.nodes.forEach(node => {
    const hasChildren = !!worldData[node.id] && worldData[node.id].nodes.length > 0;
    sidebar.appendChild(h('div', {
      class: `sidebar-item ${canvasState.selectedNode === node.id ? 'sidebar-item--active' : ''}`,
      onclick: () => selectNode(node.id),
      ondblclick: () => enterNode(node),
    },
      h('span', { class: 'sidebar-item__icon' }, ObjectIcons[node.type]),
      h('span', { class: 'sidebar-item__label' }, node.name),
      hasChildren ? h('span', { class: 'sidebar-item__count' }, `${worldData[node.id].nodes.length}`) : null,
    ));
  });

  if (level.nodes.length === 0) {
    sidebar.appendChild(h('div', { style: { padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Drag objects from the palette'));
  }
}
