/**
 * LoreForge Planner - Fantasy Map Engine (core, DOM-free)
 *
 * The math and data model behind the Inkarnate-style "Fantasy Map" painting
 * mode of the World Builder. Everything here is pure and unit-testable — no
 * canvas, no DOM. The UI layer (modules/fantasy-map.js) owns rendering and
 * pointer events and calls into these helpers.
 *
 * Responsibilities:
 *   - TERRAINS: the terrain-brush palette (painted, blended color families).
 *   - Brush model: spacing along a stroke, size, softness, flow/opacity.
 *   - Stamp scatter: turning a brushed stroke into jittered stamp placements
 *     (mountains, trees, towns…) with a seeded RNG so a given stroke is
 *     reproducible.
 *   - Layer model: paper / terrain / stamps / labels ordering + ops.
 *   - Project (de)serialization + versioning.
 *   - Export scaling math (canvas px ↔ export px).
 *   - A procedural paper/parchment description (colors + noise params) so the
 *     antique-map look needs no external image assets and works offline.
 */

/* ─── Seeded RNG (mulberry32) ─────────────────────────────────────────────── */

/** Deterministic PRNG so brushed scatter/jitter is reproducible per stroke. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─── Terrain palette ─────────────────────────────────────────────────────── */

/**
 * Painted terrain/surface families. Each has a base color, a slightly varied
 * `shade` used to give the fill organic tonal variation (good maps never read
 * as a flat color), and metadata for the palette UI. Each terrain belongs to a
 * map STYLE ('fantasy' | 'scifi') so the palette switches wholesale between a
 * hand-drawn world map and a sci-fi star/planet chart — the map painter is NOT
 * fantasy-only.
 *
 * @typedef {Object} Terrain
 * @property {string} id
 * @property {string} label
 * @property {string} base    Main paint color.
 * @property {string} shade   Secondary tone blended in for texture.
 * @property {string} icon    Emoji for the palette button.
 * @property {string} style   'fantasy' | 'scifi'
 */

