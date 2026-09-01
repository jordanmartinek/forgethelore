/**
 * LoreForge Planner - Fantasy / Sci-Fi Map Painter
 *
 * An Inkarnate-style map maker: paint textured terrain onto a procedurally
 * generated surface (antique parchment for fantasy, star chart / blueprint for
 * sci-fi), scatter illustrated stamps (mountains, forests, towns, stations…),
 * drop styled labels (including curved water labels), toggle layers, undo/redo,
 * and export a high-resolution PNG.
 *
 * Architecture:
 *   - A stack of absolutely-positioned <canvas> elements inside a viewport:
 *       #paper   — procedural surface (never edited directly)
 *       #terrain — the raster paint layer (brush + erase)
 *       #stamps  — illustrated SVG stamps, re-rendered from the model
 *       #labels  — text labels, re-rendered from the model
 *     Stamps/labels are model-driven (data in the project) so they can be
 *     moved/deleted and survive reload; terrain is a raster we persist as a
 *     PNG data URL.
 *   - All geometry/palette/serialization math lives in core/map-engine.js.
 *   - Persistence via loadData/persistState('fantasyMap').
 */

import { h } from '../core/renderer.js';
import { loadData, persistState } from '../core/persist.js';
import { toastSuccess, toastInfo } from '../ui/toast.js';
import { shapeSVG, safeColor } from '../core/world-shapes.js';
import {
  terrainsForStyle, getTerrain,
  getSurface, surfacesForStyle, defaultSurfaceForStyle,
  MAP_STYLES, normalizeStyle,
  defaultBrush, clamp, brushDabs,
  defaultStampOptions, scatterStamps,
  labelStyle, labelBaseline,
  normalizeMapProject,
  exportDimensions,
} from '../core/map-engine.js';

const STORE_KEY = 'fantasyMap';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Stamp catalog per style — a curated subset of world-shapes that read well as
// map icons. (The full 61-shape library is available; these are the map-useful
// ones grouped for the palette.)
const STAMP_SETS = {
  fantasy: [
    { shape: 'mountain', label: 'Mountains' }, { shape: 'volcano', label: 'Volcano' },
    { shape: 'hill', label: 'Hills' }, { shape: 'forest', label: 'Forest' },
    { shape: 'pine_tree', label: 'Pines' }, { shape: 'tree', label: 'Tree' },
    { shape: 'metropolis', label: 'City' }, { shape: 'town', label: 'Town' },
    { shape: 'village', label: 'Village' }, { shape: 'castle', label: 'Castle' },
    { shape: 'tower', label: 'Tower' }, { shape: 'temple', label: 'Temple' },
    { shape: 'ruins', label: 'Ruins' }, { shape: 'cave', label: 'Cave' },
    { shape: 'lake', label: 'Lake' }, { shape: 'waterfall', label: 'Falls' },
  ],
  scifi: [
    { shape: 'sun', label: 'Star' }, { shape: 'planet', label: 'Planet' },
    { shape: 'ringed_planet', label: 'Ringed World' }, { shape: 'gas_giant', label: 'Gas Giant' },
    { shape: 'moon', label: 'Moon' }, { shape: 'asteroid_belt', label: 'Belt' },
    { shape: 'space_station', label: 'Station' }, { shape: 'spaceship', label: 'Ship' },
    { shape: 'fleet', label: 'Fleet' }, { shape: 'satellite', label: 'Satellite' },
    { shape: 'megastructure', label: 'Megastructure' }, { shape: 'portal', label: 'Jump Gate' },
    { shape: 'metropolis', label: 'Colony' }, { shape: 'anomaly', label: 'Anomaly' },
    { shape: 'void_conduit', label: 'Wormhole' }, { shape: 'nebula', label: 'Nebula' },
  ],
};

const STAMP_COLORS = {
  mountain: '#8a8178', volcano: '#a8785c', hill: '#84a35a', forest: '#3f7d4f', pine_tree: '#2f6b45',
  tree: '#3f7d4f', metropolis: '#8a7a5a', town: '#8a7a5a', village: '#9c8a63', castle: '#b0a080',
  tower: '#b0a080', temple: '#c8bda0', ruins: '#9a8f7a', cave: '#57534e', lake: '#3f6b8a', waterfall: '#5a8fa8',
  sun: '#f5b73c', planet: '#4fa3d9', ringed_planet: '#6fc0c0', gas_giant: '#e0a458', moon: '#cbd5e1',
  asteroid_belt: '#9ca3af', space_station: '#7fd0ff', spaceship: '#cfe3ff', fleet: '#9fb8d0',
  satellite: '#a5c4ff', megastructure: '#8fa8ff', portal: '#c07fff', anomaly: '#c084fc', void_conduit: '#8b7cf6',
  nebula: '#b06fd0',
};

