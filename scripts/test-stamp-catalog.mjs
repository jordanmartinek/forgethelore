/**
 * Functional tests for the shared element/stamp catalog (core/stamp-catalog.js).
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-stamp-catalog.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}

const cat = await import('../src/core/stamp-catalog.js');
const shapes = await import('../src/core/world-shapes.js');
const knownShapes = new Set(shapes.allShapeIds());

// ── Structure: both styles, grouped, non-empty ───────────────────────────────
assert(cat.STAMP_SETS.fantasy && cat.STAMP_SETS.scifi, 'catalog covers fantasy + sci-fi styles');
for (const style of ['fantasy', 'scifi']) {
  const groups = cat.STAMP_SETS[style];
  assert(Array.isArray(groups) && groups.length >= 4, `${style} has several groups (${groups.length})`);
  assert(groups.every((g) => typeof g.group === 'string' && g.group), `${style} groups are labeled`);
  assert(groups.every((g) => Array.isArray(g.items) && g.items.length > 0), `${style} groups have items`);
  assert(groups.every((g) => g.items.every((it) => typeof it.shape === 'string' && typeof it.label === 'string')),
    `${style} items are {shape,label}`);
}

// ── Every catalog shape resolves to a real silhouette in world-shapes ─────────
let missing = 0;
const allItems = [...cat.STAMP_SETS.fantasy, ...cat.STAMP_SETS.scifi].flatMap((g) => g.items);
for (const it of allItems) {
  if (!knownShapes.has(it.shape)) { missing++; console.error('   missing shape:', it.shape); }
}
assert(missing === 0, `every catalog item maps to a real world-shape (${allItems.length} items checked)`);

// A healthy breadth of distinct elements across both styles.
const distinct = new Set(allItems.map((it) => it.shape));
assert(distinct.size >= 100, `catalog exposes a wide element set (${distinct.size} distinct shapes)`);

// ── stampColor ────────────────────────────────────────────────────────────────
assert(cat.stampColor('mountain') === '#8a8178', 'stampColor returns the mapped tint');
assert(/^#[0-9a-f]{6}$/i.test(cat.stampColor('spaceship')), 'stampColor returns a hex for a sci-fi shape');
assert(cat.stampColor('totally-unknown-shape') === '#8a8178', 'stampColor falls back to a neutral tint');
// Every color in STAMP_COLORS is a clean hex (guards against injection into style attrs).
assert(Object.values(cat.STAMP_COLORS).every((c) => /^#[0-9a-f]{6}$/i.test(c)), 'all STAMP_COLORS are clean 6-digit hex');

// ── STAMP_VARIANTS point at real shapes ───────────────────────────────────────
let badVariant = 0;
for (const [base, pool] of Object.entries(cat.STAMP_VARIANTS)) {
  if (!knownShapes.has(base)) badVariant++;
  if (!Array.isArray(pool) || pool.some((s) => !knownShapes.has(s))) badVariant++;
}
assert(badVariant === 0, 'every STAMP_VARIANTS base + pool entry is a real shape');
assert(cat.STAMP_VARIANTS.forest.includes('tree'), 'forest mixes in trees for scatter variety');

// ── stampItemsForStyle ─────────────────────────────────────────────────────────
const fantasyFlat = cat.stampItemsForStyle('fantasy');
const fantasyGroupItemCount = cat.STAMP_SETS.fantasy.reduce((n, g) => n + g.items.length, 0);
assert(fantasyFlat.length === fantasyGroupItemCount, 'stampItemsForStyle flattens all group items');
assert(fantasyFlat.every((it) => it.shape && it.label), 'flattened items are well-formed');
assert(cat.stampItemsForStyle('nonsense').length === fantasyFlat.length, 'unknown style falls back to fantasy');
// Regression guard: style switching resolves a real default stamp shape from
// the FLAT list (the grouped STAMP_SETS[style][0] is a {group,items}, not a stamp).
for (const style of ['fantasy', 'scifi']) {
  const first = cat.stampItemsForStyle(style)[0];
  assert(first && typeof first.shape === 'string' && knownShapes.has(first.shape),
    `stampItemsForStyle('${style}')[0].shape is a real default stamp (not undefined)`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} stamp-catalog tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
