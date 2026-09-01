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
  terrainsForStyle, getTerrain, terrainMotifs,
  getSurface, surfacesForStyle, defaultSurfaceForStyle,
  MAP_STYLES, normalizeStyle,
  defaultBrush, clamp, brushDabs,
  defaultStampOptions, scatterStamps,
  labelStyle, labelBaseline,
  normalizeMapProject,
  exportDimensions,
  FONTS, fontCss,
  getPathKind, pathKindsForStyle, defaultPathKindForStyle,
  simplifyPath, smoothPath,
  GRID_MODES, hexCenters, hexCorners,
  compassPoints,
  CANVAS_PRESETS, getCanvasPreset,
  EXPORT_PRESETS, getExportPreset,
  LAYER_ORDER, LAYER_META,
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
let tool = 'brush';            // brush | erase | stamp | label | path | select
let activeTerrain = 'grass';
let activeStamp = 'mountain';
let activePathKind = 'river';
let brush = defaultBrush();
let stampOpts = defaultStampOptions();
let labelRole = 'place';
let labelFont = 'serif';       // FONTS id for new labels
let exportPresetId = 'print';  // EXPORT_PRESETS id
let exportTransparent = false; // omit the paper layer on export

let undoStack = [];            // terrain PNG data URLs (raster history)
let redoStack = [];

let ctxTerrain = null;         // 2d context of the terrain canvas
let painting = false;
let strokePath = [];           // for stamp scatter AND path drawing
let lastPoint = null;
let motifLastPoint = null;     // last point where terrain-texture motifs were stamped (per stroke)
let selectedStampId = null;
let selectedLabelId = null;
let selectedPathId = null;
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

// Debounced save for high-frequency edits (slider drags) so we don't thrash
// localStorage while the user scrubs a value.
let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; save(); }, 400);
}

// ─── Main render ────────────────────────────────────────────────────────────

/**
 * Paint a filled sample of one terrain into `canvas` using the REAL brush
 * pipeline (dab → terrainMotifs → drawMotif). Exposed so the texture look can
 * be verified/previewed with the exact code paths the painter uses, rather than
 * a reconstruction. Temporarily rebinds module paint state and restores it.
 * @param {HTMLCanvasElement} canvas
 * @param {string} terrainId
 * @param {{ brushSize?: number }} [opts]
 */
export function renderTerrainSample(canvas, terrainId, opts = {}) {
  if (!canvas || !canvas.getContext) return;
  const terrain = getTerrain(terrainId);
  const savedCtx = ctxTerrain;
  const savedBrush = brush;
  const savedMotif = motifLastPoint;
  ctxTerrain = canvas.getContext('2d');
  brush = { ...defaultBrush(), size: opts.brushSize || 70, softness: 0.35, flow: 1 };
  motifLastPoint = null;
  const w = canvas.width, hgt = canvas.height;
  const r = brush.size / 2;
  const step = r * 0.5;
  let row = 0;
  for (let y = r * 0.4; y < hgt + r; y += step, row++) {
    const leftToRight = row % 2 === 0;
    for (let i = 0; i <= Math.ceil(w / step); i++) {
      const x = leftToRight ? (i * step) : (w - i * step);
      dab({ x, y }, terrain, false);
    }
    motifLastPoint = null; // let each row seed fresh motifs
  }
  ctxTerrain = savedCtx;
  brush = savedBrush;
  motifLastPoint = savedMotif;
}

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
    renderPathsLayer();
    renderStampsLayer();
    renderLabelsLayer();
    renderOverlayLayer();
  });
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function renderToolbar() {
  const tools = [
    { id: 'brush', icon: '🖌️', label: 'Terrain brush' },
    { id: 'erase', icon: '🧽', label: 'Erase terrain' },
    { id: 'path', icon: '〰️', label: 'Paths & routes' },
    { id: 'stamp', icon: '🌲', label: 'Stamp' },
    { id: 'label', icon: '🔤', label: 'Label' },
    { id: 'select', icon: '🖐️', label: 'Move / select' },
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
    // Grid overlay
    h('select', { class: 'input fmap__grid', title: 'Grid overlay',
      onchange: (e) => { project.grid.mode = e.target.value; renderOverlayLayer(); save(); },
    },
      ...GRID_MODES.map((g) => h('option', {
        value: g.id, selected: project.grid.mode === g.id ? 'selected' : null,
      }, `Grid: ${g.label}`)),
    ),
    // Layers panel toggle
    h('button', { class: 'btn btn--sm btn--ghost', title: 'Layers', onclick: toggleLayersPanel }, '☰ Layers'),
    // Undo/redo
    h('div', { class: 'fmap__history' },
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Undo (terrain)', onclick: undo }, '↶'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Redo (terrain)', onclick: redo }, '↷'),
    ),
    // Actions
    h('div', { class: 'fmap__actions' },
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Map settings', onclick: openSettings }, '⚙'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Clear map', onclick: clearMap }, '🗑'),
      h('button', { class: 'btn btn--sm btn--primary', title: 'Export', onclick: exportMap }, '⬇ Export'),
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
  if (tool === 'path') return pathPalette();
  if (tool === 'brush' || tool === 'erase') return brushPalette();
  if (tool === 'select') return selectPalette();
  return hintPalette();
}

function brushPalette() {
  const terrains = terrainsForStyle(project.style);
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, tool === 'erase' ? 'Erase terrain' : 'Terrain'),
    tool === 'brush' ? h('div', { class: 'fmap__swatches' },
      ...terrains.map((t) => {
        // A tiny textured preview canvas so the swatch shows the actual look
        // (trees, waves, peaks…), not just a color gradient.
        const preview = h('canvas', { class: 'fmap__swatch-canvas', width: '148', height: '30' });
        requestAnimationFrame(() => paintSwatch(preview, t));
        return h('button', {
          class: `fmap__swatch ${activeTerrain === t.id ? 'fmap__swatch--active' : ''}`,
          title: `${t.label} — ${t.texture}`,
          onclick: () => { activeTerrain = t.id; refreshPalette(); },
        }, preview, h('span', { class: 'fmap__swatch-label' }, `${t.icon} ${t.label}`));
      }),
    ) : null,
    sliderRow('Size', brush.size, 8, 220, (v) => { brush.size = v; }),
    sliderRow('Softness', Math.round(brush.softness * 100), 0, 100, (v) => { brush.softness = v / 100; }),
    sliderRow('Flow', Math.round(brush.flow * 100), 5, 100, (v) => { brush.flow = v / 100; }),
  );
}