/** @type {Terrain[]} */
export const TERRAINS = [
  // ── Fantasy world terrain ──────────────────────────────────────────────
  { id: 'ocean',    label: 'Ocean',     base: '#3f6b8a', shade: '#325876', icon: '🌊', style: 'fantasy' },
  { id: 'shallows', label: 'Shallows',  base: '#5a8fa8', shade: '#4a7d95', icon: '💧', style: 'fantasy' },
  { id: 'grass',    label: 'Grassland', base: '#7a8f4a', shade: '#6b8040', icon: '🌱', style: 'fantasy' },
  { id: 'plains',   label: 'Plains',    base: '#9caf5e', shade: '#8a9d50', icon: '🌾', style: 'fantasy' },
  { id: 'farmland', label: 'Farmland',  base: '#b7a24e', shade: '#9c8a3f', icon: '🚜', style: 'fantasy' },
  { id: 'forest',   label: 'Forest',    base: '#4a6b3a', shade: '#3d5a30', icon: '🌲', style: 'fantasy' },
  { id: 'jungle',   label: 'Jungle',    base: '#2f6b3a', shade: '#245530', icon: '🌴', style: 'fantasy' },
  { id: 'savanna',  label: 'Savanna',   base: '#b89a4e', shade: '#a2873f', icon: '🦁', style: 'fantasy' },
  { id: 'desert',   label: 'Desert',    base: '#c9a86a', shade: '#bb9955', icon: '🏜️', style: 'fantasy' },
  { id: 'dirt',     label: 'Badlands',  base: '#a06a44', shade: '#8f5c38', icon: '🟤', style: 'fantasy' },
  { id: 'mountain', label: 'Mountains', base: '#8a8178', shade: '#756c62', icon: '⛰️', style: 'fantasy' },
  { id: 'highland', label: 'Highlands', base: '#9a8f78', shade: '#847a64', icon: '🏔️', style: 'fantasy' },
  { id: 'snow',     label: 'Snow',      base: '#e8ecef', shade: '#d3dae0', icon: '❄️', style: 'fantasy' },
  { id: 'tundra',   label: 'Tundra',    base: '#c4cdc0', shade: '#adb6a8', icon: '🌫️', style: 'fantasy' },
  { id: 'swamp',    label: 'Swamp',     base: '#5c6b3a', shade: '#4d5a30', icon: '🥬', style: 'fantasy' },
  { id: 'wetland',  label: 'Wetland',   base: '#5f7d5a', shade: '#4e6a4a', icon: '🪷', style: 'fantasy' },
  { id: 'volcanic', label: 'Volcanic',  base: '#4a3f3a', shade: '#362d29', icon: '🌋', style: 'fantasy' },
  { id: 'lava',     label: 'Lava',      base: '#b5451f', shade: '#8f3316', icon: '🔥', style: 'fantasy' },
  { id: 'corruption', label: 'Corruption', base: '#5a2f6b', shade: '#472456', icon: '💜', style: 'fantasy' },
  { id: 'sand',     label: 'Coast Sand',base: '#e0cf96', shade: '#d1bd7f', icon: '🏖️', style: 'fantasy' },

  // ── Sci-fi star chart / planetary surface ──────────────────────────────
  { id: 'void',      label: 'Deep Space',  base: '#0b1026', shade: '#05070f', icon: '🌌', style: 'scifi' },
  { id: 'deepvoid',  label: 'Dark Void',   base: '#05060d', shade: '#020308', icon: '⬛', style: 'scifi' },
  { id: 'nebula',    label: 'Nebula',      base: '#5b3a8a', shade: '#7d4fb0', icon: '☁️', style: 'scifi' },
  { id: 'gascloud',  label: 'Gas Cloud',   base: '#2f6b8a', shade: '#245570', icon: '🌫️', style: 'scifi' },
  { id: 'plasma',    label: 'Plasma Field',base: '#b0367a', shade: '#8f2a61', icon: '⚡', style: 'scifi' },
  { id: 'starfield', label: 'Starfield',   base: '#141a33', shade: '#1f2a4d', icon: '✨', style: 'scifi' },
  { id: 'asteroids', label: 'Asteroid Field', base: '#54504a', shade: '#3f3c37', icon: '☄️', style: 'scifi' },
  { id: 'terran',    label: 'Terran',      base: '#2f7d55', shade: '#256045', icon: '🌍', style: 'scifi' },
  { id: 'jungleworld', label: 'Jungle World', base: '#2c7a3f', shade: '#216030', icon: '🌴', style: 'scifi' },
  { id: 'oceanic',   label: 'Ocean World', base: '#1f5f8a', shade: '#164a70', icon: '💧', style: 'scifi' },
  { id: 'desertworld', label: 'Desert World', base: '#c99a55', shade: '#b58644', icon: '🏜️', style: 'scifi' },
  { id: 'iceworld',  label: 'Ice World',   base: '#bcd6e6', shade: '#9fc0d4', icon: '🧊', style: 'scifi' },
  { id: 'barren',    label: 'Barren Rock', base: '#8a7d6c', shade: '#6f6456', icon: '🪨', style: 'scifi' },
  { id: 'crystal',   label: 'Crystal World', base: '#4fb0c4', shade: '#3d94a8', icon: '💎', style: 'scifi' },
  { id: 'toxic',     label: 'Toxic',       base: '#7fa02a', shade: '#65801f', icon: '☢️', style: 'scifi' },
  { id: 'radiation', label: 'Radiation',   base: '#9c8f2a', shade: '#82761f', icon: '🟡', style: 'scifi' },
  { id: 'molten',    label: 'Molten',      base: '#c24a1e', shade: '#963616', icon: '🔥', style: 'scifi' },
  { id: 'sprawl',    label: 'Urban Sprawl',base: '#4a5a72', shade: '#3a4860', icon: '🏙️', style: 'scifi' },
  { id: 'shield',    label: 'Shield Grid', base: '#2a6b8f', shade: '#1f5273', icon: '🛡️', style: 'scifi' },
];

