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

// Default keeps stamps upright: no rotation unless rotJitter is explicitly set.
assert(m.defaultStampOptions().rotJitter === 0, 'default rotJitter is 0 (stamps stay upright)');
assert(m.scatterStamps(path, { seed: 9, size: 40, density: 4 }).every((p) => p.rot === 0), 'default scatter produces upright stamps (rot === 0)');
// The engine can STILL produce rotation when a caller opts in via rotJitter.
const varied = m.scatterStamps(path, { seed: 9, size: 40, density: 4, sizeJitter: 0.4, rotJitter: 0.6, variants: ['a', 'b', 'c'] });
assert(varied.some((p) => p.rot !== 0), 'opting into rotJitter still yields rotation');
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

// ── View transform (zoom + pan) ────────────────────────────────────────────────
assert(m.defaultView().zoom === 1 && m.defaultView().panX === 0 && m.defaultView().panY === 0, 'default view is 100% / no pan');
assert(m.MIN_ZOOM > 0 && m.MAX_ZOOM > m.MIN_ZOOM, 'zoom bounds are sane');
assert(m.clampZoom(1000) === m.MAX_ZOOM && m.clampZoom(0.0001) === m.MIN_ZOOM, 'clampZoom bounds a zoom factor');
assert(m.clampZoom('nope') === 1 && m.clampZoom(NaN) === 1, 'clampZoom guards non-finite input');
// normalizeView repairs junk.
const nv = m.normalizeView({ zoom: 999, panX: 'x', panY: 12 });
assert(nv.zoom === m.MAX_ZOOM && nv.panX === 0 && nv.panY === 12, 'normalizeView clamps zoom + coerces bad pan');
assert(m.normalizeView(null).zoom === 1, 'normalizeView(null) yields a neutral view');
// screenToWorld / worldToScreen are inverses under a given view.
const vv = { zoom: 2, panX: 40, panY: -10 };
const world = { x: 123, y: 77 };
const screen = m.worldToScreen(world, vv);
const back = m.screenToWorld(screen, vv);
assert(approx(back.x, world.x) && approx(back.y, world.y), 'screen<->world roundtrips under a view');
assert(approx(screen.x, 123 * 2 + 40) && approx(screen.y, 77 * 2 - 10), 'worldToScreen applies scale then pan');
// zoomAt keeps the world point under the anchor fixed (zoom-to-cursor).
const anchor = { x: 200, y: 150 };
const before = m.screenToWorld(anchor, vv);
const zoomed = m.zoomAt(vv, 1.5, anchor);
const after = m.screenToWorld(anchor, zoomed);
assert(approx(before.x, after.x) && approx(before.y, after.y), 'zoomAt keeps the anchor world point fixed');
assert(approx(zoomed.zoom, 3), 'zoomAt multiplies the zoom factor');
assert(m.zoomAt(vv, 100, anchor).zoom === m.MAX_ZOOM, 'zoomAt still clamps to MAX_ZOOM');

// ── Larger canvas presets ──────────────────────────────────────────────────────
['huge', 'ultrawide', 'grand', 'bigsquare'].forEach((id) => {
  assert(m.getCanvasPreset(id).id === id, `canvas preset ${id} exists`);
});
assert(m.getCanvasPreset('grand').width >= 3840, 'grand preset is large');
assert(m.CANVAS_PRESETS.every((p) => p.width >= 1 && p.height >= 1), 'all canvas presets have positive size');

// ── Project view serialization ─────────────────────────────────────────────────
assert(m.emptyMapProject().view && m.emptyMapProject().view.zoom === 1, 'empty project carries a default view');
const viewLoaded = m.normalizeMapProject({ style: 'scifi', view: { zoom: 3, panX: 5, panY: 6 } });
assert(viewLoaded.view.zoom === 3 && viewLoaded.view.panX === 5, 'normalize keeps a valid saved view');
assert(m.normalizeMapProject({ view: 'bad' }).view.zoom === 1, 'normalize repairs a bad saved view');
assert(m.normalizeMapProject({ style: 'fantasy' }).view.zoom === 1, 'legacy project (no view) gains a default view');