/** Render a small tiled texture preview of a terrain into a swatch canvas. */
function paintSwatch(canvas, terrain) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, hgt = canvas.height;
  // Base fill (blend base + shade).
  const g = ctx.createLinearGradient(0, 0, w, hgt);
  g.addColorStop(0, terrain.base);
  g.addColorStop(1, terrain.shade);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hgt);
  // Motifs across the strip (a few overlapping discs to cover the width).
  ctx.save();
  ctx.globalAlpha = 0.95;
  for (let cx = 16; cx < w; cx += 30) {
    const seed = (cx * 2654435761) ^ (terrain.id.length * 40503);
    terrainMotifs(terrain, cx, hgt / 2, 15, seed >>> 0).forEach((m2) => drawMotif(ctx, m2, 0.7));
  }
  ctx.restore();
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
    h('div', { class: 'fmap__pal-sub' }, 'Font'),
    h('select', { class: 'input', onchange: (e) => { labelFont = e.target.value; } },
      ...FONTS.map((f) => h('option', { value: f.id, selected: labelFont === f.id ? 'selected' : null }, f.label)),
    ),
    // If a label is selected, expose live edit controls for it.
    selectedLabelId ? selectedLabelControls() : null,
    h('div', { class: 'fmap__pal-hint' }, 'Click the map to place a label, then type. Double-click a label to edit; drag to move. Select one to tweak size/curve/font.'),
  );
}

function selectedLabelControls() {
  const lb = project.labels.find((l) => l.id === selectedLabelId);
  if (!lb) return null;
  return h('div', { class: 'fmap__pal-box' },
    h('div', { class: 'fmap__pal-sub' }, `Selected: “${lb.text}”`),
    sliderRow('Size', Math.round(lb.size || 18), 8, 160, (v) => { lb.size = v; renderLabelsLayer(); renderOverlayLayer(); scheduleSave(); }),
    sliderRow('Curve', Math.round((lb.curve || 0) * 100), -100, 100, (v) => { lb.curve = v / 100; renderLabelsLayer(); scheduleSave(); }),
    h('select', { class: 'input', onchange: (e) => { lb.font = e.target.value; renderLabelsLayer(); scheduleSave(); } },
      ...FONTS.map((f) => h('option', { value: f.id, selected: (lb.font || 'serif') === f.id ? 'selected' : null }, f.label)),
    ),
    h('button', { class: 'btn btn--sm', style: { color: 'var(--danger)', width: '100%', marginTop: '6px' }, onclick: () => deleteSelectedLabel() }, '🗑 Delete label'),
  );
}

function pathPalette() {
  const kinds = pathKindsForStyle(project.style);
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, 'Paths & Routes'),
    h('div', { class: 'fmap__path-list' },
      ...kinds.map((k) => h('button', {
        class: `fmap__path-btn ${activePathKind === k.id ? 'fmap__path-btn--active' : ''}`,
        title: k.label,
        onclick: () => { activePathKind = k.id; refreshPalette(); },
      },
        h('span', { class: 'fmap__path-swatch', style: pathSwatchStyle(k) }),
        h('span', {}, `${k.icon} ${k.label}`),
      )),
    ),
    h('div', { class: 'fmap__pal-hint' }, 'Drag to draw a smooth route — it snaps into a flowing curve. Undo/redo covers terrain only; use the Select tool to move or delete a path.'),
  );
}

function pathSwatchStyle(k) {
  return {
    background: k.color,
    height: `${Math.max(2, Math.min(6, k.width))}px`,
    borderRadius: '3px',
    opacity: k.dash && k.dash.length ? '0.7' : '1',
  };
}

function selectPalette() {
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, 'Select & Move'),
    selectedLabelId ? selectedLabelControls() : null,
    selectedStampId ? h('div', { class: 'fmap__pal-box' },
      h('div', { class: 'fmap__pal-sub' }, 'Selected stamp'),
      sliderRow('Size', Math.round((project.stamps.find((s) => s.id === selectedStampId) || {}).size || 46), 12, 400, (v) => { const s = project.stamps.find((x) => x.id === selectedStampId); if (s) { s.size = v; renderStampsLayer(); renderOverlayLayer(); scheduleSave(); } }),
      h('button', { class: 'btn btn--sm', style: { color: 'var(--danger)', width: '100%', marginTop: '6px' }, onclick: () => deleteSelectedStamp() }, '🗑 Delete stamp'),
    ) : null,
    selectedPathId ? h('div', { class: 'fmap__pal-box' },
      h('div', { class: 'fmap__pal-sub' }, 'Selected path'),
      h('button', { class: 'btn btn--sm', style: { color: 'var(--danger)', width: '100%' }, onclick: () => deleteSelectedPath() }, '🗑 Delete path'),
    ) : null,
    (selectedStampId || selectedLabelId)
      ? h('div', { class: 'fmap__pal-hint' }, 'Tip: drag the blue corner handle on the map to resize, or use the slider above.')
      : null,
    (!selectedLabelId && !selectedStampId && !selectedPathId)
      ? h('div', { class: 'fmap__pal-hint' }, 'Click a stamp, label, or path to select it. Drag it to move, drag its corner handle to resize, or delete it here.')
      : null,
  );
}

