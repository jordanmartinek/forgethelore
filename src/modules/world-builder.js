/**
 * LoreForge Planner - World Builder
 * Infinite zoomable canvas with hierarchical branching
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { ObjectTypes, ObjectIcons, generateId } from '../core/objects.js';

// World object palette categories
const paletteCategories = [
  { name: 'Cosmic', items: [
    { type: ObjectTypes.UNIVERSE, label: 'Universe' },
    { type: ObjectTypes.MULTIVERSE, label: 'Multiverse' },
    { type: ObjectTypes.GALAXY, label: 'Galaxy' },
    { type: ObjectTypes.NEBULA, label: 'Nebula' },
    { type: ObjectTypes.STAR_CLUSTER, label: 'Star Cluster' },
  ]},
  { name: 'Stellar', items: [
    { type: ObjectTypes.SOLAR_SYSTEM, label: 'Solar System' },
    { type: ObjectTypes.BINARY_STAR, label: 'Binary Star' },
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
    { type: ObjectTypes.KINGDOM, label: 'Kingdom' },
    { type: ObjectTypes.CITY, label: 'City' },
    { type: ObjectTypes.DISTRICT, label: 'District' },
    { type: ObjectTypes.VILLAGE, label: 'Village' },
  ]},
  { name: 'Structures', items: [
    { type: ObjectTypes.BUILDING, label: 'Building' },
    { type: ObjectTypes.FLOOR, label: 'Floor' },
    { type: ObjectTypes.ROOM, label: 'Room' },
  ]},
  { name: 'Natural', items: [
    { type: ObjectTypes.FOREST, label: 'Forest' },
    { type: ObjectTypes.MOUNTAIN, label: 'Mountain' },
    { type: ObjectTypes.RIVER, label: 'River' },
    { type: ObjectTypes.OCEAN, label: 'Ocean' },
  ]},
  { name: 'Anomalous', items: [
    { type: ObjectTypes.PORTAL, label: 'Portal' },
    { type: ObjectTypes.ARTIFACT, label: 'Artifact' },
    { type: ObjectTypes.ANOMALY, label: 'Anomaly' },
    { type: ObjectTypes.VOID_CONDUIT, label: 'Void Conduit' },
  ]},
];


// Demo canvas nodes
const demoNodes = [
  { id: 'n1', type: ObjectTypes.GALAXY, name: 'Andromeda Reach', position: { x: 200, y: 150 }, color: '#6366f1' },
  { id: 'n2', type: ObjectTypes.GALAXY, name: 'Void Expanse', position: { x: 500, y: 200 }, color: '#a855f7' },
  { id: 'n3', type: ObjectTypes.SOLAR_SYSTEM, name: 'Sol Prime', position: { x: 150, y: 350 }, color: '#f59e0b' },
  { id: 'n4', type: ObjectTypes.SOLAR_SYSTEM, name: 'Kepler Array', position: { x: 400, y: 380 }, color: '#06b6d4' },
  { id: 'n5', type: ObjectTypes.PLANET, name: 'Terra Nova', position: { x: 100, y: 520 }, color: '#22c55e' },
  { id: 'n6', type: ObjectTypes.PLANET, name: 'Obsidian', position: { x: 320, y: 500 }, color: '#ef4444' },
  { id: 'n7', type: ObjectTypes.SPACE_STATION, name: 'Citadel Prime', position: { x: 550, y: 420 }, color: '#3b82f6' },
  { id: 'n8', type: ObjectTypes.VOID_CONDUIT, name: 'The Breach', position: { x: 650, y: 300 }, color: '#ec4899' },
  { id: 'n9', type: ObjectTypes.FLEET, name: 'Dominion 1st Fleet', position: { x: 700, y: 480 }, color: '#ef4444' },
  { id: 'n10', type: ObjectTypes.ANOMALY, name: 'Quantum Rift', position: { x: 450, y: 120 }, color: '#8b5cf6' },
];

const demoConnections = [
  { from: 'n1', to: 'n3' },
  { from: 'n1', to: 'n4' },
  { from: 'n2', to: 'n8' },
  { from: 'n3', to: 'n5' },
  { from: 'n4', to: 'n6' },
  { from: 'n4', to: 'n7' },
  { from: 'n8', to: 'n10' },
];

let canvasState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startPan: { x: 0, y: 0 },
  selectedNode: null,
  dragNode: null,
};

let worldPath = [{ id: 'universe', name: 'The Cosmos', type: 'universe' }];


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
      h('button', { class: 'btn btn--sm btn--ghost' }, '🔲 Snap to Grid'),
      h('button', { class: 'btn btn--sm btn--ghost' }, '🔗 Connect Mode'),
      h('button', { class: 'btn btn--sm btn--ghost' }, '📐 Auto Layout'),
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' } }, `${demoNodes.length} objects`),
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
  
  // Grid background
  canvas.appendChild(h('div', { class: 'canvas-grid', id: 'canvas-grid' }));
  
  // Transform container
  const transform = h('div', { 
    id: 'canvas-transform',
    style: { 
      position: 'absolute', 
      inset: '0', 
      transform: `translate(${canvasState.panX}px, ${canvasState.panY}px) scale(${canvasState.zoom})`,
      transformOrigin: '0 0',
      transition: 'none',
    }
  });
  
  // Connection lines (SVG)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'canvas-connections');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';
  
  demoConnections.forEach(conn => {
    const from = demoNodes.find(n => n.id === conn.from);
    const to = demoNodes.find(n => n.id === conn.to);
    if (!from || !to) return;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(from.position.x + 60));
    line.setAttribute('y1', String(from.position.y + 25));
    line.setAttribute('x2', String(to.position.x + 60));
    line.setAttribute('y2', String(to.position.y + 25));
    line.setAttribute('class', 'canvas-connection');
    svg.appendChild(line);
  });
  
  transform.appendChild(svg);
  
  // Nodes
  demoNodes.forEach(node => {
    transform.appendChild(createCanvasNode(node));
  });
  
  canvas.appendChild(transform);
  
  // Zoom controls
  canvas.appendChild(
    h('div', { class: 'canvas-controls' },
      h('button', { class: 'canvas-controls__btn', onclick: () => zoomCanvas(0.1) }, '+'),
      h('div', { class: 'canvas-controls__zoom', id: 'zoom-level' }, `${Math.round(canvasState.zoom * 100)}%`),
      h('button', { class: 'canvas-controls__btn', onclick: () => zoomCanvas(-0.1) }, '−'),
      h('button', { class: 'canvas-controls__btn', onclick: resetCanvas, title: 'Reset View' }, '⊡'),
    )
  );
  
  return canvas;
}


function createCanvasNode(node) {
  return h('div', {
    class: `canvas-node ${canvasState.selectedNode === node.id ? 'canvas-node--selected' : ''}`,
    style: { left: `${node.position.x}px`, top: `${node.position.y}px`, borderLeftColor: node.color, borderLeftWidth: '3px' },
    dataset: { nodeId: node.id, contextmenu: 'object' },
    onclick: (e) => { e.stopPropagation(); selectNode(node.id); },
    ondblclick: () => enterNode(node),
    onmousedown: (e) => startNodeDrag(e, node),
  },
    h('div', { class: 'canvas-node__header' },
      h('span', { class: 'canvas-node__icon' }, ObjectIcons[node.type]),
      h('span', { class: 'canvas-node__name' }, node.name),
    ),
    h('div', { class: 'canvas-node__type' }, node.type.replace(/_/g, ' ')),
    h('div', { class: 'canvas-node__enter', title: 'Enter (explore inside)' }, '→'),
  );
}

function selectNode(nodeId) {
  canvasState.selectedNode = canvasState.selectedNode === nodeId ? null : nodeId;
  document.querySelectorAll('.canvas-node').forEach(el => {
    el.classList.toggle('canvas-node--selected', el.dataset.nodeId === canvasState.selectedNode);
  });
}

function enterNode(node) {
  // Navigate into this node (hierarchical branching)
  worldPath.push({ id: node.id, name: node.name, type: node.type });
  // In a full implementation, this would load child objects
  // For now, show a fresh canvas
  const container = document.querySelector('.main-content');
  if (container) {
    container.innerHTML = '';
    renderWorldBuilder(container);
  }
}

function navigateToLevel(index) {
  worldPath = worldPath.slice(0, index + 1);
  const container = document.querySelector('.main-content');
  if (container) {
    container.innerHTML = '';
    renderWorldBuilder(container);
  }
}


// Canvas interaction handlers
function handleCanvasMouseDown(e) {
  if (e.target.closest('.canvas-node') || e.target.closest('.canvas-controls')) return;
  canvasState.isPanning = true;
  canvasState.startPan = { x: e.clientX - canvasState.panX, y: e.clientY - canvasState.panY };
  e.target.closest('.world-builder__canvas')?.classList.add('world-builder__canvas--panning');
}

function handleCanvasMouseMove(e) {
  if (canvasState.isPanning) {
    canvasState.panX = e.clientX - canvasState.startPan.x;
    canvasState.panY = e.clientY - canvasState.startPan.y;
    updateCanvasTransform();
  }
  if (canvasState.dragNode) {
    const node = demoNodes.find(n => n.id === canvasState.dragNode);
    if (node) {
      node.position.x += e.movementX / canvasState.zoom;
      node.position.y += e.movementY / canvasState.zoom;
      const el = document.querySelector(`[data-node-id="${node.id}"]`);
      if (el) {
        el.style.left = `${node.position.x}px`;
        el.style.top = `${node.position.y}px`;
      }
    }
  }
}

function handleCanvasMouseUp(e) {
  canvasState.isPanning = false;
  canvasState.dragNode = null;
  document.querySelector('.world-builder__canvas')?.classList.remove('world-builder__canvas--panning');
  document.querySelectorAll('.canvas-node--dragging').forEach(el => el.classList.remove('canvas-node--dragging'));
}

function handleCanvasWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  zoomCanvas(delta);
}

function startNodeDrag(e, node) {
  if (e.button !== 0) return;
  e.stopPropagation();
  canvasState.dragNode = node.id;
  e.target.closest('.canvas-node')?.classList.add('canvas-node--dragging');
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
    
    const newNode = {
      id: generateId(),
      type: item.type,
      name: `New ${item.label}`,
      position: { x, y },
      color: '#6366f1',
    };
    
    demoNodes.push(newNode);
    
    const transform = document.getElementById('canvas-transform');
    if (transform) {
      transform.appendChild(createCanvasNode(newNode));
    }
    
    // Trigger save
    appStore.setState({ saveStatus: 'saving' });
    setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
  } catch(e) {}
}

function zoomCanvas(delta) {
  canvasState.zoom = Math.max(0.2, Math.min(3, canvasState.zoom + delta));
  updateCanvasTransform();
  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) zoomEl.textContent = `${Math.round(canvasState.zoom * 100)}%`;
}

function resetCanvas() {
  canvasState.zoom = 1;
  canvasState.panX = 0;
  canvasState.panY = 0;
  updateCanvasTransform();
  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) zoomEl.textContent = '100%';
}

function updateCanvasTransform() {
  const transform = document.getElementById('canvas-transform');
  if (transform) {
    transform.style.transform = `translate(${canvasState.panX}px, ${canvasState.panY}px) scale(${canvasState.zoom})`;
  }
  const grid = document.getElementById('canvas-grid');
  if (grid) {
    grid.style.backgroundSize = `${40 * canvasState.zoom}px ${40 * canvasState.zoom}px`;
    grid.style.backgroundPosition = `${canvasState.panX}px ${canvasState.panY}px`;
  }
}

function updateWorldSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px' } }, 'Current Level'));
  
  demoNodes.forEach(node => {
    sidebar.appendChild(
      h('div', { 
        class: `sidebar-item ${canvasState.selectedNode === node.id ? 'sidebar-item--active' : ''}`,
        onclick: () => selectNode(node.id),
        ondblclick: () => enterNode(node),
      },
        h('span', { class: 'sidebar-item__icon' }, ObjectIcons[node.type]),
        h('span', { class: 'sidebar-item__label' }, node.name),
      )
    );
  });
}