const TERRAIN_BY_ID = new Map(TERRAINS.map((t) => [t.id, t]));

/** Look up a terrain by id (falls back to grass). */
export function getTerrain(id) {
  return TERRAIN_BY_ID.get(id) || TERRAINS[2];
}

/** Terrains available for a given map style. */
export function terrainsForStyle(style) {
  return TERRAINS.filter((t) => t.style === (style === 'scifi' ? 'scifi' : 'fantasy'));
}

/* ─── Brush model ─────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} Brush
 * @property {number} size       Diameter in canvas px.
 * @property {number} softness   0..1 edge feather (0 = hard, 1 = very soft).
 * @property {number} flow       0..1 per-dab opacity.
 * @property {number} spacing    Fraction of size between dabs (0.05..1).
 */

/** Sensible default brush. */
export function defaultBrush() {
  return { size: 64, softness: 0.5, flow: 0.85, spacing: 0.25 };
}

/** Clamp a number into [min,max]. */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Interpolate evenly-spaced dab centers between two points, given a brush.
 * Painting programs "stamp" the brush repeatedly along the drag path so a fast
 * mouse move still lays a continuous line. Spacing is a fraction of brush size.
 *
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {Brush} brush
 * @returns {Array<{x:number,y:number}>} dab centers (includes `to`, excludes `from`)
 */