// ─── State ────────────────────────────────────────────────────────────────────

let project = null;
let tool = 'brush';            // brush | erase | stamp | label | pan | select
let activeTerrain = 'grass';
let activeStamp = 'mountain';
let brush = defaultBrush();
let stampOpts = defaultStampOptions();
let labelRole = 'place';

let undoStack = [];            // terrain PNG data URLs (raster history)
let redoStack = [];

let ctxTerrain = null;         // 2d context of the terrain canvas
let painting = false;
let strokePath = [];           // for stamp scatter
let lastPoint = null;
let selectedStampId = null;
let selectedLabelId = null;
let dragging = null;           // { kind:'stamp'|'label', id, offX, offY }

// The element this module was rendered into (so re-renders stay scoped to the
// World Builder's mode body instead of clobbering the whole #main-content and
// dropping the Diagram/Map toggle).
let hostContainer = null;
// Terrain painting is disabled until the saved raster has finished restoring,
// so an early stroke can't be overpainted by a late async restore (and its
// undo snapshot can't capture a blank canvas).
let terrainReady = false;
// Bumped on every stamp-layer render; async image draws check it so callbacks
// from a superseded render can't paint onto an already-cleared canvas.
let stampRenderToken = 0;
// Decoded stamp-image cache keyed by shape|color so we don't re-encode/re-decode
// the same SVG on every redraw (also makes ids deterministic — see stampSVG).
const stampImgCache = new Map();

// ─── Load / save ──────────────────────────────────────────────────────────────

function load() {
  project = normalizeMapProject(loadData(STORE_KEY, null));
}

function save() {
  project.updatedAt = Date.now();
  persistState(STORE_KEY, project);
}

// ─── Main render ────────────────────────────────────────────────────────────

export function renderFantasyMap(container) {
  if (!project) load();
  hostContainer = container;
  terrainReady = false;
  const root = h('div', { class: 'fmap' },
    renderToolbar(),
    renderPalette(),
    renderStage(),
  );
  container.appendChild(root);

  // Canvases exist now; paint the procedural surface + restore terrain.
  requestAnimationFrame(() => {
    setupCanvases();
    paintSurface();
    restoreTerrain();      // flips terrainReady=true when the raster is in place
    renderStampsLayer();
    renderLabelsLayer();
  });
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function renderToolbar() {
  const tools = [
    { id: 'brush', icon: '🖌️', label: 'Terrain brush' },
    { id: 'stamp', icon: '🌲', label: 'Stamp' },
    { id: 'label', icon: '🔤', label: 'Label' },
    { id: 'erase', icon: '🧽', label: 'Erase terrain' },
    { id: 'select', icon: '🖐️', label: 'Move stamps/labels' },
  ];
  return h('div', { class: 'fmap__toolbar' },
    // Style switcher (fantasy vs sci-fi)
    h('div', { class: 'fmap__styles' },
      ...MAP_STYLES.map((s) => h('button', {
        class: `fmap__style ${project.style === s.id ? 'fmap__style--active' : ''}`,
        title: s.label,
        onclick: () => switchStyle(s.id),
      }, `${s.icon} ${s.label}`)),
    ),
    // Surface picker
    h('select', { class: 'input fmap__surface', title: 'Map surface',
      onchange: (e) => { project.surface = e.target.value; paintSurface(); save(); },
    },
      ...surfacesForStyle(project.style).map((s) => h('option', {
        value: s.id, selected: project.surface === s.id ? 'selected' : null,
      }, s.label)),
    ),
    // Tools
    h('div', { class: 'fmap__tools' },
      ...tools.map((t) => h('button', {
        class: `fmap__tool ${tool === t.id ? 'fmap__tool--active' : ''}`,
        title: t.label,
        dataset: { tool: t.id },
        onclick: () => setTool(t.id),
      }, t.icon)),
    ),
    // Undo/redo
    h('div', { class: 'fmap__history' },
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Undo (terrain)', onclick: undo }, '↶'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Redo (terrain)', onclick: redo }, '↷'),
    ),
    // Actions
    h('div', { class: 'fmap__actions' },
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Clear map', onclick: clearMap }, '🗑 Clear'),
      h('button', { class: 'btn btn--sm btn--primary', title: 'Export PNG', onclick: exportPNG }, '⬇ Export PNG'),
    ),
  );
}