function hintPalette() {
  return h('div', { class: 'fmap__pal-hint' }, 'Pick a tool. Drag stamps and labels with the move tool. The map is fixed-size for crisp export.');
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
      canvasEl('fmap-paths', w, hgt, 2),
      canvasEl('fmap-stamps', w, hgt, 3),
      canvasEl('fmap-labels', w, hgt, 4),
      canvasEl('fmap-overlay', w, hgt, 5),
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
  for (const id of LAYER_ORDER) {
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

  if (erase) {
    ctxTerrain.save();
    ctxTerrain.globalCompositeOperation = 'destination-out';
    const g = ctxTerrain.createRadialGradient(pt.x, pt.y, r * (1 - brush.softness), pt.x, pt.y, r);
    g.addColorStop(0, `rgba(0,0,0,${brush.flow})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctxTerrain.fillStyle = g;
    ctxTerrain.beginPath();
    ctxTerrain.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctxTerrain.fill();
    ctxTerrain.restore();
    return;
  }

  // 1) Tonal base — soft radial disc that blends the two terrain tones. Kept a
  //    touch lighter than before so the motifs painted on top carry the texture.
  ctxTerrain.save();
  ctxTerrain.globalCompositeOperation = 'source-over';
  const col = Math.random() > 0.5 ? terrain.shade : terrain.base;
  const baseAlpha = clamp(brush.flow * 0.85, 0.05, 1);
  const g = ctxTerrain.createRadialGradient(pt.x, pt.y, r * (1 - brush.softness), pt.x, pt.y, r);
  g.addColorStop(0, hexA(col, baseAlpha));
  g.addColorStop(1, hexA(col, 0));
  ctxTerrain.fillStyle = g;
  ctxTerrain.beginPath();
  ctxTerrain.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctxTerrain.fill();
  ctxTerrain.restore();

  // 2) Texture motifs — only when this dab has moved far enough from the last
  //    motif drop, so a continuous drag doesn't pile motifs on top of each
  //    other. Spacing ~= 55% of the brush radius.
  const spacing = Math.max(6, r * 0.55);
  if (motifLastPoint && Math.hypot(pt.x - motifLastPoint.x, pt.y - motifLastPoint.y) < spacing) return;
  motifLastPoint = { x: pt.x, y: pt.y };

  // Deterministic-ish per-dab seed from quantized position so repeated painting
  // of the same spot is stable, but the stroke as a whole varies.
  const seed = (Math.round(pt.x) * 73856093) ^ (Math.round(pt.y) * 19349663);
  // Motifs cover a slightly smaller disc than the base so they stay off the
  // feathered edge; scale the whole motif set with the brush size.
  const motifR = r * 0.82;
  const scaleMul = clamp(r / 32, 0.6, 2.4);
  const motifs = terrainMotifs(terrain, pt.x, pt.y, motifR, seed >>> 0);
  ctxTerrain.save();
  // Clip the motif pass to the dab disc so a large motif near the edge can't
  // spray onto un-based canvas, and so the hard motif edges tuck under the
  // feathered base rim instead of sitting on bare pixels.
  ctxTerrain.beginPath();
  ctxTerrain.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctxTerrain.clip();
  // Motifs carry the terrain's identity, so keep them near-opaque (they only
  // fade a little at very low brush flow).
  ctxTerrain.globalAlpha = clamp(0.6 + brush.flow * 0.4, 0.6, 1);
  motifs.forEach((m2) => drawMotif(ctxTerrain, m2, scaleMul));
  ctxTerrain.restore();
}

/**
 * Draw a single terrain-motif primitive with real light/shadow/outline so it
 * reads as a distinct feature (a tree, a peak, a wave) rather than a same-hue
 * blob. `col` is the motif accent; we derive a darker body, lighter highlight,
 * and dark outline from it for depth.
 */
function drawMotif(ctx, m2, k = 1) {
  const col = safeColor(m2.color, '#4a6b3a');
  const dark = shift(col, -0.4);        // shadow / outline
  const body = col;                     // main tone
  const light = shift(col, 0.4);        // sunlit highlight
  const s = (m2.s || 4) * k;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (m2.type) {
    case 'tree': { // conifer: trunk + two-tone triangular canopy + outline
      // trunk
      ctx.fillStyle = shift('#5b3a1e', 0);
      ctx.fillRect(m2.x - s * 0.11, m2.y + s * 0.45, s * 0.22, s * 0.5);
      // canopy (dark body)
      ctx.fillStyle = body;
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.6, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s * 1.05);
      ctx.lineTo(m2.x - s * 0.72, m2.y + s * 0.6);
      ctx.lineTo(m2.x + s * 0.72, m2.y + s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // sunlit left face
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s * 1.05);
      ctx.lineTo(m2.x - s * 0.72, m2.y + s * 0.6);
      ctx.lineTo(m2.x - s * 0.1, m2.y + s * 0.6);
      ctx.lineTo(m2.x - s * 0.04, m2.y - s * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'blob': { // canopy / bush / rock — shaded round mass + highlight
      ctx.fillStyle = body;
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.6, s * 0.1);
      ctx.beginPath();
      if (m2.poly) {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 / n) * i + (m2.x % 1);
          const rr = s * (0.72 + ((i % 2) ? 0.22 : 0));
          const px = m2.x + Math.cos(a) * rr, py = m2.y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(m2.x, m2.y, s * 0.8, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      // top-left highlight
      ctx.fillStyle = shift(col, 0.35, 0.85);
      ctx.beginPath();
      ctx.arc(m2.x - s * 0.25, m2.y - s * 0.25, s * 0.34, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'tuft': { // grass — dark back blades + lighter front blades
      ctx.lineWidth = Math.max(0.8, s * 0.22);
      ctx.strokeStyle = dark;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(m2.x + i * s * 0.3, m2.y + s * 0.55);
        ctx.quadraticCurveTo(m2.x + i * s * 0.42, m2.y - s * 0.2, m2.x + i * s * 0.62, m2.y - s * 0.75);
        ctx.stroke();
      }
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(0.6, s * 0.16);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(m2.x + i * s * 0.32, m2.y + s * 0.5);
        ctx.quadraticCurveTo(m2.x + i * s * 0.3, m2.y - s * 0.1, m2.x + i * s * 0.4, m2.y - s * 0.6);
        ctx.stroke();
      }
      break;
    }
    case 'peak': { // mountain — dark rock, shadowed right face, snow cap
      ctx.fillStyle = body;
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.6, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s);
      ctx.lineTo(m2.x - s * 0.85, m2.y + s * 0.62);
      ctx.lineTo(m2.x + s * 0.85, m2.y + s * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // shadowed right face
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s);
      ctx.lineTo(m2.x + s * 0.85, m2.y + s * 0.62);
      ctx.lineTo(m2.x, m2.y + s * 0.62);
      ctx.closePath();
      ctx.fill();
      // snow cap
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s);
      ctx.lineTo(m2.x - s * 0.3, m2.y - s * 0.35);
      ctx.lineTo(m2.x - s * 0.12, m2.y - s * 0.42);
      ctx.lineTo(m2.x + s * 0.06, m2.y - s * 0.3);
      ctx.lineTo(m2.x + s * 0.3, m2.y - s * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'hill': { // rounded bump with a highlight
      ctx.fillStyle = body;
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.6, s * 0.1);
      ctx.beginPath();
      ctx.arc(m2.x, m2.y + s * 0.2, s * 0.8, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(0.6, s * 0.14);
      ctx.beginPath();
      ctx.arc(m2.x, m2.y + s * 0.2, s * 0.6, Math.PI * 1.15, Math.PI * 1.6);
      ctx.stroke();
      break;
    }
    case 'shard': { // crystal — lit left facet + dark right facet + outline
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.6, s * 0.1);
      // left (light) facet
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s);
      ctx.lineTo(m2.x - s * 0.55, m2.y);
      ctx.lineTo(m2.x, m2.y + s);
      ctx.closePath();
      ctx.fill();
      // right (dark) facet
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s);
      ctx.lineTo(m2.x + s * 0.55, m2.y);
      ctx.lineTo(m2.x, m2.y + s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m2.x, m2.y - s); ctx.lineTo(m2.x + s * 0.55, m2.y);
      ctx.lineTo(m2.x, m2.y + s); ctx.lineTo(m2.x - s * 0.55, m2.y);
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'cross': { // thorn / spike cluster
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, s * 0.24);
      ctx.beginPath();
      ctx.moveTo(m2.x - s * 0.6, m2.y + s * 0.3); ctx.lineTo(m2.x + s * 0.6, m2.y - s * 0.3);
      ctx.moveTo(m2.x + s * 0.6, m2.y + s * 0.3); ctx.lineTo(m2.x - s * 0.6, m2.y - s * 0.3);
      ctx.moveTo(m2.x, m2.y + s * 0.55); ctx.lineTo(m2.x, m2.y - s * 0.55);
      ctx.stroke();
      break;
    }
    case 'ring': { // bubble / crater — rim + inner shadow
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.8, s * 0.2);
      ctx.beginPath();
      ctx.arc(m2.x, m2.y, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(0.6, s * 0.12);
      ctx.beginPath();
      ctx.arc(m2.x - s * 0.1, m2.y - s * 0.1, s * 0.5, Math.PI * 0.9, Math.PI * 1.7);
      ctx.stroke();
      break;
    }
    case 'cloud': { // soft nebula puff (layered for depth)
      const g1 = ctx.createRadialGradient(m2.x, m2.y, 0, m2.x, m2.y, s);
      g1.addColorStop(0, hexA(col, 0.5));
      g1.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g1;
      ctx.beginPath(); ctx.arc(m2.x, m2.y, s, 0, Math.PI * 2); ctx.fill();
      const g2 = ctx.createRadialGradient(m2.x - s * 0.2, m2.y - s * 0.2, 0, m2.x - s * 0.2, m2.y - s * 0.2, s * 0.5);
      g2.addColorStop(0, shift(col, 0.5, 0.55));
      g2.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(m2.x - s * 0.2, m2.y - s * 0.2, s * 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'dot': { // speckle / star / ember / sparkle
      if (m2.glow) {
        const grad = ctx.createRadialGradient(m2.x, m2.y, 0, m2.x, m2.y, Math.max(2, s * 2.4));
        grad.addColorStop(0, hexA(col, 0.95));
        grad.addColorStop(0.4, hexA(col, 0.5));
        grad.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m2.x, m2.y, Math.max(2, s * 2.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shift(col, 0.6);
      } else {
        ctx.fillStyle = body;
      }
      ctx.beginPath();
      ctx.arc(m2.x, m2.y, Math.max(0.8, s * 0.7), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'crack': {
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.9, k * 1.1);
      ctx.beginPath();
      ctx.moveTo(m2.x1, m2.y1); ctx.lineTo(m2.x2, m2.y2);
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.strokeStyle = col;
      ctx.lineWidth = m2.w || 1;
      ctx.beginPath();
      ctx.moveTo(m2.x1, m2.y1); ctx.lineTo(m2.x2, m2.y2);
      ctx.stroke();
      break;
    }
    case 'wave': { // ocean / dune / furrow — dark trough + light crest
      const drawWave = (dy, color, w) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = m2.x1 + (m2.x2 - m2.x1) * t;
          const y = m2.y + dy + (m2.amp ? Math.sin(t * Math.PI * 2 + (m2.phase || 0)) * m2.amp : 0);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawWave(0.6, dark, (m2.w || 1.5) + 0.5);   // shadow trough
      drawWave(-0.4, light, (m2.w || 1.5));        // bright crest
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// Parse a hex color (#rgb or #rrggbb) to {r,g,b}, or null.
function hexRGB(hex) {
  const c = safeColor(hex, '#7a8f4a');
  const m6 = /^#([0-9a-f]{6})$/i.exec(c);
  const m3 = /^#([0-9a-f]{3})$/i.exec(c);
  let h = null;
  if (m6) h = m6[1];
  else if (m3) h = m3[1].replace(/(.)/g, '$1$1');
  if (!h) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hexA(hex, alpha) {
  const rgb = hexRGB(hex);
  if (!rgb) return safeColor(hex, '#7a8f4a');
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(alpha, 0, 1)})`;
}

// Lighten (amt>0) or darken (amt<0) a color by a fraction toward white/black.
// Used to give motifs real light/shadow so they read as 3D features, not flat
// same-hue shapes.
function shift(hex, amt, alpha = 1) {
  const rgb = hexRGB(hex);
  if (!rgb) return safeColor(hex, '#7a8f4a');
  const mix = (c) => amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt));
  return `rgba(${mix(rgb.r)},${mix(rgb.g)},${mix(rgb.b)},${clamp(alpha, 0, 1)})`;
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
    motifLastPoint = null; // fresh stroke → first dab stamps motifs
    dab(pt, getTerrain(activeTerrain), tool === 'erase');
  } else if (tool === 'stamp' || tool === 'path') {
    painting = true;
    strokePath = [pt];
    if (tool === 'path') snapshotPathsForPreview(); // freeze committed paths once
  } else if (tool === 'label') {
    createLabelAt(pt);
  } else if (tool === 'select') {
    beginDrag(pt);
  }
}

