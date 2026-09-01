/**
 * LoreForge Planner - World Builder
 *
 * A blank, infinite, zoomable canvas onto which the author drags shape-accurate
 * elements: a skyscraper looks like a skyscraper, a planet like a planet, a
 * mountain like a mountain (shapes live in core/world-shapes.js). Elements are
 * organized into "canvas subjects" (Cosmos, Solar System, Continents, Cities,
 * Structures, Nature, Water, …) in the left palette.
 *
 * Each element is a node with a position, size, color, and label. Nodes can be
 * dragged, resized, recolored, renamed, connected, and drilled into (every node
 * has its own nested canvas), so you can build the whole hierarchy from a solar
 * system down to a single room. Data is the same hierarchical `worldBuilder`
 * store used before, so existing worlds keep working (legacy `type` values map
 * to shapes via resolveShapeId).
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { generateId } from '../core/objects.js';
import { loadData, persistState, getActiveProjectId } from '../core/persist.js';
import { confirmDialog } from '../ui/modal.js';
import { SUBJECTS, shapeSVG, shapeLabel, resolveShapeId, safeColor } from '../core/world-shapes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_SIZE = 90;

// ─── Hierarchical World Data ─────────────────────────────────────────────────
// worldData[levelId] = { nodes: [...], connections: [...] }
// node = { id, shape, name, position:{x,y}, size, color }

const _isDemo = getActiveProjectId() === 'proj1';
const DEFAULT_WORLD = {
  root: {
    nodes: [
      { id: 'n1', shape: 'galaxy', name: 'Andromeda Reach', position: { x: 140, y: 120 }, size: 120, color: '#8b7cf6' },
      { id: 'n2', shape: 'nebula', name: 'Void Expanse', position: { x: 420, y: 180 }, size: 110, color: '#c084fc' },
      { id: 'n10', shape: 'anomaly', name: 'Quantum Rift', position: { x: 340, y: 60 }, size: 70, color: '#a855f7' },
    ],
    connections: [{ from: 'n2', to: 'n10' }],
  },
  n1: {
    nodes: [
      { id: 'n3', shape: 'sun', name: 'Sol Prime', position: { x: 130, y: 140 }, size: 100, color: '#f59e0b' },
      { id: 'n4', shape: 'ringed_planet', name: 'Kepler Array', position: { x: 400, y: 170 }, size: 100, color: '#06b6d4' },
    ],
    connections: [],
  },
  n3: {
    nodes: [
      { id: 'n5', shape: 'planet', name: 'Terra Nova', position: { x: 180, y: 140 }, size: 110, color: '#22c55e' },
    ],
    connections: [],
  },
  n5: {
    nodes: [
      { id: 'n5c1', shape: 'continent', name: 'Nova Prime', position: { x: 120, y: 120 }, size: 120, color: '#84a35a' },
      { id: 'n5c2', shape: 'ocean', name: 'The Vast Blue', position: { x: 380, y: 180 }, size: 120, color: '#3b82f6' },
      { id: 'n5c3', shape: 'mountain', name: 'Spine Range', position: { x: 250, y: 90 }, size: 90, color: '#8b8178' },
    ],
    connections: [],
  },
  n5c1: {
    nodes: [
      { id: 'c1', shape: 'metropolis', name: 'Capital', position: { x: 150, y: 140 }, size: 110, color: '#e2e8f0' },
      { id: 'c2', shape: 'castle', name: 'Old Keep', position: { x: 380, y: 130 }, size: 90, color: '#cbb994' },
      { id: 'c3', shape: 'forest', name: 'Whisperwood', position: { x: 300, y: 240 }, size: 100, color: '#3f7d4f' },
    ],
    connections: [{ from: 'c1', to: 'c2' }],
  },
};

let worldData = loadData('worldBuilder', _isDemo ? DEFAULT_WORLD : { root: { nodes: [], connections: [] } });

function saveWorld() {
  persistState('worldBuilder', worldData);
}

// ─── State ───────────────────────────────────────────────────────────────────

let canvasState = null;
function freshCanvasState() {
  return {
    zoom: 1, panX: 0, panY: 0,
    isPanning: false, startPan: { x: 0, y: 0 },
    selectedNode: null, dragNode: null, resizeNode: null,
    linkFrom: null, didMove: false,
  };
}
canvasState = freshCanvasState();

let worldPath = [{ id: 'root', name: 'Universe', shape: 'galaxy' }];
let activeSubjectId = SUBJECTS[0].id;

function getCurrentLevel() {
  const currentId = worldPath[worldPath.length - 1].id;
  if (!worldData[currentId]) worldData[currentId] = { nodes: [], connections: [] };
  return worldData[currentId];
}

/**
 * Live display name for a breadcrumb: look the node up in its PARENT level so a
 * rename is reflected immediately instead of showing the name snapshotted at
 * drill-in time. Root and any orphaned crumb fall back to the stored name.
 */
