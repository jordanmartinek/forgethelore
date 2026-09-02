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
  defaultView, normalizeView, clampZoom, zoomAt, worldSurfaceSeed,
  normalizeBackdrop, backdropRect,
} from '../core/map-engine.js';

const STORE_KEY = 'fantasyMap';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Stamp catalog per style — a curated subset of world-shapes that read well as
// map icons. (The full 61-shape library is available; these are the map-useful
// ones grouped for the palette.)
// Stamps are organized into named GROUPS so hundreds of elements stay browsable
// (the palette renders collapsible sections + a search filter). Each group:
// { group: 'Label', items: [{ shape, label }] }. The full 200-shape library is
// available; these curate the map-useful ones by style.
const STAMP_SETS = {
  fantasy: [
    { group: 'Terrain', items: [
      { shape: 'mountain', label: 'Mountains' }, { shape: 'volcano', label: 'Volcano' },
      { shape: 'hill', label: 'Hills' }, { shape: 'forest', label: 'Forest' },
      { shape: 'pine_tree', label: 'Pines' }, { shape: 'tree', label: 'Tree' },
      { shape: 'cave', label: 'Cave' }, { shape: 'canyon', label: 'Canyon' },
    ]},
    { group: 'Water', items: [
      { shape: 'lake', label: 'Lake' }, { shape: 'waterfall', label: 'Falls' },
      { shape: 'ocean', label: 'Ocean' }, { shape: 'river', label: 'River' },
    ]},
    { group: 'Settlements', items: [
      { shape: 'metropolis', label: 'City' }, { shape: 'town', label: 'Town' },
      { shape: 'village', label: 'Village' }, { shape: 'district', label: 'District' },
    ]},
    { group: 'Structures', items: [
      { shape: 'castle', label: 'Castle' }, { shape: 'fortress', label: 'Fortress' },
      { shape: 'tower', label: 'Tower' }, { shape: 'temple', label: 'Temple' },
      { shape: 'ruins', label: 'Ruins' }, { shape: 'house', label: 'House' },
      { shape: 'hut', label: 'Hut' }, { shape: 'tent', label: 'Tent' },
      { shape: 'bridge', label: 'Bridge' }, { shape: 'wall', label: 'Wall' },
      { shape: 'monument', label: 'Monument' },
    ]},
    { group: 'Building Parts', items: [
      { shape: 'wall_straight', label: 'Wall' }, { shape: 'wall_corner', label: 'Corner' },
      { shape: 'door_single', label: 'Door' }, { shape: 'gate', label: 'Gate' },
      { shape: 'stairs', label: 'Stairs' }, { shape: 'stairs_spiral', label: 'Spiral' },
      { shape: 'column', label: 'Column' }, { shape: 'archway', label: 'Arch' },
      { shape: 'fence', label: 'Fence' }, { shape: 'roof_gable', label: 'Roof' },
      { shape: 'chimney', label: 'Chimney' }, { shape: 'balcony', label: 'Balcony' },
    ]},
    { group: 'Rooms', items: [
      { shape: 'room_square', label: 'Square' }, { shape: 'room_wide', label: 'Wide' },
      { shape: 'room_tall', label: 'Tall' }, { shape: 'room_l', label: 'L-Room' },
      { shape: 'room_t', label: 'T-Room' }, { shape: 'room_round', label: 'Round' },
      { shape: 'room_oct', label: 'Octagon' }, { shape: 'corridor_h', label: 'Hall (H)' },
      { shape: 'corridor_v', label: 'Hall (V)' }, { shape: 'corridor_cross', label: 'Cross' },
      { shape: 'corridor_corner', label: 'Bend' }, { shape: 'vault_room', label: 'Vault' },
    ]},
    { group: 'Furniture', items: [
      { shape: 'bed', label: 'Bed' }, { shape: 'table_round', label: 'Table' },
      { shape: 'table_long', label: 'Long Table' }, { shape: 'chair', label: 'Chair' },
      { shape: 'desk', label: 'Desk' }, { shape: 'shelf', label: 'Shelf' },
      { shape: 'crate', label: 'Crate' }, { shape: 'barrel', label: 'Barrel' },
      { shape: 'statue', label: 'Statue' }, { shape: 'fountain', label: 'Fountain' },
      { shape: 'pillar', label: 'Pillar' }, { shape: 'planter', label: 'Planter' },
    ]},
    { group: 'Markers', items: [
      { shape: 'pin', label: 'Pin' }, { shape: 'marker_star', label: 'Star' },
      { shape: 'marker_flag', label: 'Flag' }, { shape: 'marker_shield', label: 'Shield' },
      { shape: 'marker_x', label: 'X' }, { shape: 'marker_skull', label: 'Skull' },
      { shape: 'marker_danger', label: 'Danger' }, { shape: 'marker_diamond', label: 'Diamond' },
      { shape: 'marker_cross', label: 'Cross' }, { shape: 'marker_anchor', label: 'Anchor' },
    ]},
  ],
  scifi: [
    { group: 'Cosmic', items: [
      { shape: 'sun', label: 'Star' }, { shape: 'planet', label: 'Planet' },
      { shape: 'ringed_planet', label: 'Ringed World' }, { shape: 'gas_giant', label: 'Gas Giant' },
      { shape: 'moon', label: 'Moon' }, { shape: 'asteroid_belt', label: 'Belt' },
      { shape: 'nebula', label: 'Nebula' }, { shape: 'anomaly', label: 'Anomaly' },
      { shape: 'void_conduit', label: 'Wormhole' },
    ]},
    { group: 'Fleets & Craft', items: [
      { shape: 'spaceship', label: 'Ship' }, { shape: 'fleet', label: 'Fleet' },
      { shape: 'shuttle', label: 'Shuttle' }, { shape: 'fighter', label: 'Fighter' },
      { shape: 'freighter', label: 'Freighter' }, { shape: 'gunship', label: 'Gunship' },
      { shape: 'probe', label: 'Probe' }, { shape: 'drone', label: 'Drone' },
      { shape: 'hovercar', label: 'Hovercar' }, { shape: 'rover', label: 'Rover' },
      { shape: 'tank', label: 'Tank' }, { shape: 'transport', label: 'Transport' },
      { shape: 'mech', label: 'Mech' },
    ]},
    { group: 'Stations', items: [
      { shape: 'space_station', label: 'Station' }, { shape: 'satellite', label: 'Satellite' },
      { shape: 'megastructure', label: 'Megastructure' }, { shape: 'portal', label: 'Jump Gate' },
      { shape: 'module_hub', label: 'Hub' }, { shape: 'module_ring', label: 'Ring' },
      { shape: 'module_cylinder', label: 'Cylinder' }, { shape: 'module_solar', label: 'Solar Wing' },
      { shape: 'module_dock', label: 'Dock' }, { shape: 'module_habitat', label: 'Habitat' },
      { shape: 'module_comms', label: 'Comms' }, { shape: 'truss', label: 'Truss' },
      { shape: 'cupola', label: 'Cupola' }, { shape: 'gravity_ring', label: 'Gravity Ring' },
      { shape: 'drydock', label: 'Drydock' }, { shape: 'refinery', label: 'Refinery' },
    ]},
    { group: 'Ship Parts', items: [
      { shape: 'hull_fore', label: 'Fore Hull' }, { shape: 'hull_mid', label: 'Mid Hull' },
      { shape: 'hull_aft', label: 'Aft Hull' }, { shape: 'cockpit', label: 'Cockpit' },
      { shape: 'wing_left', label: 'Wing L' }, { shape: 'wing_right', label: 'Wing R' },
      { shape: 'thruster', label: 'Thruster' }, { shape: 'engine_pod', label: 'Engine' },
      { shape: 'nacelle', label: 'Nacelle' }, { shape: 'reactor_core', label: 'Reactor' },
      { shape: 'fuel_tank', label: 'Fuel Tank' }, { shape: 'cargo_pod', label: 'Cargo Pod' },
      { shape: 'landing_gear', label: 'Landing Gear' }, { shape: 'weapon_turret', label: 'Turret' },
      { shape: 'shield_gen', label: 'Shield Gen' }, { shape: 'docking_ring', label: 'Docking Ring' },
      { shape: 'escape_pod', label: 'Escape Pod' }, { shape: 'sensor_array', label: 'Sensors' },
    ]},
    { group: 'Rooms', items: [
      { shape: 'room_square', label: 'Room' }, { shape: 'room_round', label: 'Round Room' },
      { shape: 'corridor_h', label: 'Hall (H)' }, { shape: 'corridor_v', label: 'Hall (V)' },
      { shape: 'corridor_cross', label: 'Cross' }, { shape: 'corridor_corner', label: 'Bend' },
      { shape: 'airlock', label: 'Airlock' }, { shape: 'bridge_room', label: 'Bridge' },
      { shape: 'medbay', label: 'Medbay' }, { shape: 'armory', label: 'Armory' },
      { shape: 'cargo_bay', label: 'Cargo Bay' }, { shape: 'engine_room', label: 'Engine Room' },
      { shape: 'reactor_room', label: 'Reactor Room' }, { shape: 'quarters', label: 'Quarters' },
      { shape: 'lab_room', label: 'Lab' }, { shape: 'hangar', label: 'Hangar' },
      { shape: 'vault_room', label: 'Vault' }, { shape: 'observatory', label: 'Observatory' },
    ]},
    { group: 'Furniture & Tech', items: [
      { shape: 'bed', label: 'Bed' }, { shape: 'bunk', label: 'Bunk' },
      { shape: 'console', label: 'Console' }, { shape: 'terminal', label: 'Terminal' },
      { shape: 'workbench', label: 'Workbench' }, { shape: 'server_rack', label: 'Servers' },
      { shape: 'screen', label: 'Screen' }, { shape: 'locker', label: 'Locker' },
      { shape: 'container', label: 'Container' }, { shape: 'cryopod', label: 'Cryopod' },
      { shape: 'hydroponics', label: 'Hydroponics' }, { shape: 'holotable', label: 'Holotable' },
      { shape: 'data_core', label: 'Data Core' }, { shape: 'generator', label: 'Generator' },
      { shape: 'scanner', label: 'Scanner' },
    ]},
    { group: 'Props & POI', items: [
      { shape: 'beacon', label: 'Beacon' }, { shape: 'relay', label: 'Relay' },
      { shape: 'turret_gun', label: 'Gun Turret' }, { shape: 'power_node', label: 'Power Node' },
      { shape: 'jump_gate', label: 'Jump Gate' }, { shape: 'satellite_dish', label: 'Dish' },
      { shape: 'mine', label: 'Mine' }, { shape: 'crate_supply', label: 'Supply Crate' },
      { shape: 'solar_panel', label: 'Solar Panel' }, { shape: 'antenna_dish', label: 'Antenna' },
      { shape: 'waypoint', label: 'Waypoint' }, { shape: 'flag', label: 'Flag' },
    ]},
    { group: 'Markers', items: [
      { shape: 'pin', label: 'Pin' }, { shape: 'marker_star', label: 'Star' },
      { shape: 'marker_target', label: 'Target' }, { shape: 'marker_diamond', label: 'Diamond' },
      { shape: 'marker_danger', label: 'Danger' }, { shape: 'marker_dot', label: 'Dot' },
      { shape: 'marker_x', label: 'X' }, { shape: 'marker_cross', label: 'Cross' },
    ]},
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
  // Fantasy structures & geography extras
  fortress: '#a89878', house: '#c0a878', hut: '#b89a63', tent: '#c9b382', bridge: '#9a8f7a',
  wall: '#9a8f7a', monument: '#c8bda0', district: '#9c8a63', canyon: '#b0764e',
  ocean: '#3f6b8a', river: '#4f86a8',
  // Rooms / corridors (neutral hull grey)
  room_square: '#8b93a0', room_wide: '#8b93a0', room_tall: '#8b93a0', room_l: '#8b93a0',
  room_t: '#8b93a0', room_round: '#8b93a0', room_oct: '#8b93a0',
  corridor_h: '#7d8590', corridor_v: '#7d8590', corridor_cross: '#7d8590', corridor_corner: '#7d8590',
  airlock: '#96a0ad', bridge_room: '#8aa0b8', medbay: '#c8d4dc', armory: '#8a8f96',
  cargo_bay: '#9a8f6a', engine_room: '#a08a6a', reactor_room: '#b0906a', quarters: '#96a0ad',
  lab_room: '#9ec8d0', hangar: '#7d8590', vault_room: '#9aa0a8', observatory: '#8aa0c0',
  // Furniture / fixtures (warm neutral)
  bed: '#b7a488', bunk: '#a89880', table_round: '#b89a70', table_long: '#b89a70', desk: '#a88f68',
  chair: '#a88f68', sofa: '#8a7f9a', console: '#7d8fa0', terminal: '#7d8fa0', workbench: '#98907e',
  shelf: '#a88f68', locker: '#8f96a0', crate: '#a8895c', barrel: '#8a6f4a', container: '#8a9a6a',
  planter: '#7a8f5a', lamp: '#c8b878', screen: '#6f8296', server_rack: '#7d8590', toilet: '#d8e0e6',
  sink: '#d0dce4', stove: '#9096a0', fridge: '#c0ccd4', statue: '#c8c0a8', fountain: '#8fb0c0',
  pillar: '#c8c0a8', hydroponics: '#6f9a5a', cryopod: '#9ec4dc',
  // Building parts
  wall_straight: '#9a9088', wall_corner: '#9a9088', door_single: '#a08a68', door_double: '#a08a68',
  blast_door: '#8f96a0', window_row: '#a0b0bc', stairs: '#a09888', stairs_spiral: '#a09888',
  ladder: '#98907e', elevator: '#8f96a0', ramp: '#9a9088', column: '#c8c0a8', archway: '#b8b09a',
  gate: '#9a8f7a', fence: '#98907e', roof_gable: '#a06850', chimney: '#8a7f76', balcony: '#b8b09a',
  solar_panel: '#3a6bbf', antenna_dish: '#b0b8c0', turbine: '#c0c8d0',
  // Ship parts (cool metallic)
  hull_fore: '#9aa4b0', hull_mid: '#9aa4b0', hull_aft: '#9aa4b0', cockpit: '#8fb0d0',
  wing_left: '#8f98a4', wing_right: '#8f98a4', thruster: '#a08f8a', engine_pod: '#8a94a0',
  nacelle: '#8fa0b8', reactor_core: '#7fd0c0', fuel_tank: '#a0a8b0', cargo_pod: '#9a8f6a',
  landing_gear: '#8f96a0', weapon_turret: '#8a8f96', shield_gen: '#7fb8e0', docking_ring: '#a0a8b0',
  escape_pod: '#c8b878', sensor_array: '#8fa0b8',
  // Station modules
  module_hub: '#9aa4b0', module_ring: '#9aa4b0', module_cylinder: '#9aa4b0', module_solar: '#7d8fa0',
  module_dock: '#8f96a0', module_habitat: '#96a4b0', module_comms: '#8fa0b8', truss: '#8f96a0',
  cupola: '#8fb0d0', gravity_ring: '#9aa4b0', drydock: '#8a9096', refinery: '#a08f70',
  // Sci-fi props
  beacon: '#ffcf6a', relay: '#8fb8e0', turret_gun: '#8a8f96', generator: '#e0b060', power_node: '#7fd0ff',
  scanner: '#7fd0c0', holotable: '#7fd0ff', data_core: '#8fa0e0', jump_gate: '#c07fff', drone: '#9aa4b0',
  mech: '#8f96a0', rover: '#b0a070', satellite_dish: '#b0b8c0', mine: '#8a8f96', crate_supply: '#a8895c',
  waypoint: '#7fd0ff', flag: '#e05a5a',
  // Vehicles
  shuttle: '#b0bcc8', fighter: '#9aa4b0', freighter: '#9a8f6a', hovercar: '#8fb0d0', tank: '#7d8560',
  transport: '#9aa0a8', gunship: '#8a9096', probe: '#b0b8c0',
  // Markers
  pin: '#e05a5a', marker_x: '#e05a5a', marker_star: '#f5b73c', marker_diamond: '#7fd0ff',
  marker_flag: '#e05a5a', marker_shield: '#6f9ae0', marker_skull: '#d8d0c0', marker_danger: '#f5a623',
  marker_target: '#e05a5a', marker_dot: '#7fd0ff', marker_cross: '#e05a5a', marker_anchor: '#8fa0b8',
};

// When you paint a stroke of one element, mix in related shapes so a "forest"
// isn't a row of identical trees. The active shape is always included; the
// scatter picks among these per placement. Shapes not listed just use themselves.
const STAMP_VARIANTS = {
  forest: ['forest', 'tree', 'pine_tree'],
  tree: ['tree', 'pine_tree', 'forest'],
  pine_tree: ['pine_tree', 'tree', 'forest'],
  mountain: ['mountain', 'hill', 'volcano'],
  hill: ['hill', 'mountain'],
  metropolis: ['metropolis', 'town'],
  town: ['town', 'village', 'metropolis'],
  village: ['village', 'town'],
  asteroid_belt: ['asteroid_belt', 'moon'],
  fleet: ['fleet', 'spaceship'],
  spaceship: ['spaceship', 'fleet'],
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
let panState = null;           // { startX, startY, panX, panY } while panning
let spaceHeld = false;         // spacebar held → drag-to-pan
let _panKeysBound = false;     // guard so we only bind the space listeners once
let stampFilter = '';          // stamp palette search query (case-insensitive)

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
    applyViewTransform();  // restore any saved zoom/pan
  });
  bindPanKeys();
}