function onPointerMove(e) {
  // Hover feedback: show a resize cursor over the handle when idle in Select mode.
  if (!painting && !dragging) {
    if (tool === 'select') {
      const hp = pointFromEvent(e);
      const surf = document.getElementById('fmap-surface');
      if (surf) surf.style.cursor = hitResizeHandle(hp) ? 'nwse-resize' : 'default';
    }
    return;
  }
  const pt = pointFromEvent(e);

  if ((tool === 'brush' || tool === 'erase') && painting && lastPoint) {
    const dabs = brushDabs(lastPoint, pt, brush);
    const terrain = getTerrain(activeTerrain);
    dabs.forEach((d) => dab(d, terrain, tool === 'erase'));
    lastPoint = pt;
  } else if (tool === 'stamp' && painting) {
    strokePath.push(pt);
  } else if (tool === 'path' && painting) {
    strokePath.push(pt);
    previewPath();        // live preview of the route being drawn
  } else if (tool === 'select' && dragging) {
    moveDrag(pt);
  }
}

function onPointerUp() {
  if (tool === 'stamp' && painting) commitStampStroke();
  if (tool === 'path' && painting) commitPathStroke();
  if ((tool === 'brush' || tool === 'erase') && painting) { schedulePersistTerrain(); }
  // A drag/resize of a stamp/label/path ends here — persist and, if it was a
  // resize, refresh the palette so the size slider mirrors the new value.
  if (tool === 'select' && dragging) {
    const wasResize = dragging.kind === 'resize';
    save();
    if (wasResize) refreshPalette();
  }
  painting = false;
  lastPoint = null;
  dragging = null;
  // Clear any transient resize cursor (also covers pointerleave, which routes
  // here) so it can't linger once the gesture/hover ends.
  const surf = document.getElementById('fmap-surface');
  if (surf && surf.style.cursor === 'nwse-resize') surf.style.cursor = '';
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

// ─── Paths / routes ─────────────────────────────────────────────────────────

function commitPathStroke() {
  const pts = simplifyPath(strokePath, 6);
  strokePath = [];
  _pathPreviewSnapshot = null;
  if (pts.length < 2) { renderPathsLayer(); return; } // a dot isn't a path
  project.paths.push({
    id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind: activePathKind,
    points: pts,
  });
  renderPathsLayer();
  save();
}

/** Draw a single path (smoothed) onto a 2d context using its kind's style. */
function drawPath(ctx, path, selected) {
  const kind = getPathKind(path.kind);
  const pts = path.points || [];
  if (pts.length < 2) return;
  const sm = smoothPath(pts, 0.5);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = kind.cap || 'round';

  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(sm.start.x, sm.start.y);
    sm.segments.forEach((s) => ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.end.x, s.end.y));
  };

  // Outer glow for sci-fi lanes.
  if (kind.glow) {
    ctx.shadowColor = kind.color;
    ctx.shadowBlur = kind.width * 3;
  }
  // A soft casing under rivers/roads makes them read on busy terrain.
  if (!kind.glow && (kind.id === 'river' || kind.id === 'road')) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = kind.width + 3;
    ctx.setLineDash([]);
    trace(); ctx.stroke();
  }

  ctx.strokeStyle = path.color || kind.color;
  ctx.lineWidth = path.width || kind.width;
  ctx.setLineDash(kind.dash || []);
  trace(); ctx.stroke();

  if (selected) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(80,140,255,0.9)';
    ctx.lineWidth = (path.width || kind.width) + 4;
    ctx.shadowBlur = 0;
    trace(); ctx.stroke();
  }
  ctx.restore();
}