function crumbName(index) {
  const crumb = worldPath[index];
  if (index === 0) return crumb.name;
  const parentId = worldPath[index - 1].id;
  const parentLevel = worldData[parentId];
  const live = parentLevel && parentLevel.nodes.find((n) => n.id === crumb.id);
  return (live && live.name) || crumb.name;
}

/**
 * Recursively delete a node's entire nested subtree from worldData, so deleting
 * (or clearing) a node doesn't strand its grandchildren+ levels in storage.
 */
function pruneSubtree(nodeId) {
  const level = worldData[nodeId];
  if (!level) return;
  for (const child of level.nodes || []) pruneSubtree(child.id);
  delete worldData[nodeId];
}

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderWorldBuilder(container) {
  const builder = h('div', { class: 'world-builder' },
    renderWorldToolbar(),
    renderPalette(),
    renderCanvas(),
  );
  container.appendChild(builder);
  updateWorldSidebar();
}

function renderWorldToolbar() {
  const level = getCurrentLevel();
  const current = worldPath[worldPath.length - 1];
  return h('div', { class: 'world-builder__toolbar' },
    h('div', { class: 'world-builder__breadcrumbs' },
      ...worldPath.map((crumb, i) => [
        i > 0 ? h('span', { style: { color: 'var(--text-muted)', fontSize: '10px' } }, '›') : null,
        h('span', {
          class: `world-builder__crumb ${i === worldPath.length - 1 ? 'world-builder__crumb--current' : ''}`,
          onclick: () => navigateToLevel(i),
        }, crumbName(i)),
      ]).flat().filter(Boolean),
    ),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } },
        `Inside: ${shapeLabel(current.shape)} · ${level.nodes.length} element${level.nodes.length === 1 ? '' : 's'}`),
      level.linkHint ? null : null,
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Clear this canvas', onclick: clearCurrentLevel }, '🧹 Clear'),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: () => navigateToLevel(0) }, '🏠 Root'),
    ),
  );
}

// ─── Palette (subject tabs + shape swatches) ─────────────────────────────────

function renderPalette() {
  const subject = SUBJECTS.find((s) => s.id === activeSubjectId) || SUBJECTS[0];

  return h('div', { class: 'world-builder__palette' },
    h('div', { class: 'wb-palette__hint' }, 'Drag an element onto the canvas'),
    // Subject tabs
    h('div', { class: 'wb-subject-tabs' },
      ...SUBJECTS.map((s) => h('button', {
        class: `wb-subject-tab ${s.id === activeSubjectId ? 'wb-subject-tab--active' : ''}`,
        title: s.label,
        onclick: () => { activeSubjectId = s.id; rerenderPaletteOnly(); },
      }, `${s.icon}`)),
    ),
    h('div', { class: 'wb-subject-title' }, subject.label),
    // Shape swatches for the active subject
    h('div', { class: 'wb-shape-grid', id: 'wb-shape-grid' },
      ...subject.items.map((item) => h('div', {
        class: 'wb-shape-swatch',
        draggable: 'true',
        title: `Drag to add ${item.label}`,
        ondragstart: (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ shape: item.shape, label: item.label }));
          e.dataTransfer.effectAllowed = 'copy';
        },
        // Double-click drops it at canvas center as a convenience.
        ondblclick: () => addNodeAtCenter(item),
      },
        h('div', { class: 'wb-shape-swatch__art', innerHTML: swatchSVG(item.shape) }),
        h('div', { class: 'wb-shape-swatch__label' }, item.label),
      )),
    ),
  );
}

