/**
 * Functional tests for the character trait catalog (core/trait-catalog.js).
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-trait-catalog.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}

const cat = await import('../src/core/trait-catalog.js');

// ── Structure: both halves, grouped, non-empty ───────────────────────────────
assert(cat.TRAIT_SETS.personality && cat.TRAIT_SETS.appearance, 'catalog covers personality + appearance');
assert(Array.isArray(cat.TRAIT_GROUPS) && cat.TRAIT_GROUPS.length === 2, 'TRAIT_GROUPS lists both halves');
for (const half of cat.TRAIT_GROUPS) {
  const sections = cat.TRAIT_SETS[half];
  assert(Array.isArray(sections) && sections.length >= 5, `${half} has several categories (${sections.length})`);
  assert(sections.every((s) => typeof s.category === 'string' && s.category), `${half} categories are labeled`);
  assert(sections.every((s) => typeof s.key === 'string' && s.key.startsWith(half)), `${half} sections carry a namespaced key`);
  assert(sections.every((s) => Array.isArray(s.items) && s.items.length > 0), `${half} categories have items`);
  assert(sections.every((s) => s.items.every((it) => typeof it.id === 'string' && typeof it.label === 'string')),
    `${half} items are {id,label}`);
}

// ── Hundreds of traits, unique ids ───────────────────────────────────────────
const all = cat.flattenTraits();
assert(all.length >= 250, `catalog exposes hundreds of traits (${all.length})`);
const ids = all.map((t) => t.id);
assert(new Set(ids).size === ids.length, 'every trait id is unique across the whole catalog');
assert(all.every((t) => t.group === 'personality' || t.group === 'appearance'), 'each trait carries a valid group');
assert(all.every((t) => t.category && t.id && t.label), 'flattened traits are well-formed');
assert(cat.traitCount() === all.length, 'traitCount matches flattenTraits length');

// flattenTraits(half) is a proper subset that sums to the whole.
const p = cat.flattenTraits('personality');
const a = cat.flattenTraits('appearance');
assert(p.length + a.length === all.length, 'personality + appearance partitions the catalog');
assert(p.every((t) => t.group === 'personality'), 'flattenTraits("personality") only returns personality');

// ── traitById ────────────────────────────────────────────────────────────────
const sample = all[0];
assert(cat.traitById(sample.id).label === sample.label, 'traitById resolves a real trait');
assert(cat.traitById('does.not.exist') === null, 'traitById returns null for unknown id');

// ── filterTraits ─────────────────────────────────────────────────────────────
assert(cat.filterTraits('personality', '').length === 0, 'empty query returns [] (grouped view used instead)');
const stoic = cat.filterTraits('personality', 'stoic');
assert(stoic.length >= 1 && stoic.every((t) => t.group === 'personality'), 'filter matches by label within the half');
assert(cat.filterTraits('appearance', 'stoic').length === 0, 'filter is scoped to the requested half');
// id-based match (dots/dashes treated as spaces).
assert(cat.filterTraits('appearance', 'hair').length >= 3, 'filter matches across a category via id/label');

// ── randomTraits (seeded RNG for determinism) ────────────────────────────────
function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const picks = cat.randomTraits('appearance.hair', 3, seededRng(42));
assert(picks.length === 3, 'randomTraits returns the requested count');
assert(new Set(picks.map((t) => t.id)).size === 3, 'randomTraits returns DISTINCT traits');
assert(picks.every((t) => t.id.startsWith('appearance.hair')), 'randomTraits stays within the requested category');
assert(cat.randomTraits('personality', 1, seededRng(7))[0].group === 'personality', 'randomTraits accepts a half scope');
assert(cat.randomTraits('bogus.scope', 3).length === 0, 'unknown scope yields no traits');
// Never returns more than the pool holds.
const hairPool = cat.categoryKeys('appearance').find((c) => c.key === 'appearance.hair');
assert(hairPool, 'categoryKeys exposes appearance.hair');
const over = cat.randomTraits('appearance.facial-hair', 999, seededRng(1));
assert(over.length <= all.filter((t) => t.id.startsWith('appearance.facial-hair')).length, 'randomTraits never exceeds pool size');

// ── randomHalfTraits (shared sampler) ────────────────────────────────────────
const halfAp = cat.randomHalfTraits('appearance', seededRng(5));
assert(halfAp.every((t) => t.group === 'appearance'), 'randomHalfTraits("appearance") returns only appearance');
assert(halfAp.length === cat.TRAIT_SETS.appearance.length, 'appearance half rolls exactly one trait per category');
assert(new Set(halfAp.map((t) => t.category)).size === cat.TRAIT_SETS.appearance.length, 'appearance half covers every category once');
const halfP = cat.randomHalfTraits('personality', seededRng(9));
assert(halfP.length >= 4 && halfP.every((t) => t.group === 'personality'), 'personality half honors the ≥4 floor');
assert(new Set(halfP.map((t) => t.id)).size === halfP.length, 'personality half has no duplicates');
// randomCharacterTraits is the two halves concatenated (shared sampler).
const seedN = 321;
const composed = [...cat.randomHalfTraits('personality', seededRng(seedN)), ...cat.randomHalfTraits('appearance', seededRng(seedN))];
const whole = cat.randomCharacterTraits(seededRng(seedN));
assert(whole.length === composed.length, 'randomCharacterTraits equals personality-half + appearance-half in size');

// ── randomCharacterTraits ────────────────────────────────────────────────────
const roll = cat.randomCharacterTraits(seededRng(123));
assert(roll.length >= 8, `randomCharacterTraits rolls a full spread (${roll.length})`);
assert(new Set(roll.map((t) => t.id)).size === roll.length, 'rolled character traits are unique');
assert(roll.some((t) => t.group === 'personality'), 'roll includes personality traits');
// One appearance trait per appearance category (full look).
const apCats = new Set(roll.filter((t) => t.group === 'appearance').map((t) => t.category));
assert(apCats.size === cat.TRAIT_SETS.appearance.length, 'roll covers every appearance category once');

// ── categoryKeys ─────────────────────────────────────────────────────────────
const keys = cat.categoryKeys('personality');
assert(keys.length === cat.TRAIT_SETS.personality.length, 'categoryKeys returns one entry per section');
assert(keys.every((k) => k.key && k.category), 'categoryKeys entries are {key,category}');

console.log(`\n${failed === 0 ? '✅' : '❌'} trait-catalog tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