export function brushDabs(from, to, brush) {
  const step = Math.max(1, (brush.size || 1) * clamp(brush.spacing || 0.25, 0.02, 1));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const out = [];
  if (dist < 0.0001) { out.push({ x: to.x, y: to.y }); return out; }
  const n = Math.max(1, Math.floor(dist / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push({ x: from.x + dx * t, y: from.y + dy * t });
  }
  return out;
}

/* ─── Stamp scatter ───────────────────────────────────────────────────────── */

/**
 * @typedef {Object} StampOptions
 * @property {number} size      Base stamp size (px).
 * @property {number} density   Stamps per 100px of stroke (approx).
 * @property {number} jitter    0..1 positional jitter as fraction of size.
 * @property {number} sizeJitter 0..1 random size variation.
 * @property {number} seed      RNG seed for reproducibility.
 */

export function defaultStampOptions() {
  return { size: 46, density: 2.2, jitter: 0.5, sizeJitter: 0.35, seed: 1 };
}

/**
 * Turn a polyline stroke into scattered stamp placements. Used by the stamp
 * brush: you drag, and mountains/trees/etc. are scattered along the path with
 * organic position + size jitter (never a rigid grid).
 *
 * @param {Array<{x:number,y:number}>} points  Stroke path (canvas px).
 * @param {StampOptions} opts
 * @returns {Array<{x:number,y:number,size:number,rot:number}>}
 */
export function scatterStamps(points, opts) {
  const o = { ...defaultStampOptions(), ...opts };
  const pts = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  if (pts.length === 0) return [];
  const rng = makeRng(o.seed || 1);

  // Total path length.
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  // A single tap (no length) still drops one stamp.
  const count = Math.max(1, Math.round((length / 100) * clamp(o.density, 0.1, 20)));

  const out = [];
  for (let i = 0; i < count; i++) {
    // Walk a random fraction along the path.
    const target = length > 0 ? rng() * length : 0;
    const at = pointAtLength(pts, target);
    const jitterPx = o.size * clamp(o.jitter, 0, 2);
    const jx = (rng() * 2 - 1) * jitterPx;
    const jy = (rng() * 2 - 1) * jitterPx;
    const sizeMul = 1 + (rng() * 2 - 1) * clamp(o.sizeJitter, 0, 1);
    out.push({
      x: at.x + jx,
      y: at.y + jy,
      size: Math.max(6, o.size * sizeMul),
      rot: 0, // map stamps stay upright by default; kept for future rotation
    });
  }
  // Painterly depth: stamps lower on the map (larger y) draw last (in front).
  out.sort((a, b) => a.y - b.y);
  return out;
}

/** Point at a given arc-length along a polyline. */
export function pointAtLength(points, target) {
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (acc + seg >= target || i === points.length - 1) {
      const t = seg === 0 ? 0 : (target - acc) / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * clamp(t, 0, 1),
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * clamp(t, 0, 1),
      };
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

/* ─── Labels ──────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} MapLabel
 * @property {string} id
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} size      Font size px.
 * @property {number} [curve]   -1..1 arc amount (0 = straight).
 * @property {string} [color]
 * @property {string} [style]   'region' | 'place' | 'water'
 */

/**
 * Preset label styles. `mapStyle` picks a color family so labels read well on
 * either a parchment map (dark ink) or a sci-fi chart (luminous cyan).
 */
export const LABEL_STYLES = {
  fantasy: {
    region: { size: 34, letterSpacing: 6, color: '#3a2a1a', italic: false, caps: true },
    place:  { size: 18, letterSpacing: 1, color: '#2a2118', italic: false, caps: false },
    water:  { size: 26, letterSpacing: 4, color: '#274863', italic: true, caps: false },
  },
  scifi: {
    region: { size: 32, letterSpacing: 8, color: '#9fd0ff', italic: false, caps: true },
    place:  { size: 16, letterSpacing: 2, color: '#cfe8ff', italic: false, caps: true },
    water:  { size: 24, letterSpacing: 5, color: '#7fb0ff', italic: true, caps: false },
  },
};

/**
 * Resolve a label style preset. Pass the label role ('region'|'place'|'water')
 * and the map style ('fantasy'|'scifi').
 */
export function labelStyle(role, mapStyle = 'fantasy') {
  const family = LABEL_STYLES[mapStyle] || LABEL_STYLES.fantasy;
  return family[role] || family.place;
}

/**
 * Sample points along a shallow circular arc for a curved label baseline.
 * `curve` in [-1,1]; 0 returns a straight baseline. Returns one point per
 * character slot so the UI can place glyphs along a bend (oceans, coastlines).
 *
 * @param {number} x  center x
 * @param {number} y  center y
 * @param {number} width total baseline width
 * @param {number} chars number of glyph slots (>=1)
 * @param {number} curve -1..1
 * @returns {Array<{x:number,y:number,angle:number}>}
 */
export function labelBaseline(x, y, width, chars, curve = 0) {
  const n = Math.max(1, chars | 0);
  const out = [];
  const c = clamp(curve, -1, 1);
  if (Math.abs(c) < 0.001 || n === 1) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      out.push({ x: x - width / 2 + width * t, y, angle: 0 });
    }
    return out;
  }
  // Arc: larger |curve| => tighter radius. Sagitta-based.
  const sag = (width / 2) * c * 0.6;
  const radius = (width * width / 4 + sag * sag) / (2 * Math.abs(sag));
  const half = Math.asin(clamp((width / 2) / radius, -1, 1));
  const cy = y + (c > 0 ? radius : -radius);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ang = -half + 2 * half * t;
    const sign = c > 0 ? -1 : 1;
    out.push({
      x: x + radius * Math.sin(ang) * (c > 0 ? 1 : 1),
      y: cy + sign * radius * Math.cos(ang),
      angle: ang * (c > 0 ? 1 : -1),
    });
  }
  return out;
}

/* ─── Fonts ────────────────────────────────────────────────────────────────── */

/** Label font families offered in the UI (all web-safe, no downloads). */
export const FONTS = [
  { id: 'serif', label: 'Serif', css: "Georgia, 'Palatino Linotype', 'Book Antiqua', serif" },
  { id: 'display', label: 'Display', css: "'Trattatello', 'Luminari', Georgia, fantasy" },
  { id: 'sans', label: 'Sans', css: "'Segoe UI', system-ui, -apple-system, sans-serif" },
  { id: 'mono', label: 'Mono', css: "'SF Mono', 'JetBrains Mono', 'Consolas', monospace" },
];

const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]));

/** Resolve a font id to a CSS font-family string (falls back to serif). */
export function fontCss(id) {
  return (FONT_BY_ID.get(id) || FONTS[0]).css;
}