function rerenderPaletteOnly() {
  const palette = document.querySelector('.world-builder__palette');
  if (!palette) { rerender(); return; }
  const fresh = renderPalette();
  palette.replaceWith(fresh);
}

/** Small standalone SVG for a palette swatch (fixed accent color). */
function swatchSVG(shapeId) {
  return `<svg viewBox="0 0 100 100" width="40" height="40" xmlns="${SVG_NS}" `
    + `style="--el-fill:var(--accent-primary);--el-stroke:color-mix(in srgb, var(--accent-primary) 62%, #000);" `
    + `aria-hidden="true">${shapeSVG(shapeId)}</svg>`;
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
    onmouseleave: handleCanvasMouseUp,
    onwheel: handleCanvasWheel,
  });

  canvas.appendChild(h('div', { class: 'canvas-grid', id: 'canvas-grid' }));

  // Connections live UNDER the nodes so lines don't cover the art.
  canvas.appendChild(renderConnections());

  const transform = h('div', {
    id: 'canvas-transform',
    style: { position: 'absolute', inset: '0', transform: `translate(${canvasState.panX}px, ${canvasState.panY}px) scale(${canvasState.zoom})`, transformOrigin: '0 0' },
  });

  const level = getCurrentLevel();
  level.nodes.forEach((node) => transform.appendChild(createShapeNode(node)));
  canvas.appendChild(transform);

  // Zoom controls
  canvas.appendChild(h('div', { class: 'canvas-controls' },
    h('button', { class: 'canvas-controls__btn', title: 'Zoom in', onclick: () => zoomCanvas(0.1) }, '+'),
    h('div', { class: 'canvas-controls__zoom', id: 'zoom-level' }, `${Math.round(canvasState.zoom * 100)}%`),
    h('button', { class: 'canvas-controls__btn', title: 'Zoom out', onclick: () => zoomCanvas(-0.1) }, '−'),
    h('button', { class: 'canvas-controls__btn', onclick: resetCanvas, title: 'Reset view' }, '⊡'),
  ));

  // Empty state
  if (level.nodes.length === 0) {
    canvas.appendChild(h('div', { class: 'wb-empty' },
      h('div', { class: 'wb-empty__art', innerHTML: swatchSVG('galaxy') }),
      h('div', { class: 'wb-empty__title' }, 'Blank canvas'),
      h('div', { class: 'wb-empty__desc' }, 'Drag elements from the left, or double-click one to drop it here. Double-click any element on the canvas to build the world inside it.'),
    ));
  }

  return canvas;
}

function renderConnections() {
  const level = getCurrentLevel();
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'world-connections-svg';
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1;';

  level.connections.forEach((conn) => {
    const from = level.nodes.find((n) => n.id === conn.from);
    const to = level.nodes.find((n) => n.id === conn.to);
    if (!from || !to) return;
    const fs = from.size || DEFAULT_SIZE;
    const ts = to.size || DEFAULT_SIZE;
    const x1 = (from.position.x + fs / 2) * canvasState.zoom + canvasState.panX;
    const y1 = (from.position.y + fs / 2) * canvasState.zoom + canvasState.panY;
    const x2 = (to.position.x + ts / 2) * canvasState.zoom + canvasState.panX;
    const y2 = (to.position.y + ts / 2) * canvasState.zoom + canvasState.panY;

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', 'var(--accent-primary)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('opacity', '0.5');
    svg.appendChild(line);
  });
  return svg;
}

function updateConnections() {
  const oldSvg = document.getElementById('world-connections-svg');
  if (oldSvg && oldSvg.parentNode) {
    oldSvg.parentNode.replaceChild(renderConnections(), oldSvg);
  }
}

