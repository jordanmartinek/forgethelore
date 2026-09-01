/**
 * Functional tests for the Fantasy/Sci-Fi map engine (core/map-engine.js).
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-map-engine.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const m = await import('../src/core/map-engine.js');

// ── Terrain palette (fantasy AND sci-fi) ─────────────────────────────────────
assert(m.TERRAINS.length >= 18, `broad terrain palette (${m.TERRAINS.length})`);
const fant = m.terrainsForStyle('fantasy');
const sci = m.terrainsForStyle('scifi');
assert(fant.length >= 8 && sci.length >= 8, `both styles well-stocked (fantasy ${fant.length}, scifi ${sci.length})`);
assert(fant.every((t) => t.style === 'fantasy'), 'terrainsForStyle(fantasy) filters correctly');
assert(sci.every((t) => t.style === 'scifi'), 'terrainsForStyle(scifi) filters correctly');
assert(m.TERRAINS.every((t) => /^#[0-9a-f]{6}$/i.test(t.base) && /^#[0-9a-f]{6}$/i.test(t.shade)), 'every terrain has hex base+shade');
assert(m.getTerrain('void').style === 'scifi', 'sci-fi terrain "void" resolves');
assert(m.getTerrain('nope').id === 'grass', 'unknown terrain falls back to grass');

// ── Surfaces (parchment + sci-fi) ─────────────────────────────────────────────
assert(m.SURFACES.length >= 4, 'multiple surfaces');
assert(m.surfacesForStyle('scifi').length >= 2 && m.surfacesForStyle('fantasy').length >= 2, 'surfaces per style');
assert(m.defaultSurfaceForStyle('scifi') === 'starchart', 'scifi default surface is starchart');
assert(m.defaultSurfaceForStyle('fantasy') === 'parchment', 'fantasy default surface is parchment');
assert(m.getSurface('blueprint').kind === 'grid', 'blueprint uses grid kind');
assert(m.getSurface('starchart').kind === 'stars', 'starchart uses stars kind');
assert(m.getSurface('parchment').kind === 'paper', 'parchment uses paper kind');
assert(m.getSurface('???').id === 'parchment', 'unknown surface falls back to parchment');
assert(m.PAPER === m.SURFACES[0], 'PAPER back-compat alias points at first surface');
// No stray non-ascii / malformed hex in surfaces (guards the earlier bug).
assert(m.SURFACES.every((s) => /^#[0-9a-f]{6}$/i.test(s.base) && /^#[0-9a-f]{6}$/i.test(s.edge)), 'surface base/edge are clean hex');

// ── RNG determinism ───────────────────────────────────────────────────────────
const r1 = m.makeRng(42); const r2 = m.makeRng(42);
assert(r1() === r2() && r1() === r2(), 'makeRng is deterministic for a seed');
assert(m.makeRng(1)() !== m.makeRng(2)(), 'different seeds differ');
const v = m.makeRng(9)();
assert(v >= 0 && v < 1, 'rng output in [0,1)');

// ── Brush dabs (stroke interpolation) ─────────────────────────────────────────
const dabs = m.brushDabs({ x: 0, y: 0 }, { x: 100, y: 0 }, { size: 20, spacing: 0.5 });
assert(dabs.length === 10, `spacing math: 100px / (20*0.5=10) => 10 dabs (got ${dabs.length})`);
assert(approx(dabs[dabs.length - 1].x, 100), 'last dab reaches the endpoint');
const tap = m.brushDabs({ x: 5, y: 5 }, { x: 5, y: 5 }, m.defaultBrush());
assert(tap.length === 1 && tap[0].x === 5, 'zero-length stroke yields a single dab at the point');
assert(m.clamp(5, 0, 3) === 3 && m.clamp(-1, 0, 3) === 0 && m.clamp(2, 0, 3) === 2, 'clamp works');

// ── Stamp scatter ──────────────────────────────────────────────────────────────
const path = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
const s1 = m.scatterStamps(path, { seed: 7, size: 40, density: 2, jitter: 0.15, sizeJitter: 0.3 });
const s2 = m.scatterStamps(path, { seed: 7, size: 40, density: 2, jitter: 0.15, sizeJitter: 0.3 });
assert(s1.length >= 1, 'scatter produces stamps');
assert(JSON.stringify(s1) === JSON.stringify(s2), 'scatter is deterministic for a seed');
assert(m.scatterStamps([{ x: 10, y: 10 }], { seed: 1, density: 2 }).length === 1, 'a single tap drops exactly one stamp');
assert(s1.every((p) => p.size >= 6), 'stamp sizes are clamped to a visible minimum');
// Depth sort: non-decreasing y.
assert(s1.every((p, i) => i === 0 || s1[i - 1].y <= p.y), 'stamps are depth-sorted by y');
assert(m.scatterStamps([], { seed: 1 }).length === 0, 'empty path scatters nothing');
assert(m.scatterStamps(null, {}).length === 0, 'null path is safe');

// Stamps FOLLOW the path: perpendicular offset from a horizontal drag stays
// within the (small) jitter band, not scattered across a big box.
const hugging = m.scatterStamps(path, { seed: 4, size: 40, jitter: 0.15 });
const maxPerp = Math.max(...hugging.map((p) => Math.abs(p.y - 0)));
assert(maxPerp <= 40 * 0.15 + 0.001, `stamps hug the path (max perpendicular ${maxPerp.toFixed(1)}px <= jitter band)`);
// And they span the whole drag, not clump at one spot.
assert(Math.min(...hugging.map((p) => p.x)) < 60 && Math.max(...hugging.map((p) => p.x)) > 140, 'stamps cover the length of the drag');

// Variation: rotation present, sizes vary, and shape variants are distributed.
const varied = m.scatterStamps(path, { seed: 9, size: 40, density: 4, sizeJitter: 0.4, rotJitter: 0.6, variants: ['a', 'b', 'c'] });
assert(varied.some((p) => p.rot !== 0), 'stamps carry rotation variation');
assert(new Set(varied.map((p) => Math.round(p.size))).size > 1, 'stamp sizes vary within a stroke');
assert(varied.every((p) => ['a', 'b', 'c'].includes(p.shape)), 'each placement picks a shape from the variant pool');
assert(new Set(varied.map((p) => p.shape)).size > 1, 'variant shapes are actually mixed across the stroke');
// No variants -> shape is undefined (caller falls back to the active shape).
assert(m.scatterStamps(path, { seed: 9 }).every((p) => p.shape === undefined), 'no variants => undefined shape');
// A tap still gets size/rotation variation (not always the base size).
const taps = Array.from({ length: 6 }, (_, i) => m.scatterStamps([{ x: 5, y: 5 }], { seed: i + 1, size: 40, sizeJitter: 0.4 })[0]);
assert(new Set(taps.map((t) => Math.round(t.size))).size > 1, 'repeated taps produce varied sizes');
assert(taps.every((t) => approx(t.x, 5) && approx(t.y, 5)), 'a tap lands exactly under the cursor');

// tangentAtLength: unit direction of the path.
const tan = m.tangentAtLength(path, 100);
assert(approx(tan.x, 1) && approx(tan.y, 0), 'tangent of a horizontal path points +x');
const diag = m.tangentAtLength([{ x: 0, y: 0 }, { x: 10, y: 10 }], 5);
assert(approx(Math.hypot(diag.x, diag.y), 1), 'tangent is a unit vector');
assert(m.tangentAtLength([{ x: 0, y: 0 }], 0).x === 1, 'tangent of a single point is safe');

// pointAtLength endpoints.
assert(approx(m.pointAtLength(path, 0).x, 0) && approx(m.pointAtLength(path, 200).x, 200), 'pointAtLength hits both ends');
assert(approx(m.pointAtLength(path, 100).x, 100), 'pointAtLength midpoint');

// ── Labels ──────────────────────────────────────────────────────────────────
assert(m.labelStyle('region', 'fantasy').caps === true, 'fantasy region labels are caps');
assert(m.labelStyle('water', 'scifi').color.startsWith('#'), 'scifi water label has a color');
assert(m.labelStyle('nope', 'scifi') === m.labelStyle('place', 'scifi'), 'unknown role falls back to place');
assert(m.labelStyle('place', 'nope').color === m.LABEL_STYLES.fantasy.place.color, 'unknown mapStyle falls back to fantasy');
// Straight baseline: all y equal, spans the width.
const straight = m.labelBaseline(100, 50, 80, 5, 0);
assert(straight.length === 5 && straight.every((p) => p.y === 50), 'straight baseline keeps y constant');
assert(approx(straight[0].x, 60) && approx(straight[4].x, 140), 'straight baseline spans the width centered');
// Curved baseline bends and rotates.
const curved = m.labelBaseline(100, 50, 80, 5, 0.8);
assert(curved.some((p) => Math.abs(p.y - 50) > 1), 'curved baseline bends off the center line');
assert(curved.some((p) => Math.abs(p.angle) > 0.01), 'curved baseline rotates glyphs');
assert(m.labelBaseline(100, 50, 80, 1, 0.5).length === 1, 'single-char label is safe');

// ── Layers ────────────────────────────────────────────────────────────────────
assert(JSON.stringify(m.LAYER_ORDER) === JSON.stringify(['paper', 'terrain', 'paths', 'stamps', 'labels', 'overlay']), 'layer order bottom->top');
const layers = m.defaultLayers();
assert(m.LAYER_ORDER.every((id) => layers[id] && layers[id].visible === true && layers[id].opacity === 1), 'default layers all visible @ full opacity');
assert(m.LAYER_META.paper.locked === true, 'paper layer is locked');

// ── Export dimensions ──────────────────────────────────────────────────────────
const ex = m.exportDimensions(1280, 800, 2560);
assert(ex.width === 2560 && ex.height === 1600 && approx(ex.scale, 2), 'export scales long edge to target, preserves aspect');
const exTall = m.exportDimensions(800, 1600, 2560);
assert(exTall.height === 2560 && exTall.width === 1280, 'export handles portrait (long edge = height)');
assert(m.exportDimensions(0, 0, 2048).width >= 1, 'degenerate size is guarded');

// ── Project serialization (style-aware) ─────────────────────────────────────
const p = m.emptyMapProject();
assert(p.style === 'fantasy' && p.surface === 'parchment', 'empty project defaults to fantasy/parchment');
assert(p.schemaVersion === m.MAP_SCHEMA_VERSION && Array.isArray(p.stamps) && Array.isArray(p.labels), 'project shape is complete');
const sp = m.emptyMapProject(1000, 700, 'scifi');
assert(sp.style === 'scifi' && sp.surface === 'starchart', 'scifi project gets a scifi surface');
// normalize repairs a mismatched surface for the style.
const fixed = m.normalizeMapProject({ style: 'scifi', surface: 'parchment', stamps: 'bad', labels: null });
assert(fixed.surface === 'starchart', 'normalize corrects a surface that doesn\'t match the style');
assert(Array.isArray(fixed.stamps) && fixed.stamps.length === 0 && Array.isArray(fixed.labels), 'normalize coerces bad stamps/labels to arrays');
assert(m.normalizeMapProject(null).style === 'fantasy', 'normalize(null) yields a valid default project');
const keepSurf = m.normalizeMapProject({ style: 'scifi', surface: 'blueprint' });
assert(keepSurf.surface === 'blueprint', 'normalize keeps a valid surface for the style');
assert(m.normalizeStyle('scifi') === 'scifi' && m.normalizeStyle('anything') === 'fantasy', 'normalizeStyle guards input');
assert(m.MAP_STYLES.length === 2, 'two first-class map styles (fantasy + scifi)');

// ── Expanded content: terrains, surfaces, fonts ──────────────────────────────
assert(m.terrainsForStyle('fantasy').length >= 18, `many fantasy terrains (${m.terrainsForStyle('fantasy').length})`);
assert(m.terrainsForStyle('scifi').length >= 18, `many sci-fi terrains (${m.terrainsForStyle('scifi').length})`);
assert(m.TERRAINS.every((t) => /^#[0-9a-f]{6}$/i.test(t.base) && /^#[0-9a-f]{6}$/i.test(t.shade)), 'all terrains have valid hex base/shade');
assert(new Set(m.TERRAINS.map((t) => t.id)).size === m.TERRAINS.length, 'terrain ids are unique');
assert(m.surfacesForStyle('fantasy').length >= 3 && m.surfacesForStyle('scifi').length >= 3, 'more surfaces per style');
assert(m.FONTS.length >= 3 && typeof m.fontCss('display') === 'string' && m.fontCss('display').length > 0, 'fonts + fontCss resolve');
assert(m.fontCss('nonexistent') === m.fontCss('serif'), 'fontCss falls back to serif');

// ── Path kinds ────────────────────────────────────────────────────────────────
assert(m.PATH_KINDS.length >= 8, 'path kinds exist');
assert(m.pathKindsForStyle('fantasy').every((p) => p.style === 'fantasy'), 'path kinds filter by fantasy');
assert(m.pathKindsForStyle('scifi').every((p) => p.style === 'scifi'), 'path kinds filter by scifi');
assert(m.defaultPathKindForStyle('scifi') === 'hyperlane' && m.defaultPathKindForStyle('fantasy') === 'river', 'default path kinds per style');
assert(m.getPathKind('road').label === 'Road', 'getPathKind resolves');
assert(m.getPathKind('nope') === m.PATH_KINDS[0], 'getPathKind falls back');

// ── Path simplify + smoothing ─────────────────────────────────────────────────
const simplified = m.simplifyPath([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 50, y: 0 }], 6);
assert(simplified.length === 2, `simplifyPath drops near-duplicate points (got ${simplified.length})`);
assert(simplified[simplified.length - 1].x === 50, 'simplifyPath always keeps the endpoint');
assert(m.simplifyPath([{ x: 0, y: 0 }], 6).length === 1, 'simplifyPath handles a single point');
assert(m.simplifyPath([], 6).length === 0, 'simplifyPath handles empty');
const sm = m.smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }]);
assert(sm.start.x === 0 && sm.start.y === 0, 'smoothPath starts at the first point');
assert(sm.segments.length === 3, `smoothPath yields N-1 bezier segments (got ${sm.segments.length})`);
assert(sm.segments.every((s) => s.c1 && s.c2 && s.end), 'each segment has control points + end');
const last = sm.segments[sm.segments.length - 1].end;
assert(last.x === 30 && last.y === 10, 'smoothPath ends at the last point');
const sm2 = m.smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }]);
assert(JSON.stringify(sm) === JSON.stringify(sm2), 'smoothPath is deterministic');
assert(m.smoothPath([{ x: 5, y: 5 }]).segments.length === 0, 'smoothPath of a single point has no segments');

// ── Grid + hex geometry ────────────────────────────────────────────────────────
assert(m.GRID_MODES.map((g) => g.id).join(',') === 'off,square,hex', 'grid modes');
assert(m.defaultGrid().mode === 'off', 'grid defaults off');
const centers = m.hexCenters(200, 200, 40);
assert(centers.length > 0 && centers.every((c) => Number.isFinite(c.cx) && Number.isFinite(c.cy)), 'hexCenters produces finite centers');
const corners = m.hexCorners(100, 100, 40);
assert(corners.length === 6, 'hexCorners returns 6 corners');
assert(corners.every((p) => Math.abs(Math.hypot(p.x - 100, p.y - 100) - 40) < 1e-6), 'hex corners lie on radius 40');
assert(m.hexCorners(0, 0, 2).every((p) => Math.hypot(p.x, p.y) >= 6 - 1e-6), 'hex size is clamped to a minimum');

// ── Ornaments / compass ─────────────────────────────────────────────────────────
const orn = m.defaultOrnaments();
assert(orn.frame === true && orn.compass === true && orn.scale === false, 'default ornaments');
const cp = m.compassPoints(50, 50, 30);
assert(cp.outer.length === 8 && cp.inner.length === 8, 'compass has 8 outer + 8 inner points');
assert(Math.abs(cp.outer[0].x - 50) < 1e-6 && cp.outer[0].y < 50, 'first compass spoke points north (up)');

// ── Presets ──────────────────────────────────────────────────────────────────
assert(m.CANVAS_PRESETS.length >= 4 && m.getCanvasPreset('portrait').height > m.getCanvasPreset('portrait').width, 'portrait preset is taller');
assert(m.getCanvasPreset('nope').id === m.CANVAS_PRESETS[0].id, 'canvas preset falls back');
assert(m.EXPORT_PRESETS.length >= 4 && m.getExportPreset('ultra').longEdge === 4096, 'ultra export preset');
assert(m.getExportPreset('nope').id === 'print', 'export preset falls back to print');

// ── Layers include the new paths + overlay layers ─────────────────────────────
assert(m.LAYER_ORDER.includes('paths') && m.LAYER_ORDER.includes('overlay'), 'layer order includes paths + overlay');
assert(m.LAYER_ORDER.indexOf('paths') < m.LAYER_ORDER.indexOf('stamps'), 'paths render under stamps');
assert(m.LAYER_ORDER.indexOf('overlay') === m.LAYER_ORDER.length - 1, 'overlay is topmost');
const dl = m.defaultLayers();
assert(m.LAYER_ORDER.every((id) => dl[id] && dl[id].visible === true), 'defaultLayers covers every layer id');

// ── Project carries new fields + back-compat ──────────────────────────────────
const np = m.emptyMapProject();
assert(Array.isArray(np.paths) && np.grid && np.ornaments, 'empty project has paths/grid/ornaments');
const legacy = m.normalizeMapProject({ style: 'fantasy', stamps: [{ id: 'x' }] }); // no paths/grid/ornaments/layers
assert(Array.isArray(legacy.paths) && legacy.paths.length === 0, 'legacy project gains an empty paths array');
assert(legacy.grid.mode === 'off' && typeof legacy.ornaments.frame === 'boolean', 'legacy project gains grid + ornaments');
assert(legacy.layers.paths && legacy.layers.overlay, 'legacy project gains new layer entries');
assert(m.normalizeMapProject({ paths: 'bad', grid: 5, ornaments: null }).paths.length === 0, 'normalize coerces bad paths/grid/ornaments');

// ── Terrain textures + motifs ─────────────────────────────────────────────────
// Every terrain declares a texture kind that exists in TEXTURE_KINDS.
assert(m.TERRAINS.every((t) => typeof t.texture === 'string' && m.TEXTURE_KINDS[t.texture]),
  'every terrain has a valid texture kind');
// Motif accent colors, where present, are hex.
assert(m.TERRAINS.every((t) => !t.motif || /^#[0-9a-f]{3,8}$/i.test(t.motif)), 'terrain motif colors are hex');
assert(Object.keys(m.TEXTURE_KINDS).length >= 15, 'a rich set of texture kinds');
assert(Object.values(m.TEXTURE_KINDS).every((k) => Number.isFinite(k.density) && k.scale > 0), 'texture kinds have density + positive scale');

// terrainMotifs is deterministic for a given seed and varies with the seed.
const forest = m.getTerrain('forest');
const fa = m.terrainMotifs(forest, 100, 100, 40, 7);
const fb = m.terrainMotifs(forest, 100, 100, 40, 7);
const fc = m.terrainMotifs(forest, 100, 100, 40, 8);
assert(fa.length > 0, 'forest produces motifs');
assert(JSON.stringify(fa) === JSON.stringify(fb), 'terrainMotifs deterministic for a seed');
assert(JSON.stringify(fa) !== JSON.stringify(fc), 'terrainMotifs varies with the seed');
assert(fa.every((p) => p.type === 'tree'), 'forest motifs are trees');

// Scatter motifs stay within the dab disc (+ a small motif-size margin).
const disc = m.terrainMotifs(m.getTerrain('tundra'), 200, 150, 30, 3);
assert(disc.length > 0 && disc.every((p) => p.x == null || Math.hypot(p.x - 200, p.y - 150) <= 30 + 6),
  'scatter motifs stay within the dab radius');

// Motif count scales with area × density (bigger radius → more motifs).
const small = m.terrainMotifs(forest, 0, 0, 20, 5).length;
const big = m.terrainMotifs(forest, 0, 0, 60, 5).length;
assert(big > small, 'more motifs on a larger dab');

// Subject-specific motif types.
assert(m.terrainMotifs(m.getTerrain('mountain'), 50, 50, 40, 2)[0].type === 'peak', 'mountains → peaks');
assert(m.terrainMotifs(m.getTerrain('void'), 50, 50, 40, 2).every((p) => p.type === 'dot'), 'space → star dots');
assert(m.terrainMotifs(m.getTerrain('crystal'), 50, 50, 40, 2).some((p) => p.type === 'shard'), 'crystal → shards');

// Line textures (density 0) return stroke primitives spanning the disc, not scatter.
const waves = m.terrainMotifs(m.getTerrain('ocean'), 100, 100, 40, 4);
assert(waves.length > 0 && waves.every((p) => p.type === 'wave'), 'ocean → wave strokes');
assert(waves.every((p) => p.x1 != null && p.x2 != null && p.y != null), 'wave strokes have endpoints');
const circuit = m.terrainMotifs(m.getTerrain('sprawl'), 100, 100, 40, 4);
assert(circuit.some((p) => p.type === 'line') && circuit.some((p) => p.type === 'dot'), 'circuit → grid lines + nodes');

// Degenerate inputs are safe.
assert(Array.isArray(m.terrainMotifs(forest, 0, 0, 0, 1)), 'zero-radius dab is safe (array)');
assert(Array.isArray(m.terrainMotifs({ texture: 'nope' }, 0, 0, 20, 1)), 'unknown texture falls back safely');

console.log(`\n${failed === 0 ? '✅' : '❌'} map-engine tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