/* ─── Paths / routes (roads, rivers, borders, hyperlanes) ─────────────────── */

/**
 * A path is a drawn polyline rendered with a per-kind style. Kinds differ by
 * map style so a "road" (fantasy) and a "hyperlane" (sci-fi) both make sense.
 *
 * @typedef {Object} PathKind
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {string} style      'fantasy' | 'scifi'
 * @property {string} color      Default stroke color.
 * @property {number} width      Default stroke width (px).
 * @property {number[]} dash     Dash pattern ([] = solid).
 * @property {string} cap        Line cap.
 * @property {boolean} [glow]     Draw an outer glow (sci-fi lanes).
 */

/** @type {PathKind[]} */
export const PATH_KINDS = [
  // Fantasy
  { id: 'river',  label: 'River',  icon: '🏞️', style: 'fantasy', color: '#4a7fa8', width: 6,  dash: [],      cap: 'round',  taper: true },
  { id: 'road',   label: 'Road',   icon: '🛤️', style: 'fantasy', color: '#8a6a44', width: 4,  dash: [],      cap: 'round' },
  { id: 'trail',  label: 'Trail',  icon: '👣', style: 'fantasy', color: '#7a5a3a', width: 3,  dash: [2, 5],  cap: 'round' },
  { id: 'border', label: 'Border', icon: '⚑', style: 'fantasy', color: '#7a3a3a', width: 3,  dash: [9, 6],  cap: 'butt' },
  { id: 'wall',   label: 'Great Wall', icon: '🧱', style: 'fantasy', color: '#5a5048', width: 7,  dash: [10, 3], cap: 'butt' },
  // Sci-fi
  { id: 'hyperlane', label: 'Hyperlane', icon: '🛰️', style: 'scifi', color: '#5fd0ff', width: 3, dash: [],     cap: 'round', glow: true },
  { id: 'traderoute',label: 'Trade Route',icon: '💠', style: 'scifi', color: '#ffd24a', width: 2, dash: [3, 5], cap: 'round', glow: true },
  { id: 'frontier',  label: 'Frontier',   icon: '🚧', style: 'scifi', color: '#ff6a6a', width: 2, dash: [10, 6],cap: 'butt' },
  { id: 'wormlink',  label: 'Warp Link',  icon: '🌀', style: 'scifi', color: '#c07fff', width: 3, dash: [1, 6], cap: 'round', glow: true },
];

const PATH_BY_ID = new Map(PATH_KINDS.map((p) => [p.id, p]));

export function getPathKind(id) {
  return PATH_BY_ID.get(id) || PATH_KINDS[0];
}

export function pathKindsForStyle(style) {
  return PATH_KINDS.filter((p) => p.style === (style === 'scifi' ? 'scifi' : 'fantasy'));
}

export function defaultPathKindForStyle(style) {
  return style === 'scifi' ? 'hyperlane' : 'river';
}

/**
 * Simplify a raw pointer path by dropping points closer than `minDist` — keeps
 * the stored path small and the smoothing stable without changing the shape.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [minDist]
 */
export function simplifyPath(points, minDist = 6) {
  const pts = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(pts[i].x - last.x, pts[i].y - last.y) >= minDist) out.push(pts[i]);
  }
  const end = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (tail.x !== end.x || tail.y !== end.y) out.push(end);
  return out;
}

/**
 * Catmull-Rom → cubic Bézier smoothing. Returns an array of segments
 * { c1, c2, end } to feed ctx.bezierCurveTo (starting at points[0]), producing a
 * smooth curve through every input point (rivers/roads read organic, not jagged).
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [tension] 0..1 (0.5 = classic Catmull-Rom)
 * @returns {{ start:{x:number,y:number}, segments:Array<{c1:{x:number,y:number},c2:{x:number,y:number},end:{x:number,y:number}}> }}
 */