function renderPathsLayer() {
  const c = document.getElementById('fmap-paths');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  project.paths.forEach((p) => drawPath(ctx, p, p.id === selectedPathId));
}

// Snapshot of the committed paths layer taken once at the start of a path drag,
// so live preview blits an image instead of re-smoothing every committed path
// on every pointermove.
let _pathPreviewSnapshot = null;

function snapshotPathsForPreview() {
  const c = document.getElementById('fmap-paths');
  _pathPreviewSnapshot = null;
  if (!c) return;
  const img = new Image();
  img.onload = () => { _pathPreviewSnapshot = img; };
  img.src = c.toDataURL('image/png');
}

/** Live preview while dragging a new path (blit committed snapshot + stroke). */
function previewPath() {
  const c = document.getElementById('fmap-paths');
  if (!c || strokePath.length < 2) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (_pathPreviewSnapshot) ctx.drawImage(_pathPreviewSnapshot, 0, 0);
  else renderPathsLayer(); // snapshot not ready yet — fall back to full repaint
  drawPath(ctx, { kind: activePathKind, points: strokePath }, false);
}

/** Hit-test a point against any path (distance to its polyline). */
function hitPath(pt) {
  const tol = 10;
  for (let i = project.paths.length - 1; i >= 0; i--) {
    const p = project.paths[i];
    const pts = p.points || [];
    for (let j = 1; j < pts.length; j++) {
      if (distToSegment(pt, pts[j - 1], pts[j]) <= tol + (getPathKind(p.kind).width || 3)) return p;
    }
  }
  return null;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ─── Overlay: grid / hex / ornaments ──────────────────────────────────────────

function renderOverlayLayer() {
  const c = document.getElementById('fmap-overlay');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width, hgt = c.height;
  ctx.clearRect(0, 0, w, hgt);

  const grid = project.grid || { mode: 'off', size: 48 };
  if (grid.mode === 'square') drawSquareGrid(ctx, w, hgt, grid);
  else if (grid.mode === 'hex') drawHexGrid(ctx, w, hgt, grid);

  const orn = project.ornaments || {};
  const surf = getSurface(project.surface);
  if (orn.frame) drawFrame(ctx, w, hgt, surf);
  if (orn.compass) drawCompass(ctx, w, hgt, surf);
  if (orn.scale) drawScaleBar(ctx, w, hgt, surf);

  // Selection chrome (only meaningful with the Select tool active): a bounding
  // box plus a corner handle you can drag to resize the selected stamp/label.
  if (tool === 'select') drawSelectionChrome(ctx);
}

const HANDLE = 11; // resize-handle square size (canvas px)

/** Bounding box {x,y,w,h} of the currently selected stamp or label, or null. */
function selectionBounds() {
  if (selectedStampId) {
    const s = project.stamps.find((x) => x.id === selectedStampId);
    // Stamp draws from (x - size/2, y - size) to (x + size/2, y).
    if (s) return { kind: 'stamp', ref: s, x: s.x - s.size / 2, y: s.y - s.size, w: s.size, h: s.size };
  }
  if (selectedLabelId) {
    const lb = project.labels.find((x) => x.id === selectedLabelId);
    if (lb) {
      const preset = labelStyle(lb.role || 'place', project.style);
      const size = lb.size || preset.size;
      const n = String(lb.text).length;
      const w = Math.max(60, n * size * 0.62 + n * (preset.letterSpacing || 0));
      const hgt = size * 1.4;
      return { kind: 'label', ref: lb, x: lb.x - w / 2, y: lb.y - hgt / 2, w, h: hgt };
    }
  }
  return null;
}

function drawSelectionChrome(ctx) {
  const b = selectionBounds();
  if (!b) return;
  ctx.save();
  // Dashed bounding box.
  ctx.strokeStyle = 'rgba(80,140,255,0.95)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  // Resize handle at the bottom-right corner.
  ctx.setLineDash([]);
  const hx = b.x + b.w + 4 - HANDLE / 2;
  const hy = b.y + b.h + 4 - HANDLE / 2;
  ctx.fillStyle = '#5088ff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(hx, hy, HANDLE, HANDLE, 2) : ctx.rect(hx, hy, HANDLE, HANDLE);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Is the point on the selection's resize handle? */
function hitResizeHandle(pt) {
  const b = selectionBounds();
  if (!b) return false;
  const hx = b.x + b.w + 4 - HANDLE / 2;
  const hy = b.y + b.h + 4 - HANDLE / 2;
  const pad = 6; // generous grab area
  return pt.x >= hx - pad && pt.x <= hx + HANDLE + pad && pt.y >= hy - pad && pt.y <= hy + HANDLE + pad;
}

function gridColor() {
  const surf = getSurface(project.surface);
  // Light ink on dark surfaces, dark ink on light paper.
  return surf.kind === 'paper' && surf.id !== 'darkfantasy'
    ? 'rgba(60,44,20,0.28)'
    : 'rgba(150,200,255,0.22)';
}

function drawSquareGrid(ctx, w, hgt, grid) {
  const step = Math.max(12, grid.size || 48);
  ctx.save();
  ctx.strokeStyle = grid.color || gridColor();
  ctx.lineWidth = 1;
  for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hgt); ctx.stroke(); }
  for (let y = step; y < hgt; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();
}

function drawHexGrid(ctx, w, hgt, grid) {
  const size = Math.max(14, (grid.size || 48) / 1.6);
  ctx.save();
  ctx.strokeStyle = grid.color || gridColor();
  ctx.lineWidth = 1;
  hexCenters(w, hgt, size).forEach(({ cx, cy }) => {
    const pts = hexCorners(cx, cy, size);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();
}

function drawFrame(ctx, w, hgt, surf) {
  ctx.save();
  ctx.strokeStyle = surf.ink;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, hgt - 20);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, w - 36, hgt - 36);
  // Corner ticks.
  const t = 14;
  ctx.lineWidth = 2;
  [[18, 18], [w - 18, 18], [18, hgt - 18], [w - 18, hgt - 18]].forEach(([x, y], i) => {
    const sx = i % 2 === 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, y + sy * t); ctx.lineTo(x, y); ctx.lineTo(x + sx * t, y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawCompass(ctx, w, hgt, surf) {
  const r = Math.min(60, Math.min(w, hgt) * 0.09);
  const cx = w - r - 34;
  const cy = hgt - r - 34;
  const { outer, inner } = compassPoints(cx, cy, r);
  ctx.save();
  ctx.globalAlpha = 0.9;
  // Outer ring.
  ctx.strokeStyle = surf.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.stroke();
  // Star: alternate outer spoke tip and inner notch.
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const o = outer[i], n = inner[i];
    if (i === 0) ctx.moveTo(o.x, o.y); else ctx.lineTo(o.x, o.y);
    ctx.lineTo(n.x, n.y);
  }
  ctx.closePath();
  ctx.fillStyle = surf.ink;
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = surf.ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  // "N".
  ctx.fillStyle = surf.ink;
  ctx.font = `bold ${Math.round(r * 0.4)}px ${fontCss('serif')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r * 0.62);
  ctx.restore();
}

function drawScaleBar(ctx, w, hgt, surf) {
  const barW = Math.min(220, w * 0.22);
  const x = 34, y = hgt - 34;
  const segs = 4;
  ctx.save();
  ctx.strokeStyle = surf.ink;
  ctx.fillStyle = surf.ink;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < segs; i++) {
    const sx = x + (barW / segs) * i;
    ctx.globalAlpha = 0.85;
    if (i % 2 === 0) { ctx.fillRect(sx, y, barW / segs, 7); }
    else { ctx.strokeRect(sx, y, barW / segs, 7); }
  }
  ctx.globalAlpha = 0.9;
  ctx.font = `${12}px ${fontCss('serif')}`;
  ctx.textAlign = 'left';
  ctx.fillText('0', x - 2, y - 6);
  ctx.textAlign = 'right';
  ctx.fillText(project.style === 'scifi' ? '10 ly' : '100 mi', x + barW, y - 6);
  ctx.restore();
}

// ─── Labels ────────────────────────────────────────────────────────────────────

function createLabelAt(pt) {
  const preset = labelStyle(labelRole, project.style);
  const label = {
    id: `lb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    text: labelRole === 'region' ? 'New Region' : labelRole === 'water' ? (project.style === 'scifi' ? 'Sector' : 'The Sea') : 'New Place',
    x: pt.x, y: pt.y, size: preset.size, curve: 0, role: labelRole,
    color: preset.color, font: labelFont,
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
  ctx.font = `${preset.italic ? 'italic ' : ''}600 ${size}px ${fontCss(lb.font || 'serif')}`;
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

function deleteSelectedLabel() {
  if (!selectedLabelId) return;
  project.labels = project.labels.filter((l) => l.id !== selectedLabelId);
  selectedLabelId = null;
  renderLabelsLayer(); renderOverlayLayer(); refreshPalette(); save();
}

function deleteSelectedStamp() {
  if (!selectedStampId) return;
  project.stamps = project.stamps.filter((s) => s.id !== selectedStampId);
  selectedStampId = null;
  renderStampsLayer(); renderOverlayLayer(); refreshPalette(); save();
}

function deleteSelectedPath() {
  if (!selectedPathId) return;
  project.paths = project.paths.filter((p) => p.id !== selectedPathId);
  selectedPathId = null;
  renderPathsLayer(); renderOverlayLayer(); refreshPalette(); save();
}

// ─── Select / drag stamps & labels ──────────────────────────────────────────────

function beginDrag(pt) {
  // 1) Grabbing the resize handle of the already-selected item starts a resize.
  if (hitResizeHandle(pt)) {
    const b = selectionBounds();
    if (b) {
      // Anchor is the item's fixed corner opposite the handle. Capture it ONCE
      // here (not per-frame) so it can't shift as the item's size changes mid-
      // drag — otherwise a stamp's left edge (x - size/2) would slide with the
      // size it controls, producing drift. startDist is the pointer's distance
      // from that fixed anchor; new size = startSize * (dist / startDist).
      const anchor = { x: b.x, y: b.kind === 'stamp' ? b.y + b.h : b.y };
      dragging = {
        kind: 'resize', target: b.kind, id: b.ref.id, anchor,
        startSize: b.kind === 'stamp' ? b.ref.size : (b.ref.size || labelStyle(b.ref.role || 'place', project.style).size),
        startDist: Math.max(4, Math.hypot(pt.x - anchor.x, pt.y - anchor.y)),
      };
      return;
    }
  }
  // 2) Otherwise: select/move (labels, then stamps, then paths — topmost first).
  const lb = hitLabel(pt);
  if (lb) { selectedLabelId = lb.id; selectedStampId = null; selectedPathId = null; dragging = { kind: 'label', id: lb.id, offX: pt.x - lb.x, offY: pt.y - lb.y }; renderLabelsLayer(); renderOverlayLayer(); refreshPalette(); return; }
  const st = hitStamp(pt);
  if (st) { selectedStampId = st.id; selectedLabelId = null; selectedPathId = null; dragging = { kind: 'stamp', id: st.id, offX: pt.x - st.x, offY: pt.y - st.y }; renderStampsLayer(); renderOverlayLayer(); refreshPalette(); return; }
  const pa = hitPath(pt);
  if (pa) { selectedPathId = pa.id; selectedStampId = null; selectedLabelId = null; dragging = { kind: 'path', id: pa.id, points: pa.points.map((q) => ({ ...q })), start: pt }; renderPathsLayer(); renderOverlayLayer(); refreshPalette(); return; }
  selectedStampId = null; selectedLabelId = null; selectedPathId = null;
  renderStampsLayer(); renderLabelsLayer(); renderPathsLayer(); renderOverlayLayer(); refreshPalette();
}

function moveDrag(pt) {
  if (!dragging) return;
  if (dragging.kind === 'resize') {
    // Use the anchor captured at drag start (fixed point) — never recompute it
    // from the live, resizing item, or the mapping becomes path-dependent.
    const anchor = dragging.anchor;
    const dist = Math.max(4, Math.hypot(pt.x - anchor.x, pt.y - anchor.y));
    const scale = dist / dragging.startDist;
    if (dragging.target === 'stamp') {
      const s = project.stamps.find((x) => x.id === dragging.id);
      if (s) { s.size = clamp(Math.round(dragging.startSize * scale), 12, 400); renderStampsLayer(); }
    } else {
      const lb = project.labels.find((x) => x.id === dragging.id);
      if (lb) { lb.size = clamp(Math.round(dragging.startSize * scale), 8, 160); renderLabelsLayer(); }
    }
    renderOverlayLayer();
    return;
  }
  if (dragging.kind === 'label') {
    const lb = project.labels.find((l) => l.id === dragging.id);
    if (lb) { lb.x = pt.x - dragging.offX; lb.y = pt.y - dragging.offY; renderLabelsLayer(); renderOverlayLayer(); }
  } else if (dragging.kind === 'stamp') {
    const st = project.stamps.find((s) => s.id === dragging.id);
    if (st) { st.x = pt.x - dragging.offX; st.y = pt.y - dragging.offY; renderStampsLayer(); renderOverlayLayer(); }
  } else if (dragging.kind === 'path') {
    const pa = project.paths.find((p) => p.id === dragging.id);
    if (pa) {
      const dx = pt.x - dragging.start.x, dy = pt.y - dragging.start.y;
      pa.points = dragging.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      renderPathsLayer();
    }
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
  // Show/hide the selection bounding box + resize handle with the Select tool.
  renderOverlayLayer();
  // Don't leave a stale resize cursor behind when switching away from Select.
  const surf = document.getElementById('fmap-surface');
  if (surf) surf.style.cursor = '';
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
  activePathKind = defaultPathKindForStyle(st);
  save();
  rerender();
}

// ─── Clear / export ──────────────────────────────────────────────────────────

function clearMap() {
  if (!confirm('Clear the entire map (terrain, paths, stamps, and labels)?')) return;
  if (ctxTerrain) { const c = document.getElementById('fmap-terrain'); ctxTerrain.clearRect(0, 0, c.width, c.height); }
  project.terrainDataUrl = null;
  project.paths = [];
  project.stamps = [];
  project.labels = [];
  selectedStampId = selectedLabelId = selectedPathId = null;
  undoStack = []; redoStack = [];
  renderPathsLayer();
  renderStampsLayer();
  renderLabelsLayer();
  save();
  toastInfo('Map cleared');
}

/**
 * Compose all visible layers onto one off-screen canvas at the chosen export
 * resolution and trigger a PNG download. Honors the transparent-background
 * option (skips the paper layer).
 */
function exportPNG() {
  const preset = getExportPreset(exportPresetId);
  const { width, height, scale } = exportDimensions(project.width, project.height, preset.longEdge);
  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const octx = out.getContext('2d');
  octx.scale(scale, scale);

  LAYER_ORDER.forEach((key) => {
    if (key === 'paper' && exportTransparent) return; // transparent bg
    const c = document.getElementById(`fmap-${key}`);
    const st = project.layers[key] || { visible: true, opacity: 1 };
    if (c && st.visible) {
      octx.globalAlpha = st.opacity;
      octx.drawImage(c, 0, 0);
    }
  });
  octx.globalAlpha = 1;

  out.toBlob((blob) => {
    if (!blob) { toastInfo('Export failed'); return; }
    downloadBlob(blob, `loreforge-map-${project.style}-${Date.now()}.png`);
    toastSuccess(`Exported ${width}×${height} PNG`);
  }, 'image/png');
}

/** Export the project as a JSON file (re-importable, portable). */
function exportJSON() {
  try {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `loreforge-map-${project.style}-${Date.now()}.json`);
    toastSuccess('Exported map JSON');
  } catch (_) { toastInfo('Export failed'); }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export chooser: PNG (with resolution/transparency) or JSON. */
function exportMap() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, 'Export map'),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕'),
      ),
      h('div', { class: 'modal__body' },
        h('div', { style: { marginBottom: '12px' } },
          h('label', { style: labelCss() }, 'Resolution'),
          h('select', { class: 'input', onchange: (e) => { exportPresetId = e.target.value; } },
            ...EXPORT_PRESETS.map((p) => h('option', { value: p.id, selected: exportPresetId === p.id ? 'selected' : null }, p.label)),
          ),
        ),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' } },
          h('input', { type: 'checkbox', checked: exportTransparent, onchange: (e) => { exportTransparent = e.target.checked; } }),
          'Transparent background (omit paper)',
        ),
      ),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => { exportJSON(); overlay.remove(); } }, '⬇ JSON'),
        h('button', { class: 'btn btn--primary', onclick: () => { exportPNG(); overlay.remove(); } }, '⬇ PNG'),
      ),
    ),
  );
  document.body.appendChild(overlay);
}

