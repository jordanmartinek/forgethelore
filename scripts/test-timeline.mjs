/**
 * Temporal engine tests (timeline-state.js) — pure logic, no DOM/network.
 * Run: NODE_OPTIONS= node scripts/test-timeline.mjs
 */

// persist.js reads localStorage at import; provide a stub + seed the active id.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
store.set('loreforge_activeProjectId', 'proj1'); // use demo defaults in progression.js

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

const {
  orderedScenes, piecesAtScene, factionPowerAtScene, factionPowerSeries,
  tensionSeries, flatStretches,
} = await import('../src/core/timeline-state.js');

// Minimal world: 2 factions, 3 pieces, 3 scenes with escalating power shifts.
const factions = [
  { id: 'f1', name: 'Red', color: '#ef4444' },
  { id: 'f2', name: 'Blue', color: '#3b82f6' },
];
const pieces = [
  { id: 'p1', faction: 'f1', momentum: 'stable', resources: { political: 50, military: 50, economic: 50, knowledge: 50 } },
  { id: 'p2', faction: 'f1', momentum: 'stable', resources: { political: 50, military: 50, economic: 50, knowledge: 50 } },
  { id: 'p3', faction: 'f2', momentum: 'stable', resources: { political: 50, military: 50, economic: 50, knowledge: 50 } },
];
const scenes = [
  { id: 's2', order: 2, conflictType: 'opposition', participants: ['p1', 'p3'], powerShift: { f1: 20, f2: -20 } },
  { id: 's1', order: 1, conflictType: 'alliance', participants: ['p1'], powerShift: { f1: 5 } },
  { id: 's3', order: 3, conflictType: 'escalation', participants: ['p1', 'p2', 'p3'], powerShift: { f1: 30, f2: -10 } },
];

// ── ordering ─────────────────────────────────────────────────────────────────
const ord = orderedScenes(scenes);
assert(ord.map((s) => s.order).join(',') === '1,2,3', 'orderedScenes sorts by order asc');

// ── piecesAtScene returns normalized {resources,momentum} for every piece ────
const at1 = piecesAtScene('s1', scenes, pieces);
assert(at1.length === 3, 'piecesAtScene returns all pieces');
assert(at1.every((x) => x.state && x.state.resources && typeof x.state.momentum === 'string'), 'each state is normalized');

// ── factionPowerAtScene sums member resources (consistent authored-base scale) ──
// No arcs for these pieces -> seeded from authored resources (200 each).
const power1 = factionPowerAtScene('s1', scenes, pieces);
assert(power1.f1 === 400, 'f1 power = 2 pieces * 200 authored resources = 400');
assert(power1.f2 === 200, 'f2 power = 1 piece * 200 = 200');

// Scale-consistency: a piece with DIFFERENT authored resources is scored from
// THOSE values (not a flat 200 base), so faction power is comparable across
// arc'd and non-arc'd pieces.
const customPieces = [
  { id: 'px', faction: 'fx', momentum: 'stable', resources: { political: 90, military: 20, economic: 80, knowledge: 70 } }, // = 260
];
const customScenes = [{ id: 'sx', order: 1, participants: ['px'], powerShift: {} }];
assert(factionPowerAtScene('sx', customScenes, customPieces).fx === 260,
  'faction power uses the piece\'s AUTHORED resources (260), not a flat 200 base');

// ── factionPowerSeries shape ─────────────────────────────────────────────────
const series = factionPowerSeries(scenes, pieces, factions);
assert(series.labels.length === 3 && series.series.length === 2, 'series has 3 labels + 2 factions');
assert(series.series[0].values.length === 3, 'each series has a value per scene');
assert(series.series[0].color === '#ef4444', 'series carries faction color');

// ── tensionSeries: escalation scene with most participants + biggest shift wins ──
const { scores } = tensionSeries(scenes);
assert(scores.length === 3, 'one tension score per scene');
assert(scores[2] === 100, 'the escalation climax (s3) is the peak (normalized 100)');
assert(scores[0] < scores[1] && scores[1] < scores[2], 'tension rises s1 < s2 < s3');

// ── flatStretches detects runs of low-tension scenes ─────────────────────────
const flat = flatStretches([10, 15, 20, 80, 5, 8, 9, 12], 30, 3);
assert(flat.length === 2, 'detects two low-tension runs');
assert(flat[0].start === 0 && flat[0].end === 2, 'first flat run is scenes 0..2');
assert(flat[1].start === 4 && flat[1].end === 7, 'second flat run is scenes 4..7');

console.log(`\n${failed === 0 ? '✅' : '❌'} timeline engine tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
