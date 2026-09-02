/**
 * LoreForge Planner - 3D Planet Painter Engine (core, DOM-free)
 *
 * The pure math behind the "3D Planet" mode: a unit sphere you orbit and paint
 * on. No WebGL, no DOM — just vectors, matrices, ray/sphere intersection, and
 * the equirectangular UV mapping that ties a screen click to a texel on the
 * planet's surface texture. The UI layer (modules/planet-painter.js) owns the
 * WebGL rendering and pointer events and calls into these helpers so the tricky
 * geometry stays unit-testable.
 *
 * Camera model (kept deliberately simple):
 *   - The sphere is a unit sphere (radius 1) centered at the origin in VIEW
 *     space; the camera sits at (0,0,distance) looking toward -Z with a simple
 *     perspective (field of view `fov`).
 *   - "Orbiting" the planet is modeled as ROTATING THE SPHERE by R(yaw,pitch).
 *     The WebGL model matrix is exactly this rotation. To find which point of
 *     the planet's own surface a screen ray hits, we intersect the ray with the
 *     unit sphere in view space, then apply R⁻¹ (= Rᵀ) to bring the hit point
 *     into the sphere's local/model frame, and map THAT to UV.
 *   - Equirectangular UV: longitude → u (0..1 wrapping), latitude → v (0..1,
 *     v=0 at the north pole). This matches the texture the shader samples.
 */

/* ─── Small vector/matrix helpers (column-major 3×3 where noted) ───────────── */

export function vec3(x, y, z) { return { x, y, z }; }

export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

export function length(a) { return Math.hypot(a.x, a.y, a.z); }

export function normalize(a) {
  const L = length(a) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}

export function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }

export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

export function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

/* ─── Orbit rotation ───────────────────────────────────────────────────────── */

/** Pitch is clamped just shy of the poles so the view can't flip over. */
export const MAX_PITCH = Math.PI / 2 - 0.001;

export function clampPitch(pitch) {
  const p = Number.isFinite(pitch) ? pitch : 0;
  return clamp(p, -MAX_PITCH, MAX_PITCH);
}

