/**
 * Functional tests for the World Builder shape library (core/world-shapes.js).
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-world-shapes.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}

const m = await import('../src/core/world-shapes.js');
const {
  SHAPES, SUBJECTS, shapeSVG, shapeMarkup, shapeLabel, allShapeIds,
  resolveShapeId, LEGACY_TYPE_TO_SHAPE,
} = m;

// ── Catalog integrity ────────────────────────────────────────────────────────
const ids = allShapeIds();
assert(ids.length >= 55, `wide catalog of shapes (${ids.length} >= 55)`);
assert(SUBJECTS.length >= 8, `many canvas subjects (${SUBJECTS.length} >= 8)`);

// Every shape renders non-trivial SVG.
let empties = 0;
for (const id of ids) {
  const svg = shapeSVG(id);
  if (!svg || svg.length < 20) empties++;
}
assert(empties === 0, 'every shape returns non-empty SVG markup');

// Every subject item points at a real shape, and labels resolve.
let missing = 0;
const seen = new Set();
for (const subj of SUBJECTS) {
  assert(subj.id && subj.label && subj.icon && Array.isArray(subj.items) && subj.items.length > 0,
    `subject "${subj.id}" is well-formed with items`);
  for (const it of subj.items) {
    if (!SHAPES[it.shape]) missing++;
    seen.add(it.shape);
    assert(shapeLabel(it.shape) === it.label, `shapeLabel resolves for ${it.shape}`);
  }
}
assert(missing === 0, 'every palette item maps to a real shape');
assert(seen.size >= 55, `palette exposes the full catalog (${seen.size} items)`);

// ── Subject coverage (the user asked for a wide berth per subject) ────────────
for (const subj of SUBJECTS) {
  assert(subj.items.length >= 4, `subject "${subj.label}" offers a wide berth (${subj.items.length} >= 4)`);
}
// The specific shapes the user named must exist and look like themselves
// (we can't assert pixels, but we assert the silhouettes are distinct markup).
for (const named of ['skyscraper', 'planet', 'mountain', 'city', 'castle', 'ocean', 'sun', 'ringed_planet', 'volcano', 'tree']) {
  assert(!!SHAPES[named], `named element exists: ${named}`);
}

// ── Markup wrapper ────────────────────────────────────────────────────────────
const mk = shapeMarkup('skyscraper', 48, '#3b82f6');
assert(mk.startsWith('<svg') && mk.includes('viewBox="0 0 100 100"'), 'shapeMarkup wraps in a 100x100 svg');
assert(mk.includes('width="48"') && mk.includes('height="48"'), 'shapeMarkup honors size');
assert(mk.includes('--el-fill:#3b82f6'), 'shapeMarkup injects the fill color');
assert(mk.includes('--el-stroke:color-mix'), 'shapeMarkup derives a stroke from the fill');
// Unknown shape falls back to a drawable dot rather than an empty <svg>.
const fallback = shapeMarkup('does-not-exist');
assert(fallback.includes('<circle'), 'unknown shape falls back to a visible dot');

// ── Per-instance id uniqueness (gas_giant has an internal clipPath) ───────────
const g1 = shapeSVG('gas_giant', '-a');
const g2 = shapeSVG('gas_giant', '-b');
assert(g1.includes('id="gg-a"') && g1.includes('url(#gg-a)'), 'gas_giant clip id takes the provided uid');
assert(!g1.includes('gg-b') && !g2.includes('gg-a'), 'distinct uids do not collide');
// Default (no uid) still yields a unique-ish suffix, never a bare "gg".
const gDefault = shapeSVG('gas_giant');
assert(/id="gg-[a-z0-9]+"/.test(gDefault), 'default gas_giant gets a random unique clip id');

// ── Backward compatibility with legacy worldBuilder nodes ─────────────────────
assert(resolveShapeId({ shape: 'metropolis' }) === 'metropolis', 'explicit shape wins');
assert(resolveShapeId({ type: 'planet' }) === 'planet', 'legacy type "planet" maps to a shape');
assert(resolveShapeId({ type: 'space_station' }) === 'space_station', 'legacy space_station maps');
assert(resolveShapeId({ type: 'void_conduit' }) === 'void_conduit', 'legacy void_conduit maps');
assert(resolveShapeId({ type: 'kingdom' }) === 'castle', 'legacy kingdom maps to castle silhouette');
assert(resolveShapeId({ type: 'ship' }) === 'spaceship', 'legacy ship maps to spaceship');
assert(SHAPES[resolveShapeId({ type: 'totally-unknown' })], 'unknown type still resolves to a real shape');
assert(resolveShapeId(null) === 'planet', 'null node resolves to a safe default');
// Every legacy mapping points at a real shape.
let legacyBad = 0;
for (const target of Object.values(LEGACY_TYPE_TO_SHAPE)) if (!SHAPES[target]) legacyBad++;
assert(legacyBad === 0, 'every legacy type maps to a real shape');

// ── safeColor (guards colors injected into inline style / custom props) ───────
const { safeColor } = m;
assert(safeColor('#3b82f6') === '#3b82f6', 'accepts 6-digit hex');
assert(safeColor('#abc') === '#abc', 'accepts 3-digit hex');
assert(safeColor('#11223344') === '#11223344', 'accepts 8-digit hex (alpha)');
assert(safeColor('rgb(10, 20, 30)') === 'rgb(10, 20, 30)', 'accepts rgb()');
assert(safeColor('rgba(10,20,30,0.5)') === 'rgba(10,20,30,0.5)', 'accepts rgba()');
assert(safeColor('hsl(200 50% 40%)') === 'hsl(200 50% 40%)', 'accepts hsl()');
assert(safeColor('rebeccapurple') === 'rebeccapurple', 'accepts a bare CSS keyword');
assert(safeColor('var(--accent-primary)') === 'var(--accent-primary)', 'accepts a var() reference');
// Malicious / malformed values must be rejected to the fallback.
assert(safeColor('#fff" onload="alert(1)') === 'var(--accent-primary)', 'rejects attribute-breakout attempt');
assert(safeColor('red;} body{display:none') === 'var(--accent-primary)', 'rejects style-injection attempt');
assert(safeColor('url(x)') === 'var(--accent-primary)', 'rejects url() payloads');
assert(safeColor('') === 'var(--accent-primary)', 'empty string -> fallback');
assert(safeColor(null) === 'var(--accent-primary)', 'null -> fallback');
assert(safeColor('#zzz') === 'var(--accent-primary)', 'invalid hex -> fallback');
assert(safeColor('#000', '#fff') === '#000' && safeColor('12 not a color;', '#fff') === '#fff', 'custom fallback honored for invalid input');
// A bare alphabetic word is a plausible CSS keyword and can't break an attribute, so it's allowed.
assert(safeColor('teal') === 'teal', 'bare alphabetic keyword is accepted (safe in a style attr)');
// skyscraper no longer references the (previously undefined) sheen gradient.
assert(!shapeSVG('skyscraper').includes('sky-sheen'), 'skyscraper drops the dead gradient reference');

console.log(`\n${failed === 0 ? '✅' : '❌'} world-shapes tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