function labelCss() {
  return { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' };
}

// ─── Layers panel ─────────────────────────────────────────────────────────────

function toggleLayersPanel() {
  const existing = document.getElementById('fmap-layers-panel');
  if (existing) { existing.remove(); return; }
  const panel = h('div', { id: 'fmap-layers-panel', class: 'fmap__layers-panel' },
    h('div', { class: 'fmap__layers-head' }, 'Layers'),
    ...LAYER_ORDER.slice().reverse().map((id) => {
      const meta = LAYER_META[id];
      const st = project.layers[id] || { visible: true, opacity: 1 };
      return h('div', { class: 'fmap__layer-row' },
        h('button', {
          class: 'fmap__layer-eye', title: st.visible ? 'Hide' : 'Show',
          onclick: (e) => {
            st.visible = !st.visible; project.layers[id] = st;
            applyLayerOpacity(); save();
            // Update just this button in place (no full-panel rebuild/flicker).
            const btn = e.currentTarget;
            btn.textContent = st.visible ? '👁' : '🚫';
            btn.title = st.visible ? 'Hide' : 'Show';
          },
        }, st.visible ? '👁' : '🚫'),
        h('span', { class: 'fmap__layer-name' }, meta.label),
        h('input', {
          type: 'range', min: '0', max: '100', value: String(Math.round(st.opacity * 100)),
          class: 'fmap__layer-op', title: 'Opacity',
          oninput: (e) => { st.opacity = parseInt(e.target.value, 10) / 100; project.layers[id] = st; applyLayerOpacity(); scheduleSave(); },
        }),
      );
    }),
  );
  // Append into the module container (not document.body) so the panel is torn
  // down with the map DOM when the user navigates away or switches WB mode.
  (hostContainer || document.body).appendChild(panel);
}

// ─── Settings modal (canvas size + ornaments) ──────────────────────────────────

function openSettings() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const orn = project.ornaments;
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, 'Map settings'),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕'),
      ),
      h('div', { class: 'modal__body' },
        h('div', { style: { marginBottom: '12px' } },
          h('label', { style: labelCss() }, 'Canvas size'),
          h('select', { class: 'input', id: 'fmap-preset-select' },
            ...CANVAS_PRESETS.map((p) => {
              const match = p.width === project.width && p.height === project.height;
              return h('option', { value: p.id, selected: match ? 'selected' : null }, p.label);
            }),
          ),
          h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' } }, 'Everything (terrain, stamps, labels & paths) is rescaled proportionally to the new size.'),
        ),
        h('div', { style: labelCss() }, 'Ornaments'),
        ornToggle('Decorative frame', 'frame', orn),
        ornToggle('Compass rose', 'compass', orn),
        ornToggle('Scale bar', 'scale', orn),
      ),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Close'),
        h('button', { class: 'btn btn--primary', onclick: () => {
          const sel = document.getElementById('fmap-preset-select');
          if (sel) applyCanvasPreset(sel.value);
          overlay.remove();
        } }, 'Apply size'),
      ),
    ),
  );
  document.body.appendChild(overlay);
}