/** Bind spacebar → temporary pan mode (like design tools). Bound once. */
function bindPanKeys() {
  if (_panKeysBound) return;
  _panKeysBound = true;
  window.addEventListener('keydown', (e) => {
    // Ignore when typing into an input/textarea (e.g. editing a label).
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Space' && !spaceHeld) {
      // Only engage if the map is actually on screen.
      if (!document.getElementById('fmap-surface')) return;
      spaceHeld = true;
      const surf = document.getElementById('fmap-surface');
      if (surf && !panState) surf.style.cursor = 'grab';
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      const surf = document.getElementById('fmap-surface');
      // Keep the Pan tool's grab cursor after Space is released (mirror the
      // pointer-up path); other tools fall back to the default cursor.
      if (surf && !panState) surf.style.cursor = tool === 'pan' ? 'grab' : '';
    }
  });
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function renderToolbar() {
  const tools = [
    { id: 'pan', icon: '✋', label: 'Pan · drag to move, scroll to zoom' },
    { id: 'brush', icon: '🖌️', label: 'Terrain brush' },
    { id: 'erase', icon: '🧽', label: 'Erase terrain' },
    { id: 'path', icon: '〰️', label: 'Paths & routes' },
    { id: 'stamp', icon: '🌲', label: 'Stamp' },
    { id: 'label', icon: '🔤', label: 'Label' },
    { id: 'select', icon: '⤢', label: 'Select · Move · Resize' },
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
      h('button', {
        class: `btn btn--sm btn--ghost ${project.backdrop ? 'fmap__act--on' : ''}`,
        title: project.backdrop ? 'Backdrop image (click to replace or remove)' : 'Import a reference image to paint & place over',
        onclick: openBackdropMenu,
      }, '🖼'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Map settings', onclick: openSettings }, '⚙'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Clear map', onclick: clearMap }, '🗑'),
      h('button', { class: 'btn btn--sm btn--primary', title: 'Export', onclick: exportMap }, '⬇ Export'),
    ),
  );
}