// ─── Palette (context-sensitive to the active tool) ────────────────────────────

function renderPalette() {
  return h('div', { class: 'fmap__palette', id: 'fmap-palette' }, paletteBody());
}

function refreshPalette() {
  const el = document.getElementById('fmap-palette');
  if (el) { el.innerHTML = ''; el.appendChild(paletteBody()); }
}

function paletteBody() {
  if (tool === 'stamp') return stampPalette();
  if (tool === 'label') return labelPalette();
  if (tool === 'brush' || tool === 'erase') return brushPalette();
  return hintPalette();
}

function brushPalette() {
  const terrains = terrainsForStyle(project.style);
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, tool === 'erase' ? 'Erase terrain' : 'Terrain'),
    tool === 'brush' ? h('div', { class: 'fmap__swatches' },
      ...terrains.map((t) => h('button', {
        class: `fmap__swatch ${activeTerrain === t.id ? 'fmap__swatch--active' : ''}`,
        title: t.label,
        style: { background: `linear-gradient(135deg, ${t.base}, ${t.shade})` },
        onclick: () => { activeTerrain = t.id; refreshPalette(); },
      }, h('span', { class: 'fmap__swatch-label' }, `${t.icon} ${t.label}`))),
    ) : null,
    sliderRow('Size', brush.size, 8, 220, (v) => { brush.size = v; }),
    sliderRow('Softness', Math.round(brush.softness * 100), 0, 100, (v) => { brush.softness = v / 100; }),
    sliderRow('Flow', Math.round(brush.flow * 100), 5, 100, (v) => { brush.flow = v / 100; }),
  );
}

function stampPalette() {
  const set = STAMP_SETS[project.style] || STAMP_SETS.fantasy;
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, 'Stamps'),
    h('div', { class: 'fmap__stamp-grid' },
      ...set.map((it) => h('button', {
        class: `fmap__stamp ${activeStamp === it.shape ? 'fmap__stamp--active' : ''}`,
        title: it.label,
        onclick: () => { activeStamp = it.shape; refreshPalette(); },
      },
        h('span', { class: 'fmap__stamp-art', innerHTML: stampSVG(it.shape, stampColor(it.shape), 34) }),
        h('span', { class: 'fmap__stamp-label' }, it.label),
      )),
    ),
    sliderRow('Size', stampOpts.size, 16, 140, (v) => { stampOpts.size = v; }),
    sliderRow('Density', Math.round(stampOpts.density * 10), 5, 80, (v) => { stampOpts.density = v / 10; }),
    sliderRow('Jitter', Math.round(stampOpts.jitter * 100), 0, 100, (v) => { stampOpts.jitter = v / 100; }),
    h('div', { class: 'fmap__pal-hint' }, 'Drag on the map to scatter, or click to place one.'),
  );
}

function labelPalette() {
  const roles = [
    { id: 'region', label: 'Region' },
    { id: 'place', label: 'Place' },
    { id: 'water', label: project.style === 'scifi' ? 'Sector' : 'Water' },
  ];
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, 'Labels'),
    h('div', { class: 'fmap__roles' },
      ...roles.map((r) => h('button', {
        class: `fmap__role ${labelRole === r.id ? 'fmap__role--active' : ''}`,
        onclick: () => { labelRole = r.id; refreshPalette(); },
      }, r.label)),
    ),
    h('div', { class: 'fmap__pal-hint' }, 'Click the map to place a label, then type. Double-click a label to edit; drag to move.'),
  );
}

function hintPalette() {
  return h('div', { class: 'fmap__pal-hint' }, 'Pick a tool. Drag stamps and labels with the move tool. Scroll wheel is free — the map is fixed-size for crisp export.');
}

function sliderRow(label, value, min, max, onInput) {
  return h('label', { class: 'fmap__slider' },
    h('span', {}, label),
    h('input', {
      type: 'range', min: String(min), max: String(max), value: String(value),
      oninput: (e) => onInput(parseInt(e.target.value, 10)),
    }),
  );
}

// ─── Stage (canvas stack) ──────────────────────────────────────────────────────