function ornToggle(label, key, orn) {
  return h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' } },
    h('input', {
      type: 'checkbox', checked: !!orn[key],
      onchange: (e) => { orn[key] = e.target.checked; renderOverlayLayer(); save(); },
    }),
    label,
  );
}

function applyCanvasPreset(id) {
  const p = getCanvasPreset(id);
  if (p.width === project.width && p.height === project.height) return;
  const oldW = project.width, oldH = project.height;
  const sx = p.width / oldW, sy = p.height / oldH;

  // Rescale everything proportionally so the composition survives a resize
  // instead of bunching in a corner: stamps, labels, and path points all move
  // and scale with the canvas.
  project.stamps.forEach((s) => { s.x *= sx; s.y *= sy; s.size *= (sx + sy) / 2; });
  project.labels.forEach((l) => { l.x *= sx; l.y *= sy; l.size = (l.size || 18) * (sx + sy) / 2; });
  project.paths.forEach((pa) => { pa.points = (pa.points || []).map((q) => ({ x: q.x * sx, y: q.y * sy })); });

  project.width = p.width; project.height = p.height;

  // Preserve the terrain raster by re-drawing it scaled into the new size.
  const old = document.getElementById('fmap-terrain');
  const snapshot = old ? old.toDataURL('image/png') : project.terrainDataUrl;
  if (snapshot) {
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement('canvas');
      tmp.width = p.width; tmp.height = p.height;
      tmp.getContext('2d').drawImage(img, 0, 0, oldW, oldH, 0, 0, p.width, p.height);
      // Stage the scaled raster and tell rerender() NOT to re-snapshot the
      // still-old on-screen canvas (which would clobber this scaled result).
      project.terrainDataUrl = tmp.toDataURL('image/png');
      _terrainStaged = true;
      save();
      rerender();
    };
    img.src = snapshot;
  } else {
    save();
    rerender();
  }
}

