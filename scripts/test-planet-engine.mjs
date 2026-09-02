/**
 * Functional tests for the 3D Planet engine (core/planet-engine.js).
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-planet-engine.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const m = await import('../src/core/planet-engine.js');

// ── Vector helpers ─────────────────────────────────────────────────────────
assert(approx(m.dot(m.vec3(1, 2, 3), m.vec3(4, 5, 6)), 32), 'dot product');
assert(approx(m.length(m.vec3(3, 4, 0)), 5), 'length');
const n = m.normalize(m.vec3(0, 3, 4));
assert(approx(m.length(n), 1) && approx(n.y, 0.6) && approx(n.z, 0.8), 'normalize');
assert(m.normalize(m.vec3(0, 0, 0)).x === 0, 'normalize of zero vector is safe');

// ── clampPitch / wrapYaw ───────────────────────────────────────────────────
assert(m.clampPitch(10) === m.MAX_PITCH && m.clampPitch(-10) === -m.MAX_PITCH, 'pitch clamps to just shy of poles');
assert(m.clampPitch(0.2) === 0.2, 'pitch passes valid values through');
assert(m.clampPitch(NaN) === 0, 'pitch guards NaN');
assert(approx(m.wrapYaw(Math.PI * 3), m.wrapYaw(Math.PI)), 'yaw wraps by 2π');
assert(m.wrapYaw(0) === 0 && Math.abs(m.wrapYaw(4)) <= Math.PI, 'yaw stays within [-π, π]');

// ── Orbit matrix ────────────────────────────────────────────────────────────
const I = m.orbitMatrix(0, 0);
assert(approx(I[0], 1) && approx(I[4], 1) && approx(I[8], 1) && approx(I[1], 0), 'orbit(0,0) is identity');
// A rotation matrix is orthonormal: R·Rᵀ = I  → applying R then Rᵀ round-trips.
const R = m.orbitMatrix(0.6, 0.3);
const Rt = m.transpose3(R);
const p0 = m.vec3(0.2, -0.5, 0.84);
const back = m.applyMat3(Rt, m.applyMat3(R, p0));
assert(approx(back.x, p0.x) && approx(back.y, p0.y) && approx(back.z, p0.z), 'Rᵀ·R·p round-trips (orthonormal rotation)');
// Rotation preserves length.
const rotated = m.applyMat3(R, m.vec3(1, 0, 0));
assert(approx(m.length(rotated), 1), 'orbit rotation preserves length');
// Yaw about Y leaves the +Y axis fixed.
const yAxis = m.applyMat3(m.orbitMatrix(1.1, 0), m.vec3(0, 1, 0));
assert(approx(yAxis.x, 0) && approx(yAxis.y, 1) && approx(yAxis.z, 0), 'yaw rotation keeps the pole on +Y');

// ── Ray from screen ──────────────────────────────────────────────────────────
const cam = { width: 800, height: 600, fov: Math.PI / 4, distance: 3 };
const center = m.rayFromScreen(400, 300, cam);
assert(approx(center.origin.z, 3), 'camera sits at +z distance');
assert(approx(center.dir.x, 0) && approx(center.dir.y, 0) && approx(center.dir.z, -1), 'center ray points straight down -z');
assert(approx(m.length(center.dir), 1), 'ray dir is normalized');
const right = m.rayFromScreen(800, 300, cam);
assert(right.dir.x > 0, 'a ray on the right side tilts +x');
const top = m.rayFromScreen(400, 0, cam);
assert(top.dir.y > 0, 'a ray at the top tilts +y (y is up)');

// ── Ray / sphere intersection ────────────────────────────────────────────────
const hit = m.intersectSphere(center.origin, center.dir, 1);
assert(hit && approx(hit.z, 1) && approx(hit.x, 0) && approx(hit.y, 0), 'center ray hits the front of the unit sphere at (0,0,1)');
// A ray pointing away from the sphere misses.
assert(m.intersectSphere({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 1 }, 1) === null, 'ray pointing away misses');
// A grazing/off-to-the-side ray misses.
assert(m.intersectSphere({ x: 0, y: 0, z: 3 }, m.normalize({ x: 1, y: 0, z: -0.1 }), 1) === null, 'a ray aimed past the sphere misses');
// Nearest (front) hit is returned, not the far side.
const frontHit = m.intersectSphere({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: -1 }, 1);
assert(frontHit.z > 0, 'the front-facing hit is returned');

// ── point ↔ UV (equirectangular) ─────────────────────────────────────────────
// North pole → v = 0; south pole → v = 1.
assert(approx(m.pointToUV(m.vec3(0, 1, 0)).v, 0), 'north pole maps to v=0');
assert(approx(m.pointToUV(m.vec3(0, -1, 0)).v, 1), 'south pole maps to v=1');
// Equator is v = 0.5.
assert(approx(m.pointToUV(m.vec3(1, 0, 0)).v, 0.5), 'equator maps to v=0.5');
// +X (lon 0) → u = 0.5 in this convention; the seam wraps at 0/1.
assert(approx(m.pointToUV(m.vec3(1, 0, 0)).u, 0.5), '+x maps to u=0.5');
assert(m.pointToUV(m.vec3(0, 0, 1)).u >= 0 && m.pointToUV(m.vec3(0, 0, 1)).u <= 1, 'u stays in 0..1 (seam-safe)');
// pointToUV ∘ uvToPoint round-trips for interior points.
for (const [u, v] of [[0.25, 0.4], [0.7, 0.6], [0.1, 0.8]]) {
  const uv = m.pointToUV(m.uvToPoint(u, v));
  assert(approx(uv.u, u, 1e-9) && approx(uv.v, v, 1e-9), `uv→point→uv round-trips for (${u},${v})`);
}
// uvToPoint lands on the unit sphere.
assert(approx(m.length(m.uvToPoint(0.3, 0.55)), 1), 'uvToPoint is on the unit sphere');

// ── uvToPixel ────────────────────────────────────────────────────────────────
assert(JSON.stringify(m.uvToPixel(0, 0, 2048, 1024)) === JSON.stringify({ x: 0, y: 0 }), 'uv (0,0) → pixel (0,0)');
const midPx = m.uvToPixel(0.5, 0.5, 2048, 1024);
assert(midPx.x === 1024 && midPx.y === 512, 'uv (0.5,0.5) → center pixel');
assert(m.uvToPixel(1, 1, 2048, 1024).x === 0, 'u wraps at the seam (u=1 → x=0)');
assert(m.uvToPixel(0.5, 1, 2048, 1024).y === 1023, 'v is clamped to the last row');

// ── Full pipeline: screen → surface UV honors the orbit ───────────────────────
// Straight-on view (yaw=0,pitch=0): center click hits (0,0,1) → +z → its UV.
const noRot = m.screenToSurfaceUV(400, 300, cam, 0, 0);
assert(noRot && approx(noRot.u, m.pointToUV(m.vec3(0, 0, 1)).u) && approx(noRot.v, 0.5),
  'center click with no rotation maps to the +z texel on the equator');
// With a yaw applied, the same center click lands on a DIFFERENT surface texel
// (because we rotated the planet under the cursor).
const withYaw = m.screenToSurfaceUV(400, 300, cam, 1.0, 0);
assert(withYaw && !approx(withYaw.u, noRot.u), 'orbiting changes which surface texel the center maps to');
// A click that misses the globe returns null.
assert(m.screenToSurfaceUV(5, 5, cam, 0, 0) === null, 'a click off the globe returns null');
// The mapped texel is deterministic for the same inputs.
const a1 = m.screenToSurfaceUV(420, 320, cam, 0.6, 0.3);
const a2 = m.screenToSurfaceUV(420, 320, cam, 0.6, 0.3);
assert(JSON.stringify(a1) === JSON.stringify(a2), 'screenToSurfaceUV is deterministic');

// ── Palette ──────────────────────────────────────────────────────────────────
assert(m.PLANET_PALETTE.length >= 8, 'a useful planet palette');
assert(m.PLANET_PALETTE.every((p) => /^#[0-9a-f]{6}$/i.test(p.color) && p.id && p.label), 'palette entries are well-formed hex');
assert(new Set(m.PLANET_PALETTE.map((p) => p.id)).size === m.PLANET_PALETTE.length, 'palette ids are unique');

// ── clampDistance ─────────────────────────────────────────────────────────────
assert(m.clampDistance(0) === m.MIN_DISTANCE && m.clampDistance(999) === m.MAX_DISTANCE, 'distance clamps to zoom range');
assert(m.clampDistance(3) === 3, 'valid distance passes through');

// ── Planet serialization ───────────────────────────────────────────────────────
const dp = m.defaultPlanet();
assert(dp.schemaVersion === m.PLANET_SCHEMA_VERSION && dp.textureDataUrl === null, 'default planet is blank');
assert(dp.texW >= 512 && dp.texH >= 256 && dp.texW === dp.texH * 2, 'default texture is 2:1 equirectangular');
assert(dp.view && Number.isFinite(dp.view.yaw) && Number.isFinite(dp.view.pitch), 'default planet has a view');
// normalize repairs junk.
assert(m.normalizePlanet(null).schemaVersion === m.PLANET_SCHEMA_VERSION, 'normalize(null) yields a valid planet');
const fixed = m.normalizePlanet({ base: 'evil"', texW: 999999, texH: 4, view: { yaw: 100, pitch: 100, distance: 999 } });
assert(fixed.base === dp.base, 'normalize rejects a bad base color');
assert(fixed.texW <= 4096 && fixed.texH >= 128, 'normalize clamps texture dims');
assert(Math.abs(fixed.view.pitch) <= m.MAX_PITCH && fixed.view.distance <= m.MAX_DISTANCE, 'normalize clamps the view');
// normalize keeps a valid texture data URL and rejects a non-image one.
assert(m.normalizePlanet({ textureDataUrl: 'data:image/png;base64,AAAA' }).textureDataUrl.startsWith('data:image/'), 'normalize keeps a valid texture data URL');
assert(m.normalizePlanet({ textureDataUrl: 'data:text/html,<script>' }).textureDataUrl === null, 'normalize rejects a non-image texture URL');

console.log(`\n${failed === 0 ? '✅' : '❌'} planet-engine tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