// ─── Backdrop image import ───────────────────────────────────────────────────

/**
 * Open (or trigger) image import. If a backdrop already exists, show a small
 * menu to replace it, change its fit, or remove it; otherwise go straight to
 * the file picker.
 */
function openBackdropMenu() {
  if (!project.backdrop) { pickBackdropImage(); return; }
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal', style: { maxWidth: '360px' } },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, 'Backdrop image'),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕'),
      ),
      h('div', { class: 'modal__body' },
        h('div', { style: labelCss() }, 'Fit'),
        h('select', { class: 'input', onchange: (e) => { setBackdropFit(e.target.value); } },
          ...['contain', 'cover', 'stretch'].map((f) => h('option', {
            value: f, selected: (project.backdrop.fit || 'contain') === f ? 'selected' : null,
          }, f.charAt(0).toUpperCase() + f.slice(1))),
        ),
        h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' } },
          'Contain shows the whole image; Cover fills the canvas (may crop); Stretch distorts to fit.'),
      ),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn btn--ghost', onclick: () => { removeBackdrop(); overlay.remove(); } }, '🗑 Remove'),
        h('button', { class: 'btn', onclick: () => { pickBackdropImage(); overlay.remove(); } }, 'Replace…'),
        h('button', { class: 'btn btn--primary', onclick: () => overlay.remove() }, 'Done'),
      ),
    ),
  );
  document.body.appendChild(overlay);
}

