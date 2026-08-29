/**
 * Family-tree layout tests (family-tree.js computeLayout) — pure generation
 * assignment, including the cycle-safety fix. No real DOM needed.
 * Run: NODE_OPTIONS= node scripts/test-family-tree.mjs
 */

// family-tree.js imports renderer/modal which reference document at CALL time,
// not import time; provide a no-op stub so the import evaluates, plus a
// localStorage stub for repo/persist.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
const noop = () => {};
globalThis.document = { createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }), createElementNS: () => ({ style: {}, setAttribute: noop, appendChild: noop }), getElementById: () => null, querySelector: () => null };

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

const { computeLayout } = await import('../src/modules/family-tree.js');

const pcs = (ids) => ids.map((id) => ({ id }));

// ── straight lineage: grandparent -> parent -> child ─────────────────────────
let layout = computeLayout(pcs(['g', 'p', 'c']), [
  { type: 'parent', from: 'g', to: 'p' },
  { type: 'parent', from: 'p', to: 'c' },
]);
assert(layout.pos.get('g').row === 0, 'grandparent at generation 0');
assert(layout.pos.get('p').row === 1, 'parent at generation 1');
assert(layout.pos.get('c').row === 2, 'child at generation 2');
assert(layout.maxGen === 2, 'maxGen = 2');

// ── isolated piece with no links -> generation 0 ─────────────────────────────
layout = computeLayout(pcs(['a', 'lonely']), [{ type: 'spouse', from: 'a', to: 'a' }]);
assert(layout.pos.get('lonely').row === 0, 'isolated piece lands at generation 0');

// ── child of two parents in different generations -> max+1 ───────────────────
layout = computeLayout(pcs(['gp', 'p1', 'p2', 'kid']), [
  { type: 'parent', from: 'gp', to: 'p1' },   // gp gen0, p1 gen1
  { type: 'parent', from: 'p1', to: 'kid' },  // via p1 -> kid gen2
  { type: 'parent', from: 'p2', to: 'kid' },  // p2 gen0 -> kid would be gen1
]);
assert(layout.pos.get('kid').row === 2, 'child of parents in gens 1 and 0 -> generation 2 (max+1)');

// ── mutual parent-cycle must NOT hang and must be stable (no inversion) ──────
layout = computeLayout(pcs(['x', 'y']), [
  { type: 'parent', from: 'x', to: 'y' },
  { type: 'parent', from: 'y', to: 'x' },
]);
// With the back-edge dropped for depth calc, at least one node is a root (gen 0)
// and neither generation is negative/NaN; the result is deterministic.
const gx = layout.pos.get('x').row, gy = layout.pos.get('y').row;
assert(Number.isFinite(gx) && Number.isFinite(gy) && gx >= 0 && gy >= 0, 'parent-cycle yields finite non-negative generations');
assert(Math.min(gx, gy) === 0, 'parent-cycle: one node is treated as a root (gen 0), no infinite loop');

console.log(`\n${failed === 0 ? '✅' : '❌'} family-tree layout tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