// ── Sci-fi world-type surface templates ────────────────────────────────────────
const scifiSurfaces = m.surfacesForStyle('scifi');
const worldSurfaces = scifiSurfaces.filter((s) => s.kind === 'world');
assert(worldSurfaces.length >= 8, `sci-fi has world-type surfaces (${worldSurfaces.length})`);
assert(worldSurfaces.every((s) => typeof s.world === 'string' && s.world.length > 0), 'world surfaces name a world flavor');
assert(worldSurfaces.every((s) => s.style === 'scifi'), 'world surfaces are sci-fi style');
['world_barren', 'world_lush', 'world_industrial', 'world_oceanic', 'world_ice'].forEach((id) => {
  assert(m.getSurface(id).kind === 'world', `${id} is a world-kind surface`);
});
// New surfaces keep clean hex base/edge like the originals (guards the injection bug).
assert(m.SURFACES.every((s) => /^#[0-9a-f]{6}$/i.test(s.base) && /^#[0-9a-f]{6}$/i.test(s.edge)), 'all surfaces (incl. world types) have clean hex');

// worldSurfaceSeed: deterministic, and distinct per flavor even at equal name length.
assert(m.worldSurfaceSeed('barren', 800, 600) === m.worldSurfaceSeed('barren', 800, 600), 'worldSurfaceSeed is deterministic');
assert(m.worldSurfaceSeed('barren', 800, 600) !== m.worldSurfaceSeed('desert', 800, 600), 'same-length flavors get distinct seeds (barren vs desert)');
assert(m.worldSurfaceSeed('ice', 800, 600) !== m.worldSurfaceSeed('gas', 800, 600), 'same-length flavors get distinct seeds (ice vs gas)');
assert(m.worldSurfaceSeed('barren', 800, 600) !== m.worldSurfaceSeed('barren', 1200, 600), 'seed varies with canvas size');
assert(m.worldSurfaceSeed('', 0, 0) >= 1, 'worldSurfaceSeed is a positive int even for empty/zero input');
// Every world-type surface produces a distinct seed at a fixed size (no collisions).
const worldSeeds = worldSurfaces.map((s) => m.worldSurfaceSeed(s.world, 1000, 700));
assert(new Set(worldSeeds).size === worldSeeds.length, 'all world-type flavors get unique seeds at a given size');

// ── Backdrop image (imported reference canvas) ─────────────────────────────────
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
assert(m.emptyMapProject().backdrop === null, 'empty project has no backdrop');
assert(m.BACKDROP_FITS.includes('contain') && m.BACKDROP_FITS.includes('cover') && m.BACKDROP_FITS.includes('stretch'), 'backdrop fit modes defined');
// normalizeBackdrop only accepts image data URLs (guards <img src> injection).
assert(m.normalizeBackdrop({ dataUrl: PNG, fit: 'cover' }).fit === 'cover', 'normalizeBackdrop keeps a valid image data URL + fit');
assert(m.normalizeBackdrop({ dataUrl: PNG }).fit === 'contain', 'normalizeBackdrop defaults fit to contain');
assert(m.normalizeBackdrop({ dataUrl: PNG, fit: 'nope' }).fit === 'contain', 'normalizeBackdrop repairs a bad fit');
assert(m.normalizeBackdrop({ dataUrl: 'https://evil.example/x.png' }) === null, 'normalizeBackdrop rejects a non-data URL');
assert(m.normalizeBackdrop({ dataUrl: 'data:text/html,<script>' }) === null, 'normalizeBackdrop rejects a non-image data URL');
assert(m.normalizeBackdrop(null) === null && m.normalizeBackdrop('x') === null, 'normalizeBackdrop guards junk');
// Serialization round-trips through the project.
assert(m.normalizeMapProject({ backdrop: { dataUrl: PNG, fit: 'stretch' } }).backdrop.fit === 'stretch', 'normalize keeps a valid backdrop');
assert(m.normalizeMapProject({ backdrop: 'bad' }).backdrop === null, 'normalize repairs a bad backdrop to null');
assert(m.normalizeMapProject({ style: 'fantasy' }).backdrop === null, 'legacy project (no backdrop) gets null');

// fitContain / fitCover / backdropRect: aspect preserved, centered, degenerate-safe.
const contain = m.fitContain(200, 100, 400, 400); // wide image into a square box
assert(approx(contain.w, 400) && approx(contain.h, 200), 'fitContain scales to fit the limiting axis');
assert(approx(contain.x, 0) && approx(contain.y, 100), 'fitContain centers the letterbox');
const cover = m.fitCover(200, 100, 400, 400); // cover the square
assert(approx(cover.h, 400) && approx(cover.w, 800), 'fitCover fills the box (overflows the other axis)');
assert(approx(cover.x, -200) && approx(cover.y, 0), 'fitCover centers the overflow');
assert(m.backdropRect('stretch', 200, 100, 400, 400).w === 400 && m.backdropRect('stretch', 200, 100, 400, 400).h === 400, 'stretch fills the whole box');
assert(m.backdropRect('contain', 200, 100, 400, 400).w === contain.w, 'backdropRect(contain) matches fitContain');
assert(Number.isFinite(m.fitContain(0, 0, 100, 100).w), 'fitContain is safe for a zero-size image');

// ── Terrain motif renderer (drawMotif) — hoisted from the UI, now shared ──────
// hexA builds a clean rgba() string from a hex + alpha, guarding junk.
assert(/^rgba\(\d+,\d+,\d+,1\)$/.test(m.hexA('#3f7d4f', 1)), 'hexA builds an rgba() string');
assert(m.hexA('#3f7d4f', 0).endsWith(',0)'), 'hexA honors the alpha');
assert(typeof m.hexA('not-a-color', 0.5) === 'string', 'hexA is safe on a bad color');
// drawMotif is exported and DOM-free: it should render every primitive type
// against a canvas-2d-like context without throwing. Use a mock ctx that just
// records that draw calls happened.
assert(typeof m.drawMotif === 'function', 'drawMotif is exported');
function mockCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push(name); return undefined; };
  return {
    calls,
    save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), quadraticCurveTo: rec('quadraticCurveTo'),
    arc: rec('arc'), closePath: rec('closePath'), fill: rec('fill'), stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    createRadialGradient: () => ({ addColorStop: rec('addColorStop') }),
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set lineJoin(v) {}, get lineJoin() { return ''; },
    set lineCap(v) {}, get lineCap() { return ''; },
  };
}
const primitives = [
  { type: 'tree', x: 50, y: 50, s: 6, color: '#3f7d4f' },
  { type: 'blob', x: 50, y: 50, s: 6, color: '#5a7d3f' },
  { type: 'blob', x: 50, y: 50, s: 6, color: '#7a6a5a', poly: true },
  { type: 'tuft', x: 50, y: 50, s: 6, color: '#6a9a4a' },
  { type: 'peak', x: 50, y: 50, s: 6, color: '#8a8178' },
  { type: 'hill', x: 50, y: 50, s: 6, color: '#84a35a' },
  { type: 'shard', x: 50, y: 50, s: 6, color: '#9a7fd0' },
  { type: 'cross', x: 50, y: 50, s: 6, color: '#7a5a3a' },
  { type: 'ring', x: 50, y: 50, s: 6, color: '#9ca3af' },
  { type: 'cloud', x: 50, y: 50, s: 6, color: '#b06fd0' },
  { type: 'dot', x: 50, y: 50, s: 6, color: '#ffd27f' },
  { type: 'dot', x: 50, y: 50, s: 6, color: '#ffd27f', glow: true },
  { type: 'crack', x1: 10, y1: 10, x2: 40, y2: 40, color: '#57534e' },
  { type: 'line', x1: 10, y1: 10, x2: 40, y2: 40, w: 2, color: '#7fd0ff' },
  { type: 'wave', x1: 10, x2: 90, y: 50, amp: 3, phase: 0, w: 1.5, color: '#3f6b8a' },
];
let drewOk = 0;
for (const p of primitives) {
  const ctx = mockCtx();
  try { m.drawMotif(ctx, p, 1); if (ctx.calls.includes('save') && ctx.calls.includes('restore')) drewOk++; }
  catch (e) { console.error('   drawMotif threw for', p.type, e.message); }
}
assert(drewOk === primitives.length, `drawMotif renders all ${primitives.length} primitive variants without throwing`);
// An unknown primitive type is a no-op (still balances save/restore).
const ctxU = mockCtx();
m.drawMotif(ctxU, { type: 'nope', x: 0, y: 0, s: 4, color: '#fff' }, 1);
assert(ctxU.calls[0] === 'save' && ctxU.calls[ctxU.calls.length - 1] === 'restore', 'unknown motif type is a safe no-op');
// terrainMotifs output feeds drawMotif cleanly (integration of the two).
const tm = m.terrainMotifs(m.getTerrain('forest'), 50, 50, 30, 3);
const ctxT = mockCtx();
assert(tm.length > 0, 'terrainMotifs produced motifs to draw');
tm.forEach((mo) => m.drawMotif(ctxT, mo, 1));
assert(ctxT.calls.length > 0, 'drawMotif renders real terrainMotifs output');

console.log(`\n${failed === 0 ? '✅' : '❌'} map-engine tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