// ─── Shape Nodes ─────────────────────────────────────────────────────────────

function createShapeNode(node) {
  const size = node.size || DEFAULT_SIZE;
  const shapeId = resolveShapeId(node);
  const hasChildren = !!worldData[node.id] && worldData[node.id].nodes.length > 0;
  const isSelected = canvasState.selectedNode === node.id;
  const isLinkSource = canvasState.linkFrom === node.id;

  // Unique suffix per instance so shapes with internal ids (e.g. gas_giant's
  // clipPath) don't collide when several are on the canvas.
  const uid = `-${node.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const inner = shapeSVG(shapeId, uid);

  const el = h('div', {
    class: `wb-node ${isSelected ? 'wb-node--selected' : ''} ${isLinkSource ? 'wb-node--linking' : ''}`,
    style: {
      left: `${node.position.x}px`, top: `${node.position.y}px`,
      width: `${size}px`, height: `${size + 18}px`,
      '--el-fill': safeColor(node.color),
      '--el-stroke': `color-mix(in srgb, ${safeColor(node.color)} 62%, #000)`,
    },
    dataset: { nodeId: node.id },
    onclick: (e) => { e.stopPropagation(); handleNodeClick(node); },
    ondblclick: (e) => { e.stopPropagation(); enterNode(node); },
    onmousedown: (e) => startNodeDrag(e, node),
  },
    // The actual shape art
    h('div', { class: 'wb-node__art', style: { width: `${size}px`, height: `${size}px` },
      innerHTML: `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="${SVG_NS}" aria-hidden="true">${inner}</svg>` }),
    // Label
    h('div', { class: 'wb-node__label' }, node.name || shapeLabel(shapeId)),
    // Drill-in badge (bottom-right)
    h('button', {
      class: 'wb-node__enter',
      title: hasChildren ? `Enter (${worldData[node.id].nodes.length} inside)` : 'Build inside this element',
      style: { background: hasChildren ? 'var(--accent-primary)' : 'var(--surface-4)' },
      onmousedown: (e) => e.stopPropagation(),
      onclick: (e) => { e.stopPropagation(); enterNode(node); },
    }, '→'),
    // Toolbar (shown when selected)
    isSelected ? h('div', { class: 'wb-node__toolbar', onmousedown: (e) => e.stopPropagation() },
      h('button', { class: 'wb-node__tool', title: 'Edit name & color', onclick: (e) => { e.stopPropagation(); openEditNodeModal(node); } }, '✎'),
      h('button', { class: 'wb-node__tool', title: 'Connect to another element', onclick: (e) => { e.stopPropagation(); startLink(node); } }, '🔗'),
      h('button', { class: 'wb-node__tool', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteNode(node); } }, '🗑'),
    ) : null,
    // Resize handle (shown when selected)
    isSelected ? h('div', {
      class: 'wb-node__resize', title: 'Drag to resize',
      onmousedown: (e) => startResize(e, node),
    }) : null,
  );

  return el;
}

// ─── Interaction ─────────────────────────────────────────────────────────────

function handleNodeClick(node) {
  // If we're in "link" mode, complete the connection.
  if (canvasState.linkFrom && canvasState.linkFrom !== node.id) {
    completeLink(node);
    return;
  }
  selectNode(node.id);
}

function selectNode(nodeId) {
  canvasState.selectedNode = canvasState.selectedNode === nodeId ? null : nodeId;
  canvasState.linkFrom = null;
  // Full re-render of the transform layer so toolbars/handles appear.
  refreshNodes();
}

function refreshNodes() {
  const transform = document.getElementById('canvas-transform');
  if (!transform) { rerender(); return; }
  transform.innerHTML = '';
  getCurrentLevel().nodes.forEach((node) => transform.appendChild(createShapeNode(node)));
  updateConnections();
  updateWorldSidebar();
}

function startLink(node) {
  canvasState.linkFrom = node.id;
  refreshNodes();
}