/** Trigger a hidden file input to choose an image, then load it as the backdrop. */
function pickBackdropImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toastInfo('Image is too large (max 12 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => { loadBackdropFromDataUrl(String(reader.result)); };
    reader.onerror = () => toastInfo('Could not read that image.');
    reader.readAsDataURL(file);
  };
  document.body.appendChild(input);
  input.click();
}

/**
 * Set the backdrop from a data URL. Offers to match the canvas aspect ratio to
 * the image so it isn't heavily letterboxed, then repaints + persists.
 */
function loadBackdropFromDataUrl(dataUrl) {
  const bd = normalizeBackdrop({ dataUrl, fit: 'contain' });
  if (!bd) { toastInfo('That file is not a supported image.'); return; }
  const img = new Image();
  img.onload = () => {
    project.backdrop = bd;
    // Offer to reshape the canvas to the image aspect (keeps content coherent
    // and avoids big empty margins). Only when the aspect differs noticeably.
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = project.width / project.height;
    if (Math.abs(imgAspect - canvasAspect) > 0.06
        && confirm('Resize the canvas to match this image\u2019s shape? (Your terrain, stamps & labels are rescaled to fit.)')) {
      const longEdge = Math.max(project.width, project.height);
      let nw; let nh;
      if (imgAspect >= 1) { nw = longEdge; nh = Math.round(longEdge / imgAspect); }
      else { nh = longEdge; nw = Math.round(longEdge * imgAspect); }
      applyCanvasSize(nw, nh);   // rescales content + repaints (repaints surface too)
    } else {
      paintSurface();
      save();
    }
    toastSuccess('Backdrop image set — paint and place elements over it.');
  };
  img.onerror = () => toastInfo('Could not load that image.');
  img.src = dataUrl;
}

function setBackdropFit(fit) {
  if (!project.backdrop) return;
  project.backdrop = normalizeBackdrop({ ...project.backdrop, fit });
  _backdropSrc = null; // force redraw with the new fit
  paintSurface();
  save();
}

function removeBackdrop() {
  project.backdrop = null;
  _backdropImg = null; _backdropSrc = null;
  save();
  rerender();       // rebuilds the toolbar (backdrop button state) + repaints
  toastInfo('Backdrop removed.');
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
  if (tool === 'pan') return panPalette();
  return hintPalette();
}

function panPalette() {
  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, 'Navigate'),
    h('div', { class: 'fmap__pal-hint' },
      'Drag to pan. Scroll to zoom in/out toward the cursor. ',
      'You can also pan in any tool by dragging with the middle mouse button, or holding Space.'),
    h('div', { class: 'fmap__pal-actions' },
      h('button', { class: 'btn btn--sm btn--ghost', onclick: fitView }, 'Fit to screen'),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: resetView }, 'Reset 100%'),
    ),
  );
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
  const groups = STAMP_SETS[project.style] || STAMP_SETS.fantasy;
  const q = stampFilter.trim().toLowerCase();

  // Build a stamp button.
  const stampBtn = (it) => h('button', {
    class: `fmap__stamp ${activeStamp === it.shape ? 'fmap__stamp--active' : ''}`,
    title: it.label,
    onclick: () => { activeStamp = it.shape; refreshPalette(); },
  },
    h('span', { class: 'fmap__stamp-art', innerHTML: stampSVG(it.shape, stampColor(it.shape), 34) }),
    h('span', { class: 'fmap__stamp-label' }, it.label),
  );

  // When searching, show a single flat filtered grid across all groups.
  let sections;
  if (q) {
    const hits = groups.flatMap((g) => g.items).filter(
      (it) => it.label.toLowerCase().includes(q) || it.shape.replace(/_/g, ' ').includes(q),
    );
    sections = hits.length
      ? [h('div', { class: 'fmap__stamp-grid' }, ...hits.map(stampBtn))]
      : [h('div', { class: 'fmap__pal-hint' }, `No stamps match “${stampFilter}”.`)];
  } else {
    // Grouped, collapsible sections. Collapsed set tracked in module state.
    sections = groups.map((g) => {
      const open = !collapsedStampGroups.has(g.group);
      return h('div', { class: 'fmap__stamp-group' },
        h('button', { class: 'fmap__stamp-group-head', onclick: () => { toggleStampGroup(g.group); } },
          h('span', {}, `${open ? '▾' : '▸'} ${g.group}`),
          h('span', { class: 'fmap__stamp-group-count' }, String(g.items.length)),
        ),
        open ? h('div', { class: 'fmap__stamp-grid' }, ...g.items.map(stampBtn)) : null,
      );
    });
  }

  return h('div', {},
    h('div', { class: 'fmap__pal-title' }, 'Stamps'),
    h('input', {
      class: 'input fmap__stamp-search', type: 'search', placeholder: 'Search elements…',
      value: stampFilter,
      oninput: (e) => { stampFilter = e.target.value; refreshStampGridOnly(); },
    }),
    h('div', { class: 'fmap__stamp-scroll' }, ...sections),
    sliderRow('Size', stampOpts.size, 16, 140, (v) => { stampOpts.size = v; }),
    sliderRow('Density', Math.round(stampOpts.density * 10), 5, 80, (v) => { stampOpts.density = v / 10; }),
    sliderRow('Jitter', Math.round(stampOpts.jitter * 100), 0, 100, (v) => { stampOpts.jitter = v / 100; }),
    h('div', { class: 'fmap__pal-hint' }, 'Drag on the map to scatter, or click to place one.'),
  );
}

// Collapsed stamp groups (by group label). Persists for the session only.
const collapsedStampGroups = new Set();
function toggleStampGroup(name) {
  if (collapsedStampGroups.has(name)) collapsedStampGroups.delete(name);
  else collapsedStampGroups.add(name);
  refreshStampGridOnly();
}