export function smoothPath(points, tension = 0.5) {
  const p = Array.isArray(points) ? points.filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y)) : [];
  if (p.length < 2) return { start: p[0] || { x: 0, y: 0 }, segments: [] };
  const t = clamp(tension, 0, 1);
  const segments = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) * (t / 6), y: p1.y + (p2.y - p0.y) * (t / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) * (t / 6), y: p2.y - (p3.y - p1.y) * (t / 6) };
    segments.push({ c1, c2, end: { x: p2.x, y: p2.y } });
  }
  return { start: { x: p[0].x, y: p[0].y }, segments };
}

/* ─── Grid / hex overlay ──────────────────────────────────────────────────── */

/** Overlay grid modes. */
export const GRID_MODES = [
  { id: 'off', label: 'None' },
  { id: 'square', label: 'Square' },
  { id: 'hex', label: 'Hex' },
];

export function defaultGrid() {
  return { mode: 'off', size: 48, color: 'rgba(40,30,15,0.28)' };
}

/**
 * Flat-top hex center positions covering a w×h area for a given hex "size"
 * (center→corner radius). Pure geometry so it can be unit-tested; the UI draws
 * the polygons from these centers.
 * @returns {Array<{cx:number,cy:number}>}
 */
export function hexCenters(w, h, size) {
  const r = Math.max(6, size);
  const hexW = 2 * r;
  const hexH = Math.sqrt(3) * r;
  const horiz = 0.75 * hexW;   // column spacing (flat-top)
  const out = [];
  let col = 0;
  for (let cx = 0; cx <= w + hexW; cx += horiz, col++) {
    const yOffset = (col % 2) ? hexH / 2 : 0;
    for (let cy = yOffset; cy <= h + hexH; cy += hexH) {
      out.push({ cx, cy });
    }
  }
  return out;
}

/** Corner points of a single flat-top hexagon (for drawing). */
export function hexCorners(cx, cy, size) {
  const r = Math.max(6, size);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/* ─── Map ornaments (frame, compass rose, scale bar) ──────────────────────── */

/** Decorative ornaments toggle state. */
export function defaultOrnaments() {
  return { frame: true, compass: true, scale: false };
}

/**
 * Points for an 8-point compass rose of a given radius, centered at (cx,cy).
 * Returns the four cardinal + four diagonal spoke tips and inner notch points
 * so the UI can draw a star without hardcoding trig.
 */
export function compassPoints(cx, cy, radius) {
  const outer = [];
  const inner = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2; // start pointing "north"
    outer.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    const ia = a + Math.PI / 8;
    inner.push({ x: cx + radius * 0.34 * Math.cos(ia), y: cy + radius * 0.34 * Math.sin(ia) });
  }
  return { outer, inner };
}

/* ─── Canvas size presets ─────────────────────────────────────────────────── */

export const CANVAS_PRESETS = [
  { id: 'landscape', label: 'Landscape (1280×800)', width: 1280, height: 800 },
  { id: 'portrait', label: 'Portrait (800×1280)', width: 800, height: 1280 },
  { id: 'square', label: 'Square (1024×1024)', width: 1024, height: 1024 },
  { id: 'wide', label: 'Wide (1600×720)', width: 1600, height: 720 },
  { id: 'large', label: 'Large (1920×1200)', width: 1920, height: 1200 },
];

export function getCanvasPreset(id) {
  return CANVAS_PRESETS.find((p) => p.id === id) || CANVAS_PRESETS[0];
}

/* ─── Export resolution presets ───────────────────────────────────────────── */

export const EXPORT_PRESETS = [
  { id: 'standard', label: 'Standard (1280px)', longEdge: 1280 },
  { id: 'hd', label: 'HD (2048px)', longEdge: 2048 },
  { id: 'print', label: 'Print (2560px)', longEdge: 2560 },
  { id: 'ultra', label: 'Ultra (4096px)', longEdge: 4096 },
];

export function getExportPreset(id) {
  return EXPORT_PRESETS.find((p) => p.id === id) || EXPORT_PRESETS[2];
}

/* ─── Layer model ─────────────────────────────────────────────────────────── */