function completeLink(targetNode) {
  const level = getCurrentLevel();
  const from = canvasState.linkFrom;
  const to = targetNode.id;
  const exists = level.connections.some((c) => (c.from === from && c.to === to) || (c.from === to && c.to === from));
  if (!exists) { level.connections.push({ from, to }); saveWorld(); }
  canvasState.linkFrom = null;
  refreshNodes();
}

function enterNode(node) {
  if (!worldData[node.id]) worldData[node.id] = { nodes: [], connections: [] };
  worldPath.push({ id: node.id, name: node.name, shape: resolveShapeId(node) });
  canvasState = freshCanvasState();
  rerender();
}

function navigateToLevel(index) {
  worldPath = worldPath.slice(0, index + 1);
  canvasState = freshCanvasState();
  rerender();
}

async function clearCurrentLevel() {
  const level = getCurrentLevel();
  if (level.nodes.length === 0) return;
  const ok = await confirmDialog({ title: 'Clear this canvas?', message: `Remove all ${level.nodes.length} elements on this level? Nested worlds inside them are also removed.`, confirmLabel: 'Clear', danger: true });
  if (!ok) return;
  level.nodes.forEach((n) => pruneSubtree(n.id));
  level.nodes = [];
  level.connections = [];
  saveWorld();
  rerender();
}

// ─── Canvas mouse / pan / drag / resize ──────────────────────────────────────

function handleCanvasMouseDown(e) {
  if (e.target.closest('.wb-node') || e.target.closest('.canvas-controls')) return;
  // Clicking empty canvas clears selection + any pending link.
  if (canvasState.selectedNode || canvasState.linkFrom) {
    canvasState.selectedNode = null;
    canvasState.linkFrom = null;
    refreshNodes();
  }
  canvasState.isPanning = true;
  canvasState.startPan = { x: e.clientX - canvasState.panX, y: e.clientY - canvasState.panY };
}

function handleCanvasMouseMove(e) {
  if (canvasState.isPanning) {
    canvasState.panX = e.clientX - canvasState.startPan.x;
    canvasState.panY = e.clientY - canvasState.startPan.y;
    updateCanvasTransform();
    updateConnections();
    return;
  }
  if (canvasState.resizeNode) {
    const node = getCurrentLevel().nodes.find((n) => n.id === canvasState.resizeNode);
    if (node) {
      canvasState.didMove = true;
      const delta = (e.movementX + e.movementY) / 2 / canvasState.zoom;
      node.size = Math.max(36, Math.min(360, (node.size || DEFAULT_SIZE) + delta));
      const el = document.querySelector(`[data-node-id="${cssEscape(node.id)}"]`);
      if (el) applyNodeSize(el, node);
      updateConnections();
    }
    return;
  }
  if (canvasState.dragNode) {
    const node = getCurrentLevel().nodes.find((n) => n.id === canvasState.dragNode);
    if (node) {
      canvasState.didMove = true;
      node.position.x += e.movementX / canvasState.zoom;
      node.position.y += e.movementY / canvasState.zoom;
      const el = document.querySelector(`[data-node-id="${cssEscape(node.id)}"]`);
      if (el) { el.style.left = `${node.position.x}px`; el.style.top = `${node.position.y}px`; }
      updateConnections();
    }
  }
}

function handleCanvasMouseUp() {
  // Only persist if a drag/resize actually changed something — a plain
  // click-to-select shouldn't write to storage.
  if ((canvasState.dragNode || canvasState.resizeNode) && canvasState.didMove) saveWorld();
  canvasState.isPanning = false;
  canvasState.dragNode = null;
  canvasState.resizeNode = null;
  canvasState.didMove = false;
}

function startNodeDrag(e, node) {
  if (e.button !== 0) return;
  if (e.target.closest('.wb-node__resize') || e.target.closest('.wb-node__toolbar') || e.target.closest('.wb-node__enter')) return;
  e.stopPropagation();
  canvasState.dragNode = node.id;
}

function startResize(e, node) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  canvasState.resizeNode = node.id;
}