// Re-render just the stamp palette body without stealing focus from the search
// box (a full refreshPalette() rebuilds the input and drops the caret).
function refreshStampGridOnly() {
  const el = document.getElementById('fmap-palette');
  if (!el) return;
  const active = document.activeElement;
  const wasSearch = active && active.classList && active.classList.contains('fmap__stamp-search');
  el.innerHTML = '';
  el.appendChild(stampPalette());
  if (wasSearch) {
    const box = el.querySelector('.fmap__stamp-search');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
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
  const setSize = (v) => { lb.size = clamp(Math.round(v), 8, 160); renderLabelsLayer(); renderOverlayLayer(); refreshPalette(); scheduleSave(); };
  return h('div', { class: 'fmap__pal-box' },
    h('div', { class: 'fmap__pal-sub' }, `Selected label: “${lb.text}”`),
    resizeControl('Size', lb.size || 18, 8, 160, setSize),
    sliderRow('Curve', Math.round((lb.curve || 0) * 100), -100, 100, (v) => { lb.curve = v / 100; renderLabelsLayer(); scheduleSave(); }),
    h('select', { class: 'input', onchange: (e) => { lb.font = e.target.value; renderLabelsLayer(); scheduleSave(); } },
      ...FONTS.map((f) => h('option', { value: f.id, selected: (lb.font || 'serif') === f.id ? 'selected' : null }, f.label)),
    ),
    h('button', { class: 'btn btn--sm', style: { color: 'var(--danger)', width: '100%', marginTop: '6px' }, onclick: () => deleteSelectedLabel() }, '🗑 Delete label'),
  );
}

/**
 * A prominent resize control: −/+ step buttons flanking a size slider, with the
 * current value shown. Both stamps and labels use it, so "resize after placing"
 * is obvious no matter how the user prefers to interact.
 */
function resizeControl(label, value, min, max, setValue) {
  const v = Math.round(value);
  const step = Math.max(1, Math.round((max - min) / 40));
  return h('div', { class: 'fmap__resize' },
    h('div', { class: 'fmap__resize-head' },
      h('span', {}, `⤢ ${label}`),
      h('span', { class: 'fmap__resize-val' }, String(v)),
    ),
    h('div', { class: 'fmap__resize-row' },
      h('button', { class: 'fmap__resize-btn', title: 'Smaller', onclick: () => setValue(v - step) }, '−'),
      h('input', {
        type: 'range', min: String(min), max: String(max), value: String(clamp(v, min, max)),
        class: 'fmap__resize-slider',
        oninput: (e) => setValue(parseInt(e.target.value, 10)),
      }),
      h('button', { class: 'fmap__resize-btn', title: 'Bigger', onclick: () => setValue(v + step) }, '+'),
    ),
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
    selectedStampId ? (() => {
      const s = project.stamps.find((x) => x.id === selectedStampId);
      return h('div', { class: 'fmap__pal-box' },
        h('div', { class: 'fmap__pal-sub' }, 'Selected element'),
        resizeControl('Size', (s && s.size) || 46, 12, 400, (v) => { if (s) { s.size = clamp(Math.round(v), 12, 400); renderStampsLayer(); renderOverlayLayer(); refreshPalette(); scheduleSave(); } }),
        h('button', { class: 'btn btn--sm', style: { color: 'var(--danger)', width: '100%', marginTop: '6px' }, onclick: () => deleteSelectedStamp() }, '🗑 Delete'),
      );
    })() : null,
    selectedPathId ? h('div', { class: 'fmap__pal-box' },
      h('div', { class: 'fmap__pal-sub' }, 'Selected path'),
      h('button', { class: 'btn btn--sm', style: { color: 'var(--danger)', width: '100%' }, onclick: () => deleteSelectedPath() }, '🗑 Delete path'),
    ) : null,
    (selectedStampId || selectedLabelId)
      ? h('div', { class: 'fmap__pal-hint' }, 'Resize with the −/+ buttons or slider above, or drag the blue corner handle on the map. Drag the element itself to move it.')
      : null,
    (!selectedLabelId && !selectedStampId && !selectedPathId)
      ? h('div', { class: 'fmap__pal-hint' }, 'Click any element on the map to select it — then resize it here (−/+ , slider, or the corner handle), move it by dragging, or delete it.')
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
  // A positioned wrapper holds the scrolling canvas viewport AND a zoom dock
  // that stays pinned to the corner (the dock is a sibling of the scroller so
  // it doesn't scroll away with a large/zoomed map).
  return h('div', { class: 'fmap__stage-wrap' },
    h('div', { class: 'fmap__stage', id: 'fmap-stage', onwheel: onStageWheel },
      h('div', { class: 'fmap__frame', id: 'fmap-frame', style: frameStyle(w, hgt) },
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
    ),
    zoomControls(),
    // A subtle, always-visible reminder of how to navigate — panning isn't
    // discoverable otherwise (left-drag only pans with the Pan tool active).
    h('div', { class: 'fmap__navhint', title: 'Scroll to zoom. Hold Space and drag, or use the middle mouse button, to pan in any tool. Or pick the ✋ Pan tool and just drag.' },
      '✋ drag with the Pan tool · Space-drag or middle-drag to pan · scroll to zoom'),
  );
}

/** Inline style for the map frame, applying the current view transform. */
function frameStyle(w, hgt) {
  const v = view();
  return {
    width: `${w}px`,
    height: `${hgt}px`,
    transform: `translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`,
    transformOrigin: '0 0',
  };
}

/** Floating zoom controls docked in the stage corner. */
function zoomControls() {
  const pct = Math.round(view().zoom * 100);
  return h('div', { class: 'fmap__zoom', id: 'fmap-zoom' },
    h('button', { class: 'fmap__zoom-btn', title: 'Zoom out (−)', onclick: () => zoomBy(1 / 1.2) }, '−'),
    h('button', { class: 'fmap__zoom-label', title: 'Reset view (fit 100%)', onclick: resetView }, `${pct}%`),
    h('button', { class: 'fmap__zoom-btn', title: 'Zoom in (+)', onclick: () => zoomBy(1.2) }, '+'),
    h('button', { class: 'fmap__zoom-btn fmap__zoom-fit', title: 'Fit to screen', onclick: fitView }, '⤢'),
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

// ─── View (zoom + pan) ────────────────────────────────────────────────────

/** Current viewport transform (always normalized). */
function view() {
  if (!project.view) project.view = defaultView();
  return project.view;
}

/** Apply the current view transform to the frame + refresh the zoom readout. */
function applyViewTransform() {
  const frame = document.getElementById('fmap-frame');
  if (frame) frame.style.transform = `translate(${view().panX}px, ${view().panY}px) scale(${view().zoom})`;
  // Update only the percentage text — cheap enough to run on every pan move
  // without tearing down and rebuilding the whole dock each frame.
  const label = document.querySelector('#fmap-zoom .fmap__zoom-label');
  if (label) label.textContent = `${Math.round(view().zoom * 100)}%`;
}

/** Set a new view (normalized), reflect it in the DOM, and persist. */
function setView(next) {
  project.view = normalizeView(next);
  applyViewTransform();
  scheduleSave();
}

/** Zoom toward the center of the visible stage by a factor. */
function zoomBy(factor) {
  const stage = document.getElementById('fmap-stage');
  const frame = document.getElementById('fmap-frame');
  if (!stage || !frame) { setView({ ...view(), zoom: clampZoom(view().zoom * factor) }); return; }
  // Anchor at the center of the stage viewport, expressed relative to the
  // frame's laid-out (untransformed) origin.
  const sRect = stage.getBoundingClientRect();
  const fRect = frame.getBoundingClientRect();
  const anchor = {
    x: (sRect.left + sRect.width / 2 - fRect.left) / view().zoom,
    y: (sRect.top + sRect.height / 2 - fRect.top) / view().zoom,
  };
  setView(zoomAt(view(), factor, anchor));
}

/** Reset to 100% and no pan. */
function resetView() {
  setView(defaultView());
}

/** Fit the whole map inside the visible stage. */
function fitView() {
  const stage = document.getElementById('fmap-stage');
  if (!stage) return;
  const pad = 48;
  const availW = stage.clientWidth - pad;
  const availH = stage.clientHeight - pad;
  const zoom = clampZoom(Math.min(availW / project.width, availH / project.height));
  // Center the scaled map in the stage.
  const panX = Math.max(0, (stage.clientWidth - project.width * zoom) / 2);
  const panY = Math.max(0, (stage.clientHeight - project.height * zoom) / 2);
  setView({ zoom, panX, panY });
}

/** Mouse wheel / trackpad zooms toward the cursor (no modifier needed). */
function onStageWheel(e) {
  e.preventDefault();
  const frame = document.getElementById('fmap-frame');
  if (!frame) return;
  const fRect = frame.getBoundingClientRect();
  const anchor = {
    x: (e.clientX - fRect.left) / view().zoom,
    y: (e.clientY - fRect.top) / view().zoom,
  };
  // Scale the step with deltaY magnitude so trackpads feel smooth and a mouse
  // notch feels responsive, but clamp so one big delta can't jump too far.
  const mag = Math.min(Math.abs(e.deltaY), 60) / 60; // 0..1
  const step = 1 + 0.18 * mag;
  const factor = e.deltaY < 0 ? step : 1 / step;
  setView(zoomAt(view(), factor, anchor));
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

  // When an imported reference image is set, it becomes the canvas backdrop:
  // paint a neutral base then the image on top (skip the procedural texture +
  // vignette so the photo/map reads clearly). Terrain/stamps/labels go over it.
  if (project.backdrop && project.backdrop.dataUrl) {
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(0, 0, w, hgt);
    paintBackdrop(ctx, w, hgt);
    return;
  }

  if (surf.kind === 'stars') paintStarfield(ctx, w, hgt, surf);
  else if (surf.kind === 'grid') paintGrid(ctx, w, hgt, surf);
  else if (surf.kind === 'world') paintWorldSurface(ctx, w, hgt, surf);
  else paintPaperGrain(ctx, w, hgt, surf);

  // Vignette.
  const vg = ctx.createRadialGradient(w / 2, hgt / 2, Math.min(w, hgt) * 0.45, w / 2, hgt / 2, Math.max(w, hgt) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, surf.vignette);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, hgt);
}

// Decoded backdrop image cache, keyed by data URL so we don't re-decode on
// every repaint.
let _backdropImg = null;
let _backdropSrc = null;

/**
 * Draw the imported backdrop image onto the paper layer, fitted to the canvas
 * per its `fit` mode. Decodes async; when the image finishes loading it repaints
 * the paper layer once so the backdrop appears without a manual refresh.
 */
function paintBackdrop(ctx, w, hgt) {
  const bd = project.backdrop;
  if (!bd || !bd.dataUrl) return;
  if (_backdropSrc !== bd.dataUrl) {
    _backdropImg = new Image();
    _backdropSrc = bd.dataUrl;
    _backdropImg.onload = () => { paintSurface(); }; // repaint once decoded
    _backdropImg.src = bd.dataUrl;
  }
  const img = _backdropImg;
  if (img && img.complete && img.naturalWidth) {
    const r = backdropRect(bd.fit || 'contain', img.naturalWidth, img.naturalHeight, w, hgt);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  }
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

// Per-world-type look: [feature blotch colors], speckle color, and how the
// surface texture reads (mottled/banded/patchy). Drives paintWorldSurface().
const WORLD_LOOKS = {
  barren:     { blots: ['rgba(120,108,92,0.30)', 'rgba(70,60,48,0.28)'], speck: 'rgba(40,32,22,0.35)', craters: true },
  lush:       { blots: ['rgba(80,150,90,0.32)', 'rgba(40,100,55,0.30)', 'rgba(120,170,80,0.22)'], speck: 'rgba(20,60,28,0.30)' },
  industrial: { blots: ['rgba(90,96,108,0.34)', 'rgba(60,64,72,0.30)'], speck: 'rgba(255,180,90,0.20)', circuits: true },
  oceanic:    { blots: ['rgba(90,170,210,0.30)', 'rgba(40,110,160,0.28)', 'rgba(150,200,170,0.16)'], speck: 'rgba(220,245,255,0.22)' },
  ice:        { blots: ['rgba(220,235,245,0.42)', 'rgba(150,180,205,0.30)'], speck: 'rgba(255,255,255,0.40)', cracks: true },
  desert:     { blots: ['rgba(210,170,110,0.30)', 'rgba(160,110,60,0.28)'], speck: 'rgba(90,60,26,0.28)', dunes: true },
  volcanic:   { blots: ['rgba(150,50,30,0.34)', 'rgba(80,20,12,0.32)'], speck: 'rgba(255,120,40,0.28)', lava: true },
  toxic:      { blots: ['rgba(140,170,60,0.32)', 'rgba(90,120,30,0.30)'], speck: 'rgba(200,255,120,0.24)' },
  gas:        { blots: ['rgba(220,180,130,0.30)', 'rgba(170,120,70,0.30)', 'rgba(240,220,190,0.22)'], speck: 'rgba(255,240,220,0.14)', bands: true },
  crystal:    { blots: ['rgba(150,120,220,0.32)', 'rgba(90,70,160,0.30)'], speck: 'rgba(220,200,255,0.30)', shards: true },
};

/**
 * Paint a planetary "world type" surface: a mottled terrain backdrop the author
 * places elements onto. Deterministic (seeded by canvas size + world id) so it
 * doesn't reshuffle every repaint, and offline (pure canvas gradients/shapes).
 */
function paintWorldSurface(ctx, w, hgt, surf) {
  const look = WORLD_LOOKS[surf.world] || WORLD_LOOKS.barren;
  const rng = mulberry(worldSurfaceSeed(surf.world, w, hgt));

  // Gas giants read as horizontal cloud bands; everything else as mottled blotches.
  if (look.bands) {
    let y = 0;
    while (y < hgt) {
      const band = hgt * (0.05 + rng() * 0.09);
      ctx.fillStyle = look.blots[Math.floor(rng() * look.blots.length)];
      ctx.fillRect(0, y, w, band + 2);
      y += band;
    }
  } else {
    const n = Math.floor((w * hgt) / 26000) + 14;
    for (let i = 0; i < n; i++) {
      const x = rng() * w, cy = rng() * hgt, r = Math.min(w, hgt) * (0.08 + rng() * 0.22);
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
      const col = look.blots[Math.floor(rng() * look.blots.length)];
      g.addColorStop(0, col);
      g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Feature accents per world type.
  ctx.save();
  if (look.craters) {
    for (let i = 0; i < 22; i++) {
      const x = rng() * w, cy = rng() * hgt, r = 6 + rng() * 26;
      ctx.strokeStyle = 'rgba(30,22,14,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,220,0.06)';
      ctx.beginPath(); ctx.arc(x - r * 0.2, cy - r * 0.2, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (look.cracks || look.lava) {
    ctx.strokeStyle = look.lava ? 'rgba(255,110,40,0.5)' : 'rgba(120,150,180,0.45)';
    ctx.lineWidth = look.lava ? 2.4 : 1.2;
    for (let i = 0; i < 16; i++) {
      let x = rng() * w, cy = rng() * hgt;
      ctx.beginPath(); ctx.moveTo(x, cy);
      const steps = 4 + Math.floor(rng() * 5);
      for (let s = 0; s < steps; s++) { x += (rng() - 0.5) * 120; cy += (rng() - 0.5) * 120; ctx.lineTo(x, cy); }
      ctx.stroke();
    }
  }
  if (look.dunes) {
    ctx.strokeStyle = 'rgba(90,60,26,0.22)'; ctx.lineWidth = 2;
    for (let y = 20; y < hgt; y += 26) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 24) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 6 + y) * 8);
      ctx.stroke();
    }
  }
  if (look.circuits) {
    ctx.strokeStyle = 'rgba(255,190,100,0.25)'; ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = rng() * w, cy = rng() * hgt, len = 20 + rng() * 90;
      ctx.beginPath();
      if (rng() > 0.5) { ctx.moveTo(x, cy); ctx.lineTo(x + len, cy); ctx.lineTo(x + len, cy + 14); }
      else { ctx.moveTo(x, cy); ctx.lineTo(x, cy + len); ctx.lineTo(x + 14, cy + len); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,120,0.4)';
      ctx.fillRect(x - 1.5, cy - 1.5, 3, 3);
    }
  }
  if (look.shards) {
    for (let i = 0; i < 30; i++) {
      const x = rng() * w, cy = rng() * hgt, s = 8 + rng() * 22;
      ctx.fillStyle = 'rgba(220,200,255,0.22)';
      ctx.beginPath(); ctx.moveTo(x, cy - s); ctx.lineTo(x + s * 0.4, cy); ctx.lineTo(x, cy + s); ctx.lineTo(x - s * 0.4, cy); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();

  // Fine surface speckle for texture.
  const grains = Math.floor(w * hgt * (surf.grain || 0.4) * 0.004);
  ctx.fillStyle = look.speck;
  for (let i = 0; i < grains; i++) ctx.fillRect(rng() * w, rng() * hgt, 1.4, 1.4);
}

/** Tiny local PRNG (mulberry32) for deterministic surface texture. */
function mulberry(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Terrain painting ─────────────────────────────────────────────────────────

function pointFromEvent(e) {
  const surface = document.getElementById('fmap-surface');
  const rect = surface.getBoundingClientRect();
  // The pointer surface lives INSIDE the transformed frame, so its bounding
  // rect already reflects the current zoom (rect.width == project.width*zoom)
  // and pan (rect.left/top move with the pan). Mapping the cursor into the
  // rect and scaling by project/rect therefore un-projects zoom AND pan in one
  // step — no need to touch the view math here.
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
  // Pan gesture: the Pan tool (left-drag), or the universal shortcuts —
  // middle mouse button, or space held while dragging — in any tool. This lets
  // you reposition a large/zoomed map without hunting for the +/- buttons.
  if (tool === 'pan' || e.button === 1 || spaceHeld) {
    e.preventDefault();
    panState = { startX: e.clientX, startY: e.clientY, panX: view().panX, panY: view().panY };
    document.getElementById('fmap-surface').setPointerCapture?.(e.pointerId);
    const surf = document.getElementById('fmap-surface');
    if (surf) surf.style.cursor = 'grabbing';
    return;
  }

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
  // Live pan.
  if (panState) {
    setView({
      zoom: view().zoom,
      panX: panState.panX + (e.clientX - panState.startX),
      panY: panState.panY + (e.clientY - panState.startY),
    });
    return;
  }
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
  if (panState) {
    panState = null;
    const surf = document.getElementById('fmap-surface');
    if (surf) surf.style.cursor = (tool === 'pan' || spaceHeld) ? 'grab' : '';
    save();
    return;
  }
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
  const variants = STAMP_VARIANTS[activeStamp];
  const opts = { ...stampOpts, seed: (Date.now() & 0xffff) || 1, variants };
  const placements = scatterStamps(strokePath.length ? strokePath : [lastPoint || strokePath[0]], opts);
  const added = [];
  placements.forEach((p) => {
    const shape = p.shape || activeStamp;
    const stamp = {
      id: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      shape,
      x: p.x, y: p.y, size: p.size,
      rot: p.rot || 0,
      color: stampColor(shape),
    };
    project.stamps.push(stamp);
    added.push(stamp);
  });
  const wasTap = strokePath.length <= 1; // no drag movement was recorded
  strokePath = [];
  renderStampsLayer();
  save();
  // First single-tap placement of a session: auto-select it and switch to the
  // Select tool so the resize handle + controls are discovered. After that,
  // stay on the Stamp tool so repeated tapping places many stamps freely.
  if (wasTap && added.length === 1 && !_autoResizeIntroShown) {
    _autoResizeIntroShown = true;
    selectAndEdit('stamp', added[0].id);
    toastInfo('Tip: drag the corner handle (or use −/+) to resize. Re-pick a tool to keep placing.');
  }
}

// One-shot: the first placed element auto-switches to Select so the user
// discovers resizing; subsequent placements don't interrupt the workflow.
let _autoResizeIntroShown = false;

/**
 * Select an element by kind+id, switch to the Select tool, and reveal its
 * controls — the bridge that makes "place then resize" a continuous flow
 * instead of a hidden, multi-step chore.
 */
function selectAndEdit(kind, id) {
  selectedStampId = kind === 'stamp' ? id : null;
  selectedLabelId = kind === 'label' ? id : null;
  selectedPathId = kind === 'path' ? id : null;
  if (tool !== 'select') { setTool('select'); } // setTool re-renders palette + overlay
  else { refreshPalette(); renderOverlayLayer(); }
  renderStampsLayer(); renderLabelsLayer(); renderPathsLayer();
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
    // Stamps are anchored on their CENTER at (s.x, s.y) so an element lands
    // exactly under the cursor where you clicked. Kept upright (no rotation).
    ctx.drawImage(img, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
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

const HANDLE = 16; // resize-handle square size (canvas px)

/** Bounding box {x,y,w,h} of the currently selected stamp or label, or null. */
function selectionBounds() {
  if (selectedStampId) {
    const s = project.stamps.find((x) => x.id === selectedStampId);
    // Stamp is centered on (x, y): draws from (x - size/2, y - size/2) to (x + size/2, y + size/2).
    if (s) return { kind: 'stamp', ref: s, x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size };
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
  // Bounding box: a white casing under a blue dashed line so it reads on any
  // surface (light parchment or dark star chart).
  const bx = b.x - 5, by = b.y - 5, bw = b.w + 10, bh = b.h + 10;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.setLineDash([]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.strokeStyle = 'rgba(60,120,255,0.98)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(bx, by, bw, bh);

  // Prominent resize handle at the bottom-right corner with a diagonal glyph.
  ctx.setLineDash([]);
  const hx = bx + bw - HANDLE / 2;
  const hy = by + bh - HANDLE / 2;
  ctx.fillStyle = '#3b82f6';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(hx, hy, HANDLE, HANDLE, 3); else ctx.rect(hx, hy, HANDLE, HANDLE);
  ctx.fill();
  ctx.stroke();
  // Little diagonal resize arrows inside the handle.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hx + 4, hy + HANDLE - 4); ctx.lineTo(hx + HANDLE - 4, hy + 4);
  ctx.moveTo(hx + HANDLE - 4, hy + 4); ctx.lineTo(hx + HANDLE - 4, hy + 8);
  ctx.moveTo(hx + HANDLE - 4, hy + 4); ctx.lineTo(hx + HANDLE - 8, hy + 4);
  ctx.moveTo(hx + 4, hy + HANDLE - 4); ctx.lineTo(hx + 4, hy + HANDLE - 8);
  ctx.moveTo(hx + 4, hy + HANDLE - 4); ctx.lineTo(hx + 8, hy + HANDLE - 4);
  ctx.stroke();
  ctx.restore();
}

/** Is the point on the selection's resize handle? (matches drawSelectionChrome) */
function hitResizeHandle(pt) {
  const b = selectionBounds();
  if (!b) return false;
  const bx = b.x - 5, by = b.y - 5, bw = b.w + 10, bh = b.h + 10;
  // Handle sits at the bottom-right corner of the box.
  const hx = bx + bw - HANDLE / 2;
  const hy = by + bh - HANDLE / 2;
  const cx = hx + HANDLE / 2, cy = hy + HANDLE / 2;
  // Grab radius scales DOWN for small elements so the handle can't swallow the
  // whole element (which would make drag-to-move unreachable). Also require the
  // point to be near the corner, not anywhere in a big padded square.
  const grab = Math.min(HANDLE / 2 + 8, Math.max(7, Math.min(b.w, b.h) * 0.4));
  return Math.hypot(pt.x - cx, pt.y - cy) <= grab;
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
  // If the label survived (wasn't deleted via empty text in editLabel), keep it
  // selected. On the first placement of a session, also switch to the Select
  // tool so the resize handle is discovered; afterwards stay on Label so the
  // user can keep dropping labels.
  if (project.labels.some((l) => l.id === label.id)) {
    if (!_autoResizeIntroShown) {
      _autoResizeIntroShown = true;
      selectAndEdit('label', label.id);
    } else {
      selectedLabelId = label.id;
      selectedStampId = null; selectedPathId = null;
      refreshPalette();
      renderOverlayLayer();
    }
  }
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
    // Stamp is centered on (x, y): drawn from (x - size/2, y - size/2) to (x + size/2, y + size/2).
    if (pt.x > s.x - s.size / 2 && pt.x < s.x + s.size / 2 && pt.y > s.y - s.size / 2 && pt.y < s.y + s.size / 2) return s;
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
  // Pan tool shows an open-hand cursor; other tools use the default crosshair.
  const surf = document.getElementById('fmap-surface');
  if (surf) surf.style.cursor = t === 'pan' ? 'grab' : '';
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
 * option (skips the paper layer). If a backdrop image is set, its decode is
 * awaited first so it can't be missing from the export (race), and it is drawn
 * explicitly when the paper layer is skipped (transparent) or hidden so an
 * imported reference image isn't silently lost.
 */
function exportPNG() {
  // Ensure the backdrop bitmap is decoded before we snapshot the paper canvas.
  ensureBackdropDecoded(() => exportPNGNow());
}

/** Run `cb` once the backdrop image (if any) has finished decoding. */
function ensureBackdropDecoded(cb) {
  const bd = project.backdrop;
  if (!bd || !bd.dataUrl) { cb(); return; }
  if (_backdropImg && _backdropSrc === bd.dataUrl && _backdropImg.complete && _backdropImg.naturalWidth) { cb(); return; }
  const img = new Image();
  img.onload = () => { _backdropImg = img; _backdropSrc = bd.dataUrl; cb(); };
  img.onerror = () => cb();
  img.src = bd.dataUrl;
}

function exportPNGNow() {
  const preset = getExportPreset(exportPresetId);
  const { width, height, scale } = exportDimensions(project.width, project.height, preset.longEdge);
  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const octx = out.getContext('2d');
  octx.scale(scale, scale);

  // If the paper layer won't be drawn (transparent export or paper hidden) but
  // an imported backdrop exists, draw the backdrop directly so the user's
  // reference image survives — it's content, not procedural paper chrome.
  const paperState = project.layers.paper || { visible: true, opacity: 1 };
  const paperDrawn = paperState.visible && !exportTransparent;
  if (!paperDrawn && project.backdrop && _backdropImg && _backdropImg.naturalWidth) {
    const r = backdropRect(project.backdrop.fit || 'contain', _backdropImg.naturalWidth, _backdropImg.naturalHeight, project.width, project.height);
    octx.drawImage(_backdropImg, r.x, r.y, r.w, r.h);
  }

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
  applyCanvasSize(p.width, p.height);
}

/**
 * Resize the canvas to an arbitrary width/height, rescaling all content
 * (terrain raster, stamps, labels, paths) proportionally so the composition
 * survives the resize instead of bunching in a corner. Persists + re-renders.
 */
function applyCanvasSize(newW, newH) {
  const w = Math.max(1, Math.round(newW));
  const hgt = Math.max(1, Math.round(newH));
  if (w === project.width && hgt === project.height) return;
  const oldW = project.width, oldH = project.height;
  const sx = w / oldW, sy = hgt / oldH;

  project.stamps.forEach((s) => { s.x *= sx; s.y *= sy; s.size *= (sx + sy) / 2; });
  project.labels.forEach((l) => { l.x *= sx; l.y *= sy; l.size = (l.size || 18) * (sx + sy) / 2; });
  project.paths.forEach((pa) => { pa.points = (pa.points || []).map((q) => ({ x: q.x * sx, y: q.y * sy })); });

  project.width = w; project.height = hgt;

  // Preserve the terrain raster by re-drawing it scaled into the new size.
  const old = document.getElementById('fmap-terrain');
  const snapshot = old ? old.toDataURL('image/png') : project.terrainDataUrl;
  if (snapshot) {
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = hgt;
      tmp.getContext('2d').drawImage(img, 0, 0, oldW, oldH, 0, 0, w, hgt);
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