/** Canonical layer ids, bottom → top. */
export const LAYER_ORDER = ['paper', 'terrain', 'paths', 'stamps', 'labels', 'overlay'];

export const LAYER_META = {
  paper:   { label: 'Paper', locked: true },
  terrain: { label: 'Terrain', locked: false },
  paths:   { label: 'Paths', locked: false },
  stamps:  { label: 'Stamps', locked: false },
  labels:  { label: 'Labels', locked: false },
  overlay: { label: 'Grid & Ornaments', locked: false },
};

/** Fresh per-layer visibility/opacity state. */
export function defaultLayers() {
  return {
    paper:   { visible: true, opacity: 1 },
    terrain: { visible: true, opacity: 1 },
    paths:   { visible: true, opacity: 1 },
    stamps:  { visible: true, opacity: 1 },
    labels:  { visible: true, opacity: 1 },
    overlay: { visible: true, opacity: 1 },
  };
}

/* ─── Procedural map surfaces (parchment + sci-fi) ────────────────────────── */

/**
 * Descriptions of the map SURFACE so the look is generated in-app (no external
 * texture files → still works offline). The UI paints these with canvas
 * gradients + a procedural noise/starfield pass.
 *
 * Two styles ship: an antique fantasy 'parchment', and sci-fi 'starchart' /
 * 'blueprint'. Each style declares base/edge tones, a vignette, a grain
 * strength, an ink color for labels/borders, and a `kind` telling the renderer
 * which procedural pass to run ('paper' grain vs 'stars' field vs 'grid').
 *
 * @typedef {Object} Surface
 * @property {string} id
 * @property {string} label
 * @property {string} style       'fantasy' | 'scifi'
 * @property {string} kind        'paper' | 'stars' | 'grid'
 * @property {string} base        Center tone.
 * @property {string} edge        Outer tone (radial gradient toward edges).
 * @property {string} vignette    Vignette color (rgba).
 * @property {number} grain       0..1 noise/starfield strength.
 * @property {string} ink         Default ink for labels/borders on this surface.
 */

/** @type {Surface[]} */
export const SURFACES = [
  { id: 'parchment', label: 'Antique Parchment', style: 'fantasy', kind: 'paper',
    base: '#e9d8b0', edge: '#c9a870', vignette: 'rgba(60,40,20,0.35)', grain: 0.06, ink: '#3a2a1a' },
  { id: 'oldmap', label: 'Weathered Chart', style: 'fantasy', kind: 'paper',
    base: '#dcc79a', edge: '#b89a63', vignette: 'rgba(50,34,16,0.42)', grain: 0.09, ink: '#332412' },
  { id: 'linen', label: 'Clean Linen', style: 'fantasy', kind: 'paper',
    base: '#f3ecda', edge: '#ddd0b0', vignette: 'rgba(80,60,30,0.2)', grain: 0.04, ink: '#4a3a24' },
  { id: 'darkfantasy', label: 'Dark Tome', style: 'fantasy', kind: 'paper',
    base: '#2c2620', edge: '#181410', vignette: 'rgba(0,0,0,0.55)', grain: 0.08, ink: '#d8c9a8' },
  { id: 'starchart', label: 'Star Chart', style: 'scifi', kind: 'stars',
    base: '#0a0f1f', edge: '#04060d', vignette: 'rgba(0,0,0,0.55)', grain: 0.5, ink: '#9fd0ff' },
  { id: 'deepspace', label: 'Deep Space', style: 'scifi', kind: 'stars',
    base: '#060810', edge: '#010204', vignette: 'rgba(0,0,0,0.7)', grain: 0.8, ink: '#7fb8ff' },
  { id: 'blueprint', label: 'Tech Blueprint', style: 'scifi', kind: 'grid',
    base: '#0d2440', edge: '#08182c', vignette: 'rgba(0,10,20,0.5)', grain: 0.0, ink: '#8fd0ff' },
  { id: 'hologram', label: 'Holo Display', style: 'scifi', kind: 'grid',
    base: '#04141a', edge: '#02080c', vignette: 'rgba(0,20,20,0.5)', grain: 0.0, ink: '#5fffd0' },
];