function applyNodeSize(el, node) {
  const size = node.size || DEFAULT_SIZE;
  el.style.width = `${size}px`;
  el.style.height = `${size + 18}px`;
  const art = el.querySelector('.wb-node__art');
  if (art) {
    art.style.width = `${size}px`;
    art.style.height = `${size}px`;
    const svg = art.querySelector('svg');
    if (svg) { svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); }
  }
}

function handleCanvasWheel(e) {
  e.preventDefault();
  zoomCanvas(e.deltaY > 0 ? -0.06 : 0.06);
}

function handleCanvasDrop(e) {
  e.preventDefault();
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;
  try {
    const item = JSON.parse(data);
    const canvasEl = e.target.closest('.world-builder__canvas');
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvasState.panX) / canvasState.zoom - DEFAULT_SIZE / 2;
    const y = (e.clientY - rect.top - canvasState.panY) / canvasState.zoom - DEFAULT_SIZE / 2;
    addNode(item, x, y);
  } catch (_) { /* malformed drag payload — ignore */ }
}

function addNode(item, x, y) {
  const level = getCurrentLevel();
  level.nodes.push({
    id: generateId(),
    shape: item.shape,
    name: item.label,
    position: { x, y },
    size: DEFAULT_SIZE,
    color: defaultColorFor(item.shape),
  });
  saveWorld();
  rerender();
}

/** Drop an element at the current viewport center (palette double-click). */
function addNodeAtCenter(item) {
  const canvasEl = document.querySelector('.world-builder__canvas');
  const rect = canvasEl ? canvasEl.getBoundingClientRect() : { width: 600, height: 400 };
  const x = (rect.width / 2 - canvasState.panX) / canvasState.zoom - DEFAULT_SIZE / 2;
  const y = (rect.height / 2 - canvasState.panY) / canvasState.zoom - DEFAULT_SIZE / 2;
  addNode(item, x, y);
}

/** A pleasant default color per shape family so a fresh drop isn't all indigo. */
function defaultColorFor(shape) {
  const map = {
    sun: '#f59e0b', binary_star: '#fbbf24', galaxy: '#8b7cf6', nebula: '#c084fc',
    star_cluster: '#fde047', black_hole: '#6366f1', comet: '#93c5fd',
    planet: '#22c55e', ringed_planet: '#06b6d4', gas_giant: '#e0a458', moon: '#cbd5e1',
    asteroid: '#9ca3af', asteroid_belt: '#9ca3af',
    ocean: '#3b82f6', lake: '#38bdf8', river: '#38bdf8', waterfall: '#7dd3fc', bay: '#2563eb',
    mountain: '#94a3b8', volcano: '#78716c', hill: '#84a35a', tree: '#3f7d4f', pine_tree: '#2f6b45',
    forest: '#3f7d4f', cave: '#57534e', canyon: '#b45309',
    desert: '#eab308', swamp: '#4d7c3f', tundra: '#bae6fd',
    continent: '#84a35a', island: '#a3b18a', country: '#c084fc', region: '#a78bfa',
    metropolis: '#e2e8f0', city: '#cbd5e1', town: '#d6c9a8', village: '#c9b892', district: '#a5b4fc',
    skyscraper: '#93c5fd', tower: '#cbb994', castle: '#cbb994', fortress: '#a8a29e',
    temple: '#e5e7eb', monument: '#d1d5db', house: '#d6a77a', hut: '#b98b5e', tent: '#e07a5f',
    factory: '#78716c', bridge: '#a8a29e', wall: '#a8a29e',
    artifact: '#f0abfc', crystal: '#67e8f9', anomaly: '#c084fc', void_conduit: '#8b5cf6', ruins: '#a8a29e',
    space_station: '#60a5fa', spaceship: '#e5e7eb', fleet: '#94a3b8', satellite: '#a5b4fc',
    megastructure: '#818cf8', portal: '#a855f7',
  };
  return map[shape] || 'var(--accent-primary)';
}

// ─── Zoom / Pan ──────────────────────────────────────────────────────────────