// Set when a caller (e.g. resize) has already staged the exact terrainDataUrl it
// wants; rerender() then skips its own re-snapshot of the on-screen canvas.
let _terrainStaged = false;

// ─── Re-render helper ──────────────────────────────────────────────────────────

function rerender() {
  // Re-render into the container this module was mounted in (the World Builder's
  // .wb-mode-body), NOT #main-content — reaching up to #main-content would wipe
  // the Diagram/Map mode toggle that lives above us.
  const container = hostContainer || document.querySelector('.wb-mode-body') || document.querySelector('.main-content');
  if (!container) return;
  // Drop any floating layers panel so it doesn't outlive the rebuilt DOM.
  const lp = document.getElementById('fmap-layers-panel');
  if (lp) lp.remove();
  // Preserve the raster terrain across the DOM rebuild (unless it was just
  // cleared, e.g. by a style switch → null, or a caller staged an exact raster
  // e.g. a resize re-fit → _terrainStaged, in which case leave it untouched).
  if (project.terrainDataUrl !== null && !_terrainStaged) {
    const c = document.getElementById('fmap-terrain');
    const snapshot = c ? c.toDataURL('image/png') : project.terrainDataUrl;
    project.terrainDataUrl = snapshot || project.terrainDataUrl;
  }
  _terrainStaged = false; // consume the one-shot staging flag
  container.innerHTML = '';
  renderFantasyMap(container);
}