const SURFACE_BY_ID = new Map(SURFACES.map((s) => [s.id, s]));

/** Look up a surface by id (falls back to parchment). */
export function getSurface(id) {
  return SURFACE_BY_ID.get(id) || SURFACES[0];
}

/** Surfaces available for a given map style. */
export function surfacesForStyle(style) {
  return SURFACES.filter((s) => s.style === (style === 'scifi' ? 'scifi' : 'fantasy'));
}

/** The default surface id for a style. */
export function defaultSurfaceForStyle(style) {
  return style === 'scifi' ? 'starchart' : 'parchment';
}

/** Back-compat: the original single parchment description. */
export const PAPER = SURFACES[0];

/* ─── Export scaling ──────────────────────────────────────────────────────── */

/**
 * Compute export pixel dimensions for a target long-edge resolution while
 * preserving the canvas aspect ratio.
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} targetLongEdge
 * @returns {{ width:number, height:number, scale:number }}
 */
export function exportDimensions(canvasW, canvasH, targetLongEdge = 2048) {
  const w = Math.max(1, canvasW | 0);
  const h = Math.max(1, canvasH | 0);
  const long = Math.max(w, h);
  const scale = clamp(targetLongEdge / long, 0.1, 8);
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
}

/* ─── Project serialization ───────────────────────────────────────────────── */

export const MAP_SCHEMA_VERSION = 1;

/** Selectable map styles. Fantasy and sci-fi are first-class peers. */
export const MAP_STYLES = [
  { id: 'fantasy', label: 'Fantasy World', icon: '🗺️' },
  { id: 'scifi', label: 'Sci-Fi / Star Chart', icon: '🛰️' },
];

/** Normalize an arbitrary style value to a supported one. */
export function normalizeStyle(style) {
  return style === 'scifi' ? 'scifi' : 'fantasy';
}

/**
 * Build an empty map project.
 * @param {number} width
 * @param {number} height
 * @param {string} [style]  'fantasy' | 'scifi'
 */
export function emptyMapProject(width = 1280, height = 800, style = 'fantasy') {
  const st = normalizeStyle(style);
  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    style: st,
    surface: defaultSurfaceForStyle(st),
    width,
    height,
    layers: defaultLayers(),
    terrainDataUrl: null,   // rasterized terrain layer (PNG data URL)
    paths: [],              // { id, kind, points:[{x,y}], color?, width? }
    stamps: [],             // { id, shape, x, y, size, color }
    labels: [],             // MapLabel[]
    grid: defaultGrid(),    // { mode, size, color }
    ornaments: defaultOrnaments(), // { frame, compass, scale }
    updatedAt: Date.now(),
  };
}

/**
 * Normalize/upgrade a loaded project so older or partial data is safe to use.
 * @param {*} raw
 * @returns {object}
 */
export function normalizeMapProject(raw) {
  if (!raw || typeof raw !== 'object') return emptyMapProject();
  const style = normalizeStyle(raw.style);
  const base = emptyMapProject(raw.width || 1280, raw.height || 800, style);
  // Keep a saved surface only if it belongs to this style; otherwise default it.
  const surfOk = raw.surface && getSurface(raw.surface).style === style;
  return {
    ...base,
    ...raw,
    style,
    surface: surfOk ? raw.surface : defaultSurfaceForStyle(style),
    schemaVersion: MAP_SCHEMA_VERSION,
    layers: { ...base.layers, ...(raw.layers || {}) },
    paths: Array.isArray(raw.paths) ? raw.paths : [],
    stamps: Array.isArray(raw.stamps) ? raw.stamps : [],
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    grid: { ...base.grid, ...(raw.grid && typeof raw.grid === 'object' ? raw.grid : {}) },
    ornaments: { ...base.ornaments, ...(raw.ornaments && typeof raw.ornaments === 'object' ? raw.ornaments : {}) },
    terrainDataUrl: typeof raw.terrainDataUrl === 'string' ? raw.terrainDataUrl : null,
  };
}