function zoomCanvas(delta) {
  canvasState.zoom = Math.max(0.25, Math.min(3, canvasState.zoom + delta));
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

// ─── Edit / Delete ────────────────────────────────────────────────────────────

function openEditNodeModal(node) {
  const NODE_COLORS = ['#8b7cf6', '#c084fc', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#3b82f6', '#84cc16', '#e2e8f0', '#78716c'];
  const state = { name: node.name, color: node.color };

  const shapeId = resolveShapeId(node);
  const preview = h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '12px' } });
  const paintPreview = () => {
    const c = safeColor(state.color);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', '72');
    svg.setAttribute('height', '72');
    svg.style.setProperty('--el-fill', c);
    svg.style.setProperty('--el-stroke', `color-mix(in srgb, ${c} 62%, #000)`);
    svg.innerHTML = shapeSVG(shapeId);
    preview.innerHTML = '';
    preview.appendChild(svg);
  };
  paintPreview();

  const colorGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    ...NODE_COLORS.map((c) => h('div', {
      style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
      onclick: (e) => {
        state.color = c;
        e.currentTarget.parentElement.querySelectorAll('div').forEach((d) => { d.style.border = '2px solid transparent'; });
        e.currentTarget.style.border = '2px solid white';
        paintPreview(); // live-update the preview to the picked color
      },
    })),
  );

  const content = h('div', {},
    preview,
    h('div', { style: { marginBottom: '12px' } },
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Name'),
      h('input', { class: 'input', value: state.name, oninput: (e) => { state.name = e.target.value; } }),
    ),
    h('div', {},
      h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, 'Color'),
      colorGrid,
    ),
  );

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
        } }, 'Save'),
      ),
    ),
  );
  document.body.appendChild(overlay);
}

async function deleteNode(node) {
  const ok = await confirmDialog({ title: `Delete "${node.name}"?`, message: 'This element and everything nested inside it will be permanently removed.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const level = getCurrentLevel();
  const idx = level.nodes.findIndex((n) => n.id === node.id);
  if (idx !== -1) level.nodes.splice(idx, 1);
  level.connections = level.connections.filter((c) => c.from !== node.id && c.to !== node.id);
  pruneSubtree(node.id);
  if (canvasState.selectedNode === node.id) canvasState.selectedNode = null;
  saveWorld();
  rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cssEscape(id) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id);
  return String(id).replace(/["\\]/g, '\\$&');
}

/** Small sidebar icon SVG with a sanitized color (safe for innerHTML). */
function sidebarIconSVG(shapeId, color) {
  const c = safeColor(color);
  return `<svg viewBox="0 0 100 100" width="16" height="16" xmlns="${SVG_NS}" `
    + `style="--el-fill:${c};--el-stroke:color-mix(in srgb, ${c} 62%, #000);" aria-hidden="true">${shapeSVG(shapeId)}</svg>`;
}

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderWorldBuilder(container); });
}

function updateWorldSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const level = getCurrentLevel();
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px' } }, `Inside: ${worldPath[worldPath.length - 1].name}`));

  level.nodes.forEach((node) => {
    const hasChildren = !!worldData[node.id] && worldData[node.id].nodes.length > 0;
    const shapeId = resolveShapeId(node);
    sidebar.appendChild(h('div', {
      class: `sidebar-item ${canvasState.selectedNode === node.id ? 'sidebar-item--active' : ''}`,
      onclick: () => selectNode(node.id),
      ondblclick: () => enterNode(node),
    },
      h('span', { class: 'sidebar-item__icon', style: { display: 'inline-flex' },
        innerHTML: sidebarIconSVG(shapeId, node.color) }),
      h('span', { class: 'sidebar-item__label' }, node.name),
      hasChildren ? h('span', { class: 'sidebar-item__count' }, `${worldData[node.id].nodes.length}`) : null,
    ));
  });

  if (level.nodes.length === 0) {
    sidebar.appendChild(h('div', { style: { padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Drag elements from the palette'));
  }
}
