/**
 * Regression tests for character-list reconciliation (core/character-merge.js).
 * Guards the coexistence of the Character Planner (free-form fields) and the
 * Character Builder (traitTags) on the shared `characters` collection.
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-character-merge.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}

const { reconcileCharacters } = await import('../src/core/character-merge.js');

// ── Core scenario: Planner save must NOT clobber Builder's traitTags ─────────
// The Planner holds a stale, import-time snapshot without traitTags; the Builder
// has since written traitTags to storage. A Planner edit persists its snapshot.
const plannerMemory = [
  { id: 'c1', name: 'Aurelian (edited)', role: 'Commander', description: 'new desc' },
  { id: 'c2', name: 'Sera', role: 'Rebel' },
];
const liveStored = [
  { id: 'c1', name: 'Aurelian', role: 'Commander', description: 'old desc',
    traitTags: [{ id: 'personality.temperament.brooding', label: 'Brooding', category: 'Temperament', group: 'personality' }] },
  { id: 'c2', name: 'Sera', role: 'Rebel' },
];

const merged = reconcileCharacters(plannerMemory, liveStored);
const c1 = merged.find((c) => c.id === 'c1');
assert(Array.isArray(c1.traitTags) && c1.traitTags.length === 1, 'traitTags written by the Builder survive a Planner save');
assert(c1.name === 'Aurelian (edited)', 'in-memory edits still win for fields the Planner owns');
assert(c1.description === 'new desc', 'Planner field changes are applied over the stored record');

// ── Builder-created characters are not deleted by a Planner save ─────────────
const stored2 = [
  ...liveStored,
  { id: 'builder1', name: 'New Hero', traitTags: [{ id: 'x', label: 'X', category: 'C', group: 'personality' }] },
];
const merged2 = reconcileCharacters(plannerMemory, stored2);
const survivor = merged2.find((c) => c.id === 'builder1');
assert(survivor && survivor.name === 'New Hero', 'a character created in the Builder is preserved, not wiped');
assert(survivor.traitTags.length === 1, 'the preserved foreign record keeps its traitTags');

// ── Explicit deletion is honored (not resurrected from storage) ──────────────
const afterDelete = reconcileCharacters(
  plannerMemory.filter((c) => c.id !== 'c2'),
  liveStored,
  new Set(['c2']),
);
assert(!afterDelete.some((c) => c.id === 'c2'), 'a character deleted in the Planner stays deleted');
assert(afterDelete.some((c) => c.id === 'c1'), 'other characters remain after a delete');

// ── New in-memory record with no stored counterpart is kept as-is ────────────
const withNew = reconcileCharacters(
  [...plannerMemory, { id: 'c3', name: 'Fresh' }],
  liveStored,
);
assert(withNew.find((c) => c.id === 'c3').name === 'Fresh', 'brand-new in-memory records are kept');

// ── Robustness: empty / non-array inputs ─────────────────────────────────────
assert(Array.isArray(reconcileCharacters(null, null)) && reconcileCharacters(null, null).length === 0, 'null inputs yield an empty list');
assert(reconcileCharacters([{ id: 'a' }], []).length === 1, 'empty storage keeps in-memory records');
assert(reconcileCharacters([], [{ id: 'b', traitTags: [] }]).length === 1, 'empty memory preserves stored-only records');
// Accepts an array for deletedIds too.
assert(reconcileCharacters([], [{ id: 'z' }], ['z']).length === 0, 'deletedIds accepts a plain array');

console.log(`\n${failed === 0 ? '✅' : '❌'} character-merge tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