function renderStage() {
  const w = project.width;
  const hgt = project.height;
  return h('div', { class: 'fmap__stage', id: 'fmap-stage' },
    h('div', { class: 'fmap__frame', style: { width: `${w}px`, height: `${hgt}px` } },
      canvasEl('fmap-paper', w, hgt, 0),
      canvasEl('fmap-terrain', w, hgt, 1),
      canvasEl('fmap-stamps', w, hgt, 2),
      canvasEl('fmap-labels', w, hgt, 3),
      // Pointer surface on top captures all interaction.
      h('div', {
        class: 'fmap__pointer', id: 'fmap-surface',
        style: { width: `${w}px`, height: `${hgt}px` },
        onpointerdown: onPointerDown,
        onpointermove: onPointerMove,
        onpointerup: onPointerUp,
        onpointerleave: onPointerUp,
        ondblclick: onDoubleClick,
      }),
    ),
  );
}

function canvasEl(id, w, hgt, z) {
  const c = h('canvas', { id, class: 'fmap__canvas', width: String(w), height: String(hgt), style: { zIndex: String(z) } });
  return c;
}

function setupCanvases() {
  const t = document.getElementById('fmap-terrain');
  if (t) {
    ctxTerrain = t.getContext('2d');
    applyLayerOpacity();
  }
}

function applyLayerOpacity() {
  for (const id of ['paper', 'terrain', 'stamps', 'labels']) {
    const c = document.getElementById(`fmap-${id}`);
    const st = project.layers[id] || { visible: true, opacity: 1 };
    if (c) { c.style.opacity = st.visible ? String(st.opacity) : '0'; }
  }
}

// ─── Procedural surface ─────────────────────────────────────────────────────

function paintSurface() {
  const c = document.getElementById('fmap-paper');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width, hgt = c.height;
  const surf = getSurface(project.surface);
  ctx.clearRect(0, 0, w, hgt);

  // Base radial gradient (center -> edge).
  const g = ctx.createRadialGradient(w / 2, hgt / 2, Math.min(w, hgt) * 0.1, w / 2, hgt / 2, Math.max(w, hgt) * 0.75);
  g.addColorStop(0, surf.base);
  g.addColorStop(1, surf.edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hgt);

  if (surf.kind === 'stars') paintStarfield(ctx, w, hgt, surf);
  else if (surf.kind === 'grid') paintGrid(ctx, w, hgt, surf);
  else paintPaperGrain(ctx, w, hgt, surf);

  // Vignette.
  const vg = ctx.createRadialGradient(w / 2, hgt / 2, Math.min(w, hgt) * 0.45, w / 2, hgt / 2, Math.max(w, hgt) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, surf.vignette);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, hgt);
}