/** Wrap yaw into [-π, π] so it stays bounded during endless dragging. */
export function wrapYaw(yaw) {
  const y = Number.isFinite(yaw) ? yaw : 0;
  const t = ((y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return t - Math.PI;
}

/**
 * Build the sphere rotation matrix from yaw (about the world Y axis) then pitch
 * (about the world X axis): R = Rx(pitch) · Ry(yaw). Returned as a length-9
 * array in ROW-major order (m[row*3 + col]) so it's easy to reason about; the
 * WebGL layer transposes into a mat4 as needed.
 */
export function orbitMatrix(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  // Ry(yaw):            Rx(pitch):
  //  [ cy 0 sy]          [1  0   0 ]
  //  [ 0  1 0 ]          [0 cx -sx ]
  //  [-sy 0 cy]          [0 sx  cx ]
  // R = Rx · Ry
  return [
    cy, 0, sy,
    sx * sy, cx, -sx * cy,
    -cx * sy, sx, cx * cy,
  ];
}

/** Multiply a row-major 3×3 matrix by a vector: m·v. */
export function applyMat3(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

/** Transpose (= inverse for a rotation) of a row-major 3×3 matrix. */
export function transpose3(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/* ─── Screen → ray ─────────────────────────────────────────────────────────── */

/**
 * Build a view-space ray from a screen pixel. The camera is at (0,0,distance)
 * looking down -Z; the image plane uses a vertical field of view `fov`. Returns
 * `{ origin, dir }` with `dir` normalized.
 * @param {number} px    Pixel x (0..width).
 * @param {number} py    Pixel y (0..height, top-down).
 * @param {{width:number,height:number,fov:number,distance:number}} cam
 */
export function rayFromScreen(px, py, cam) {
  const w = cam.width > 0 ? cam.width : 1;
  const h = cam.height > 0 ? cam.height : 1;
  const fov = cam.fov || (Math.PI / 4);
  const aspect = w / h;
  // Normalized device coords (-1..1), y up.
  const ndcX = (px / w) * 2 - 1;
  const ndcY = 1 - (py / h) * 2;
  const tanF = Math.tan(fov / 2);
  const origin = { x: 0, y: 0, z: cam.distance || 3 };
  const dir = normalize({ x: ndcX * tanF * aspect, y: ndcY * tanF, z: -1 });
  return { origin, dir };
}

/* ─── Ray / sphere intersection ────────────────────────────────────────────── */

/**
 * Intersect a ray with a sphere centered at the origin of the given radius.
 * Returns the NEAREST forward hit point (the front face) or null if it misses.
 * @param {{x,y,z}} origin
 * @param {{x,y,z}} dir     Should be normalized.
 * @param {number} [radius]
 */
export function intersectSphere(origin, dir, radius = 1) {
  // |origin + t·dir|² = r²  →  t² + 2·(o·d) t + (o·o − r²) = 0 (dir normalized).
  const b = 2 * dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2;
  const t2 = (-b + sq) / 2;
  const t = t1 >= 0 ? t1 : (t2 >= 0 ? t2 : -1);
  if (t < 0) return null;
  return add(origin, scale(dir, t));
}

/* ─── Sphere point ↔ equirectangular UV ────────────────────────────────────── */

/**
 * Map a point on the unit sphere (in the sphere's LOCAL frame) to equirect UV.
 *   u = longitude mapped to 0..1 (wraps), v = latitude mapped to 0..1 with
 *   v=0 at the north pole (+Y) and v=1 at the south pole (−Y).
 * @param {{x,y,z}} p  Point on (or near) the unit sphere.
 * @returns {{u:number,v:number}}
 */
export function pointToUV(p) {
  const n = normalize(p);
  const lon = Math.atan2(n.z, n.x);        // −π..π
  const lat = Math.asin(clamp(n.y, -1, 1)); // −π/2..π/2
  const u = (lon / (2 * Math.PI)) + 0.5;    // 0..1
  const v = 0.5 - (lat / Math.PI);          // 0 at north pole, 1 at south pole
  return { u: ((u % 1) + 1) % 1, v: clamp(v, 0, 1) };
}

/** Inverse of pointToUV: equirect UV → unit sphere point (local frame). */
export function uvToPoint(u, v) {
  const lon = (u - 0.5) * 2 * Math.PI;
  const lat = (0.5 - v) * Math.PI;
  const cy = Math.cos(lat);
  return { x: cy * Math.cos(lon), y: Math.sin(lat), z: cy * Math.sin(lon) };
}

/** Convert UV (0..1) to integer texture pixel coords for a texW×texH canvas. */
export function uvToPixel(u, v, texW, texH) {
  const x = Math.round((((u % 1) + 1) % 1) * texW) % texW;
  const y = clamp(Math.round(v * texH), 0, texH - 1);
  return { x, y };
}

/**
 * Full pipeline: from a screen pixel to the UV on the planet's surface texture,
 * honoring the current orbit. Returns null if the click misses the globe.
 * @param {number} px
 * @param {number} py
 * @param {{width,height,fov,distance}} cam
 * @param {number} yaw
 * @param {number} pitch
 * @returns {{u:number,v:number}|null}
 */
export function screenToSurfaceUV(px, py, cam, yaw, pitch) {
  const { origin, dir } = rayFromScreen(px, py, cam);
  const hit = intersectSphere(origin, dir, 1);
  if (!hit) return null;
  // The sphere is rendered with model matrix R(yaw,pitch); to get the point in
  // the sphere's own texture frame, undo that rotation (Rᵀ).
  const local = applyMat3(transpose3(orbitMatrix(yaw, pitch)), hit);
  return pointToUV(local);
}

/**
 * Project a point on the planet's SURFACE (given as its equirectangular UV) to
 * screen pixels, honoring the current orbit + perspective. This is the inverse
 * direction of screenToSurfaceUV and is used to billboard element stamps onto
 * the globe: a stamp is stored at a fixed surface UV and re-projected every
 * frame so it rotates with the planet and hides when it swings to the far side.
 *
 * @param {number} u
 * @param {number} v
 * @param {{width:number,height:number,fov:number,distance:number}} cam
 * @param {number} yaw
 * @param {number} pitch
 * @returns {{x:number,y:number,visible:boolean,scale:number,depth:number}}
 *   x,y are screen pixels; visible is false when the point faces AWAY from the
 *   camera (back hemisphere); scale is a relative size factor for perspective;
 *   depth is view-space distance from the camera (smaller = nearer/in front).
 */
export function projectSurfacePoint(u, v, cam, yaw, pitch) {
  const w = cam.width > 0 ? cam.width : 1;
  const hgt = cam.height > 0 ? cam.height : 1;
  const fov = cam.fov || (Math.PI / 4);
  const distance = cam.distance || 3;
  const aspect = w / hgt;

  // Local surface point → rotate by the orbit model matrix → view space.
  const world = applyMat3(orbitMatrix(yaw, pitch), uvToPoint(u, v));
  // Camera sits at (0,0,distance) looking down −Z; the vertex path offsets z by
  // −distance, so a view-space point is (world.x, world.y, world.z − distance).
  const vz = world.z - distance;              // negative in front of the camera
  const camDist = distance - world.z;         // positive distance camera→point

  // Front hemisphere test: the point's outward normal (== its position on the
  // unit sphere) must face the camera. The camera direction from the point is
  // (0,0,distance) − world; visible when their dot product is positive.
  const toCam = { x: -world.x, y: -world.y, z: distance - world.z };
  const visible = dot(world, toCam) > 0;

  // Perspective projection to NDC then to pixels (matches the render matrix).
  const f = 1 / Math.tan(fov / 2);
  const ndcX = (world.x * (f / aspect)) / -vz;  // divide by −vz (positive)
  const ndcY = (world.y * f) / -vz;
  const x = (ndcX * 0.5 + 0.5) * w;
  const y = (1 - (ndcY * 0.5 + 0.5)) * hgt;

  // Relative size: a unit-height object at the sphere front scales ~ f/(−vz).
  const scale = f / Math.max(0.001, -vz);

  return { x, y, visible, scale, depth: camDist };
}

/* ─── Paint palette ────────────────────────────────────────────────────────── */

/** Default palette for painting a planet surface. */
export const PLANET_PALETTE = [
  { id: 'ocean', label: 'Ocean', color: '#2f6f9e' },
  { id: 'shallows', label: 'Shallows', color: '#4fa3c0' },
  { id: 'land', label: 'Land', color: '#5f8f4f' },
  { id: 'forest', label: 'Forest', color: '#356b3f' },
  { id: 'desert', label: 'Desert', color: '#cba15a' },
  { id: 'mountain', label: 'Mountain', color: '#8a7f72' },
  { id: 'ice', label: 'Ice / Snow', color: '#e8f0f6' },
  { id: 'lava', label: 'Lava', color: '#d4562a' },
  { id: 'toxic', label: 'Toxic', color: '#7fae3a' },
  { id: 'city', label: 'City lights', color: '#ffd27f' },
];

/* ─── Planet state (serialization) ─────────────────────────────────────────── */

export const PLANET_SCHEMA_VERSION = 1;

/** A blank planet: an ocean base, a neutral view, a chosen texture resolution. */
export function defaultPlanet() {
  return {
    schemaVersion: PLANET_SCHEMA_VERSION,
    base: '#2f6f9e',        // starting ocean fill for the texture
    texW: 2048,
    texH: 1024,
    textureDataUrl: null,   // painted equirect texture (PNG data URL)
    stamps: [],             // [{ id, shape, color, size, u, v }] surface billboards
    view: { yaw: 0.6, pitch: 0.3, distance: 3 },
    updatedAt: Date.now(),
  };
}

/** Coerce/validate the stamps array so bad or partial entries can't break rendering. */
export function normalizeStamps(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.shape !== 'string' || !s.shape) continue;
    const u = Number.isFinite(s.u) ? ((s.u % 1) + 1) % 1 : null;
    const v = Number.isFinite(s.v) ? clamp(s.v, 0, 1) : null;
    if (u === null || v === null) continue;
    out.push({
      id: typeof s.id === 'string' && s.id ? s.id : `ps_${Math.random().toString(36).slice(2, 9)}`,
      shape: s.shape,
      color: /^#[0-9a-fA-F]{3,8}$/.test(s.color) ? s.color : '#c9b58a',
      size: Number.isFinite(s.size) ? clamp(s.size, 12, 200) : 48,
      u,
      v,
    });
  }
  return out;
}

/** Normalize/upgrade a loaded planet so partial or old data is safe to use. */
export function normalizePlanet(raw) {
  if (!raw || typeof raw !== 'object') return defaultPlanet();
  const base = defaultPlanet();
  const view = raw.view && typeof raw.view === 'object' ? raw.view : {};
  return {
    ...base,
    ...raw,
    schemaVersion: PLANET_SCHEMA_VERSION,
    base: /^#[0-9a-fA-F]{3,8}$/.test(raw.base) ? raw.base : base.base,
    texW: Number.isFinite(raw.texW) && raw.texW >= 256 ? Math.min(4096, raw.texW | 0) : base.texW,
    texH: Number.isFinite(raw.texH) && raw.texH >= 128 ? Math.min(2048, raw.texH | 0) : base.texH,
    textureDataUrl: typeof raw.textureDataUrl === 'string' && /^data:image\//i.test(raw.textureDataUrl)
      ? raw.textureDataUrl : null,
    stamps: normalizeStamps(raw.stamps),
    view: {
      yaw: wrapYaw(view.yaw),
      pitch: clampPitch(view.pitch),
      distance: clamp(Number.isFinite(view.distance) ? view.distance : 3, 1.4, 8),
    },
  };
}

/** Clamp a camera distance into the allowed zoom range. */
export const MIN_DISTANCE = 1.4;
export const MAX_DISTANCE = 8;
export function clampDistance(d) {
  return clamp(Number.isFinite(d) ? d : 3, MIN_DISTANCE, MAX_DISTANCE);
}