function paintPaperGrain(ctx, w, hgt, surf) {
  // Speckle grain for an aged-paper feel.
  const n = Math.floor(w * hgt * surf.grain * 0.02);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * hgt;
    const a = Math.random() * 0.06;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(90,60,30,${a})` : `rgba(255,240,210,${a})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  // A few faint blotches.
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * w, y = Math.random() * hgt, r = 30 + Math.random() * 90;
    const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, 'rgba(120,90,50,0.05)');
    bg.addColorStop(1, 'rgba(120,90,50,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function paintStarfield(ctx, w, hgt, surf) {
  const n = Math.floor(w * hgt * surf.grain * 0.0012);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * hgt;
    const r = Math.random() * 1.3 + 0.2;
    const a = 0.3 + Math.random() * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // A couple of soft nebula clouds.
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * w, y = Math.random() * hgt, r = 120 + Math.random() * 220;
    const hue = ['120,80,200', '60,120,220', '200,80,160'][i % 3];
    const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, `rgba(${hue},0.12)`);
    bg.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function paintGrid(ctx, w, hgt, surf) {
  ctx.strokeStyle = 'rgba(120,200,255,0.14)';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hgt); ctx.stroke(); }
  for (let y = step; y < hgt; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(120,200,255,0.28)';
  for (let x = step * 5; x < w; x += step * 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hgt); ctx.stroke(); }
  for (let y = step * 5; y < hgt; y += step * 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

// ─── Terrain painting ─────────────────────────────────────────────────────────

function pointFromEvent(e) {
  const surface = document.getElementById('fmap-surface');
  const rect = surface.getBoundingClientRect();
  const scaleX = project.width / rect.width;
  const scaleY = project.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function dab(pt, terrain, erase) {
  if (!ctxTerrain) return;
  const r = brush.size / 2;
  ctxTerrain.save();
  if (erase) {
    ctxTerrain.globalCompositeOperation = 'destination-out';
    const g = ctxTerrain.createRadialGradient(pt.x, pt.y, r * (1 - brush.softness), pt.x, pt.y, r);
    g.addColorStop(0, `rgba(0,0,0,${brush.flow})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctxTerrain.fillStyle = g;
  } else {
    ctxTerrain.globalCompositeOperation = 'source-over';
    // Blend two terrain tones so fills never read flat.
    const useShade = Math.random() > 0.5;
    const col = useShade ? terrain.shade : terrain.base;
    const g = ctxTerrain.createRadialGradient(pt.x, pt.y, r * (1 - brush.softness), pt.x, pt.y, r);
    g.addColorStop(0, hexA(col, brush.flow));
    g.addColorStop(1, hexA(col, 0));
    ctxTerrain.fillStyle = g;
  }
  ctxTerrain.beginPath();
  ctxTerrain.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctxTerrain.fill();
  ctxTerrain.restore();
}

function hexA(hex, alpha) {
  const c = safeColor(hex, '#7a8f4a');
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const num = parseInt(m[1], 16);
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${clamp(alpha, 0, 1)})`;
}

// ─── Pointer handling ──────────────────────────────────────────────────────────

function onPointerDown(e) {
  e.preventDefault();
  const pt = pointFromEvent(e);
  document.getElementById('fmap-surface').setPointerCapture?.(e.pointerId);

  if (tool === 'brush' || tool === 'erase') {
    // Don't paint until the saved terrain has restored, or a late async restore
    // would overpaint this stroke and the undo snapshot would be blank.
    if (!terrainReady) return;
    pushUndo();
    painting = true;
    lastPoint = pt;
    dab(pt, getTerrain(activeTerrain), tool === 'erase');
  } else if (tool === 'stamp') {
    painting = true;
    strokePath = [pt];
  } else if (tool === 'label') {
    createLabelAt(pt);
  } else if (tool === 'select') {
    beginDrag(pt);
  }
}

function onPointerMove(e) {
  if (!painting && !dragging) return;
  const pt = pointFromEvent(e);

  if ((tool === 'brush' || tool === 'erase') && painting && lastPoint) {
    const dabs = brushDabs(lastPoint, pt, brush);
    const terrain = getTerrain(activeTerrain);
    dabs.forEach((d) => dab(d, terrain, tool === 'erase'));
    lastPoint = pt;
  } else if (tool === 'stamp' && painting) {
    strokePath.push(pt);
  } else if (tool === 'select' && dragging) {
    moveDrag(pt);
  }
}

function onPointerUp() {
  if (tool === 'stamp' && painting) commitStampStroke();
  if ((tool === 'brush' || tool === 'erase') && painting) { schedulePersistTerrain(); }
  // A drag of a stamp/label ends here — persist its new position.
  if (tool === 'select' && dragging) save();
  painting = false;
  lastPoint = null;
  dragging = null;
}

function onDoubleClick(e) {
  const pt = pointFromEvent(e);
  const label = hitLabel(pt);
  if (label) editLabel(label);
}

// ─── Stamps ────────────────────────────────────────────────────────────────────

function commitStampStroke() {
  const opts = { ...stampOpts, seed: (Date.now() & 0xffff) || 1 };
  const placements = scatterStamps(strokePath.length ? strokePath : [lastPoint || strokePath[0]], opts);
  placements.forEach((p) => {
    project.stamps.push({
      id: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      shape: activeStamp,
      x: p.x, y: p.y, size: p.size,
      color: stampColor(activeStamp),
    });
  });
  strokePath = [];
  renderStampsLayer();
  save();
}

function renderStampsLayer() {
  const c = document.getElementById('fmap-stamps');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  // Depth-sort by y so nearer (lower) stamps overlap farther ones.
  const sorted = project.stamps.slice().sort((a, b) => a.y - b.y);
  if (sorted.length === 0) return;

  // Guard async draws: only the most recent render may paint. A superseded
  // render's image callbacks are ignored so they can't draw onto a canvas the
  // newer render already cleared (which caused flicker/stale stamps on drag).
  const token = ++stampRenderToken;

  const drawOne = (s, img) => {
    if (token !== stampRenderToken) return; // superseded
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.max(2, s.size * 0.06);
    ctx.shadowOffsetY = Math.max(1, s.size * 0.04);
    if (s.id === selectedStampId) { ctx.shadowColor = 'rgba(80,140,255,0.8)'; ctx.shadowBlur = 12; }
    ctx.drawImage(img, s.x - s.size / 2, s.y - s.size, s.size, s.size);
    ctx.restore();
  };

  sorted.forEach((s) => {
    const cached = getStampImage(s.shape, s.color);
    if (cached.complete && cached.naturalWidth) {
      drawOne(s, cached);
    } else {
      cached.addEventListener('load', () => drawOne(s, cached), { once: true });
    }
  });
}

/** Cached, decoded stamp image keyed by shape|color (deterministic ids). */
function getStampImage(shape, color) {
  const key = `${shape}|${color}`;
  let img = stampImgCache.get(key);
  if (!img) {
    img = new Image();
    img.src = svgDataUrl(stampSVG(shape, color, 100));
    stampImgCache.set(key, img);
  }
  return img;
}

function stampSVG(shape, color, size) {
  const c = safeColor(color, '#8a8178');
  // Deterministic internal ids (uid = shape) so identical stamps produce
  // byte-identical SVG -> the image cache above actually hits.
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100" width="${size}" height="${size}" `
    + `style="--el-fill:${c};--el-stroke:color-mix(in srgb, ${c} 62%, #000);">${shapeSVG(shape, `-${shape}`)}</svg>`;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function stampColor(shape) {
  return STAMP_COLORS[shape] || '#8a8178';
}

// ─── Labels ────────────────────────────────────────────────────────────────────

function createLabelAt(pt) {
  const preset = labelStyle(labelRole, project.style);
  const label = {
    id: `lb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    text: labelRole === 'region' ? 'New Region' : labelRole === 'water' ? (project.style === 'scifi' ? 'Sector' : 'The Sea') : 'New Place',
    x: pt.x, y: pt.y, size: preset.size, curve: 0, role: labelRole,
    color: preset.color,
  };
  project.labels.push(label);
  renderLabelsLayer();
  save();
  editLabel(label);
}

function renderLabelsLayer() {
  const c = document.getElementById('fmap-labels');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  project.labels.forEach((lb) => drawLabel(ctx, lb));
}

function drawLabel(ctx, lb) {
  const preset = labelStyle(lb.role || 'place', project.style);
  const text = preset.caps ? String(lb.text).toUpperCase() : String(lb.text);
  const size = lb.size || preset.size;
  ctx.save();
  ctx.font = `${preset.italic ? 'italic ' : ''}600 ${size}px Georgia, 'Palatino Linotype', serif`;
  ctx.fillStyle = safeColor(lb.color || preset.color, '#2a2118');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = project.style === 'scifi' ? 'rgba(0,20,40,0.7)' : 'rgba(255,245,220,0.7)';
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.lineJoin = 'round';

  const spacing = preset.letterSpacing || 0;
  const chars = [...text];
  // Approx total width with letter spacing.
  let total = 0;
  const widths = chars.map((ch) => { const w = ctx.measureText(ch).width; total += w + spacing; return w; });
  total -= spacing;

  const curve = lb.curve || 0;
  if (Math.abs(curve) < 0.001) {
    // Straight, letter-spaced baseline.
    let x = lb.x - total / 2;
    for (let i = 0; i < chars.length; i++) {
      const cx = x + widths[i] / 2;
      ctx.strokeText(chars[i], cx, lb.y);
      ctx.fillText(chars[i], cx, lb.y);
      x += widths[i] + spacing;
    }
  } else {
    const slots = labelBaseline(lb.x, lb.y, total, chars.length, curve);
    for (let i = 0; i < chars.length; i++) {
      const s = slots[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.strokeText(chars[i], 0, 0);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
  }
  if (lb.id === selectedLabelId) {
    ctx.strokeStyle = 'rgba(80,140,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lb.x - total / 2 - 6, lb.y - size / 2 - 6, total + 12, size + 12);
  }
  ctx.restore();
}

function hitLabel(pt) {
  // Search topmost-first. Width is estimated from glyph count, letter-spacing,
  // and caps (region/place labels render uppercase, which is wider); a generous
  // pad keeps clicks near the visible ends of long/curved labels hitting.
  for (let i = project.labels.length - 1; i >= 0; i--) {
    const lb = project.labels[i];
    const preset = labelStyle(lb.role || 'place', project.style);
    const size = lb.size || preset.size;
    const n = String(lb.text).length;
    const w = Math.max(60, n * size * 0.62 + n * (preset.letterSpacing || 0));
    const half = size * 0.75;
    if (Math.abs(pt.x - lb.x) < w / 2 + 12 && Math.abs(pt.y - lb.y) < half + 10) return lb;
  }
  return null;
}

function hitStamp(pt) {
  for (let i = project.stamps.length - 1; i >= 0; i--) {
    const s = project.stamps[i];
    // Stamp is drawn from (x - size/2, y - size) to (x + size/2, y).
    if (pt.x > s.x - s.size / 2 && pt.x < s.x + s.size / 2 && pt.y > s.y - s.size && pt.y < s.y) return s;
  }
  return null;
}

function editLabel(lb) {
  const value = prompt('Label text (clear the box and OK to delete this label):', lb.text);
  if (value === null) return; // Cancel/Escape: no change (keeps a just-created label).
  if (value.trim() === '') {
    // Explicitly clearing the text and confirming deletes the label. Confirm so
    // it isn't a surprise, since label edits aren't on the undo stack.
    if (confirm('Delete this label?')) {
      project.labels = project.labels.filter((l) => l.id !== lb.id);
      if (selectedLabelId === lb.id) selectedLabelId = null;
    }
  } else {
    lb.text = value;
    // Offer a quick curve for water/sector labels.
    if ((lb.role === 'water') && lb.curve === 0) lb.curve = 0.4;
  }
  renderLabelsLayer();
  save();
}

// ─── Select / drag stamps & labels ──────────────────────────────────────────────

function beginDrag(pt) {
  const lb = hitLabel(pt);
  if (lb) { selectedLabelId = lb.id; selectedStampId = null; dragging = { kind: 'label', id: lb.id, offX: pt.x - lb.x, offY: pt.y - lb.y }; renderLabelsLayer(); return; }
  const st = hitStamp(pt);
  if (st) { selectedStampId = st.id; selectedLabelId = null; dragging = { kind: 'stamp', id: st.id, offX: pt.x - st.x, offY: pt.y - st.y }; renderStampsLayer(); return; }
  selectedStampId = null; selectedLabelId = null;
  renderStampsLayer(); renderLabelsLayer();
}

function moveDrag(pt) {
  if (!dragging) return;
  if (dragging.kind === 'label') {
    const lb = project.labels.find((l) => l.id === dragging.id);
    if (lb) { lb.x = pt.x - dragging.offX; lb.y = pt.y - dragging.offY; renderLabelsLayer(); }
  } else {
    const st = project.stamps.find((s) => s.id === dragging.id);
    if (st) { st.x = pt.x - dragging.offX; st.y = pt.y - dragging.offY; renderStampsLayer(); }
  }
}

// ─── Undo / redo (terrain raster) ───────────────────────────────────────────────

function pushUndo() {
  const c = document.getElementById('fmap-terrain');
  if (!c) return;
  undoStack.push(c.toDataURL('image/png'));
  if (undoStack.length > 20) undoStack.shift();
  redoStack = [];
}

function undo() {
  const c = document.getElementById('fmap-terrain');
  if (!c || undoStack.length === 0) { toastInfo('Nothing to undo'); return; }
  redoStack.push(c.toDataURL('image/png'));
  const prev = undoStack.pop();
  restoreDataUrl(prev);
}

function redo() {
  const c = document.getElementById('fmap-terrain');
  if (!c || redoStack.length === 0) { toastInfo('Nothing to redo'); return; }
  undoStack.push(c.toDataURL('image/png'));
  const next = redoStack.pop();
  restoreDataUrl(next);
}

function restoreDataUrl(dataUrl) {
  if (!ctxTerrain) return;
  const c = document.getElementById('fmap-terrain');
  ctxTerrain.clearRect(0, 0, c.width, c.height);
  if (!dataUrl) { persistTerrain(); return; }
  const img = new Image();
  img.onload = () => { ctxTerrain.drawImage(img, 0, 0); persistTerrain(); };
  img.src = dataUrl;
}

function persistTerrain() {
  const c = document.getElementById('fmap-terrain');
  if (!c) return;
  project.terrainDataUrl = c.toDataURL('image/png');
  save();
}

function restoreTerrain() {
  // Nothing to restore -> terrain is immediately ready to paint on.
  if (!project.terrainDataUrl || !ctxTerrain) { terrainReady = true; return; }
  const img = new Image();
  img.onload = () => { ctxTerrain.drawImage(img, 0, 0); terrainReady = true; };
  img.onerror = () => { terrainReady = true; };
  img.src = project.terrainDataUrl;
}

// Debounced terrain persistence: a painted map serializes to a large PNG data
// URL, so we avoid re-encoding + writing localStorage on every single stroke.
let _persistTimer = null;
function schedulePersistTerrain() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => { _persistTimer = null; persistTerrain(); }, 600);
}

// ─── Tool / style switching ──────────────────────────────────────────────────

function setTool(t) {
  tool = t;
  // Update the toolbar highlight and swap the context palette in place, without
  // tearing down the canvases (which would drop the raster terrain).
  document.querySelectorAll('.fmap__tool').forEach((el) => {
    el.classList.toggle('fmap__tool--active', el.dataset.tool === t);
  });
  refreshPalette();
}

function switchStyle(styleId) {
  const st = normalizeStyle(styleId);
  if (st === project.style) return;
  // Terrain paint is drawn in the OLD style's palette; carrying it under a new
  // surface looks broken (fantasy greens under a star chart). If there's paint,
  // confirm before discarding it. Stamps/labels are model data and stay.
  const hasPaint = !!project.terrainDataUrl;
  if (hasPaint && !confirm('Switching map style clears the painted terrain (its colors belong to the current style). Stamps and labels are kept. Continue?')) {
    // Revert the toolbar selection by re-rendering without changing style.
    rerender();
    return;
  }
  project.style = st;
  project.surface = defaultSurfaceForStyle(st);
  project.terrainDataUrl = null;
  if (ctxTerrain) { const c = document.getElementById('fmap-terrain'); ctxTerrain.clearRect(0, 0, c.width, c.height); }
  undoStack = []; redoStack = [];
  // Adjust active terrain/stamp to belong to the new style.
  activeTerrain = terrainsForStyle(st)[0].id;
  activeStamp = (STAMP_SETS[st] || STAMP_SETS.fantasy)[0].shape;
  save();
  rerender();
}

// ─── Clear / export ──────────────────────────────────────────────────────────

function clearMap() {
  if (!confirm('Clear the entire map (terrain, stamps, and labels)?')) return;
  if (ctxTerrain) { const c = document.getElementById('fmap-terrain'); ctxTerrain.clearRect(0, 0, c.width, c.height); }
  project.terrainDataUrl = null;
  project.stamps = [];
  project.labels = [];
  undoStack = []; redoStack = [];
  renderStampsLayer();
  renderLabelsLayer();
  save();
  toastInfo('Map cleared');
}

/**
 * Compose all visible layers onto one off-screen canvas at export resolution
 * and trigger a PNG download.
 */
function exportPNG() {
  const { width, height, scale } = exportDimensions(project.width, project.height, 2560);
  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const octx = out.getContext('2d');
  octx.scale(scale, scale);

  const layers = ['fmap-paper', 'fmap-terrain', 'fmap-stamps', 'fmap-labels'];
  const key = ['paper', 'terrain', 'stamps', 'labels'];
  layers.forEach((id, i) => {
    const c = document.getElementById(id);
    const st = project.layers[key[i]] || { visible: true, opacity: 1 };
    if (c && st.visible) {
      octx.globalAlpha = st.opacity;
      octx.drawImage(c, 0, 0);
    }
  });
  octx.globalAlpha = 1;

  out.toBlob((blob) => {
    if (!blob) { toastInfo('Export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loreforge-map-${project.style}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastSuccess(`Exported ${width}×${height} PNG`);
  }, 'image/png');
}

// ─── Re-render helper ──────────────────────────────────────────────────────────

function rerender() {
  // Re-render into the container this module was mounted in (the World Builder's
  // .wb-mode-body), NOT #main-content — reaching up to #main-content would wipe
  // the Diagram/Map mode toggle that lives above us.
  const container = hostContainer || document.querySelector('.wb-mode-body') || document.querySelector('.main-content');
  if (!container) return;
  // Preserve the raster terrain across the DOM rebuild (unless it was just
  // cleared, e.g. by a style switch, in which case terrainDataUrl is null).
  if (project.terrainDataUrl !== null) {
    const c = document.getElementById('fmap-terrain');
    const snapshot = c ? c.toDataURL('image/png') : project.terrainDataUrl;
    project.terrainDataUrl = snapshot || project.terrainDataUrl;
  }
  container.innerHTML = '';
  renderFantasyMap(container);
}
