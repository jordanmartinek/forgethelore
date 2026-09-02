/**
 * LoreForge Planner - 3D Planet Painter (WebGL UI)
 *
 * A blank planet you can orbit and paint on. The globe is a real WebGL sphere;
 * its surface is an equirectangular texture backed by an offscreen 2D canvas
 * that we paint into (soft dabs) and re-upload to the GPU. All the geometry math
 * — orbit rotation, ray/sphere intersection, screen→surface-UV mapping — lives
 * in the DOM-free core/planet-engine.js so it stays unit-testable; this module
 * owns only WebGL, pointer events, and persistence.
 *
 * No external 3D library (the app is zero-dependency, offline-first): the sphere
 * and shaders are hand-written GLSL. There is no framework teardown hook, so the
 * render loop self-terminates when its canvas leaves the DOM (the idiomatic
 * pattern in this codebase).
 */

import { h } from '../core/renderer.js';
import { loadData, persistState } from '../core/persist.js';
import { toastSuccess, toastInfo } from '../ui/toast.js';
import { safeColor, shapeMarkup } from '../core/world-shapes.js';
import {
  PLANET_PALETTE, normalizePlanet,
  orbitMatrix, screenToSurfaceUV, uvToPixel,
  clampPitch, wrapYaw, clampDistance,
  projectSurfacePoint,
} from '../core/planet-engine.js';

// A curated set of element stamps that read well on a planet, grouped for the
// palette. Reuses the world-shapes silhouette library. Each has a default tint.
const PLANET_STAMPS = [
  { group: 'Terrain', items: [
    { shape: 'mountain', label: 'Mountains', color: '#8a8178' },
    { shape: 'volcano', label: 'Volcano', color: '#a8785c' },
    { shape: 'hill', label: 'Hills', color: '#84a35a' },
    { shape: 'forest', label: 'Forest', color: '#356b3f' },
    { shape: 'pine_tree', label: 'Pines', color: '#2f6b45' },
    { shape: 'tree', label: 'Tree', color: '#3f7d4f' },
    { shape: 'cave', label: 'Cave', color: '#57534e' },
  ] },
  { group: 'Settlements', items: [
    { shape: 'metropolis', label: 'City', color: '#8a7a5a' },
    { shape: 'town', label: 'Town', color: '#8a7a5a' },
    { shape: 'village', label: 'Village', color: '#9c8a63' },
    { shape: 'castle', label: 'Castle', color: '#b0a080' },
    { shape: 'tower', label: 'Tower', color: '#b0a080' },
    { shape: 'temple', label: 'Temple', color: '#c8bda0' },
    { shape: 'ruins', label: 'Ruins', color: '#9a8f7a' },
  ] },
  { group: 'Sci-Fi', items: [
    { shape: 'space_station', label: 'Station', color: '#7fd0ff' },
    { shape: 'spaceship', label: 'Ship', color: '#cfe3ff' },
    { shape: 'satellite', label: 'Satellite', color: '#a5c4ff' },
    { shape: 'portal', label: 'Portal', color: '#c07fff' },
    { shape: 'beacon', label: 'Beacon', color: '#ffcf6a' },
    { shape: 'reactor_core', label: 'Reactor', color: '#7fd0c0' },
  ] },
  { group: 'Markers', items: [
    { shape: 'pin', label: 'Pin', color: '#e05a5a' },
    { shape: 'marker_star', label: 'Star', color: '#f5b73c' },
    { shape: 'marker_flag', label: 'Flag', color: '#e05a5a' },
    { shape: 'marker_danger', label: 'Danger', color: '#f5a623' },
    { shape: 'marker_target', label: 'Target', color: '#e05a5a' },
  ] },
];

/** Look up a stamp's default color from the catalog (falls back to sand). */
function stampColor(shape) {
  for (const g of PLANET_STAMPS) {
    const it = g.items.find((i) => i.shape === shape);
    if (it) return it.color;
  }
  return '#c9b58a';
}

const STORE_KEY = 'planetPainter';
// Vertical field of view shared by BOTH the render projection and the ray
// caster. They must match exactly or painted dabs drift from the cursor, so
// keep this as the single source of truth for the camera FOV.
const CAMERA_FOV = Math.PI / 4;

// ─── Module state ──────────────────────────────────────────────────────────
let planet = null;         // persisted planet state (view + texture)
let tool = 'orbit';        // 'orbit' | 'paint' | 'stamp' | 'erase'
let activeColor = '#5f8f4f';
let brushSize = 60;        // paint dab radius in TEXTURE pixels
let activeStamp = 'mountain';
let stampSize = 54;        // stamp billboard size in screen px (at the globe front)
const stampNodes = new Map(); // stamp id -> overlay DOM node (reused across frames)

let gl = null;             // WebGL context
let glProgram = null;      // compiled shader program
let glTexture = null;      // the surface texture on the GPU
let sphere = null;         // { position, uv, index, count } buffers
let uniforms = null;       // cached uniform locations
let texCanvas = null;      // offscreen 2D canvas holding the equirect texture
let texCtx = null;
let textureDirty = true;   // re-upload the texture next frame

let rafId = null;
let dragging = null;       // { mode:'orbit'|'paint', lastX, lastY }
let hostContainer = null;

// ─── Load / save ─────────────────────────────────────────────────────────────

function load() {
  planet = normalizePlanet(loadData(STORE_KEY, null));
  activeColor = activeColor || planet.base;
}

let _quotaWarned = false;
function save() {
  planet.updatedAt = Date.now();
  const ok = persistState(STORE_KEY, planet);
  // The whole planet is one large PNG data URL; if it exceeds localStorage
  // quota the write fails. Surface a planet-specific hint once so the user
  // knows their surface may not survive a reload (rather than only the global
  // save indicator flipping to "offline").
  if (ok === false && !_quotaWarned) {
    _quotaWarned = true;
    toastInfo('This planet is too large to auto-save (storage full). Export a PNG to keep it.');
  } else if (ok !== false) {
    _quotaWarned = false;
  }
}

let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; captureTexture(); save(); }, 500);
}

/** Snapshot the painted texture canvas into the planet state as a data URL. */
function captureTexture() {
  if (texCanvas) planet.textureDataUrl = texCanvas.toDataURL('image/png');
}

// ─── Render entry ─────────────────────────────────────────────────────────────

export function renderPlanetPainter(container) {
  if (!planet) load();
  hostContainer = container;
  const root = h('div', { class: 'planet' },
    renderToolbar(),
    h('div', { class: 'planet__stage', id: 'planet-stage' },
      h('canvas', { id: 'planet-canvas', class: 'planet__canvas' }),
      // Billboard overlay: element stamps are HTML nodes positioned each frame
      // over the globe. Behind the pointer layer so it doesn't eat events.
      h('div', { class: 'planet__overlay', id: 'planet-overlay' }),
      h('div', {
        class: 'planet__pointer', id: 'planet-pointer',
        onpointerdown: onPointerDown,
        onpointermove: onPointerMove,
        onpointerup: onPointerUp,
        onpointerleave: onPointerUp,
        onwheel: onWheel,
      }),
      h('div', { class: 'planet__hint' }, hintText()),
    ),
  );
  container.appendChild(root);
  // Defer GL setup until the canvas is laid out (sizing isn't final until it's
  // in the document), mirroring fantasy-map's deferred setupCanvases().
  requestAnimationFrame(() => { initGL(); startLoop(); });
}

// ─── Toolbar ───────────────────────────────────────────────────────────────

function renderToolbar() {
  return h('div', { class: 'planet__toolbar' },
    h('div', { class: 'planet__tools' },
      toolBtn('orbit', '🖐', 'Orbit · drag to spin'),
      toolBtn('paint', '🖌️', 'Paint · drag to paint the surface'),
      toolBtn('stamp', '🌲', 'Place elements · click the globe to drop the selected element'),
      toolBtn('erase', '🧽', 'Remove elements · click one to delete it'),
    ),
    // The context row swaps with the active tool.
    tool === 'stamp' ? stampBar() : paintBar(),
    h('div', { class: 'planet__actions' },
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Reset view', onclick: resetView }, '⤢'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Clear planet', onclick: clearPlanet }, '🗑'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Export the flat surface texture (equirectangular map, no elements)', onclick: exportSurfaceMap }, '🗺'),
      h('button', { class: 'btn btn--sm btn--primary', title: 'Export the planet view as a PNG (globe + placed elements)', onclick: exportTexture }, '⬇ Export'),
    ),
  );
}

/** Paint controls (swatches + brush) — shown for Orbit/Paint/Erase. */
function paintBar() {
  return h('div', { class: 'planet__ctxbar' },
    h('div', { class: 'planet__swatches' },
      ...PLANET_PALETTE.map((p) => h('button', {
        class: `planet__swatch ${activeColor === p.color ? 'planet__swatch--active' : ''}`,
        title: p.label,
        style: { background: safeColor(p.color, '#888') },
        onclick: () => { activeColor = p.color; tool = 'paint'; refreshToolbar(); },
      })),
      h('input', {
        type: 'color', class: 'planet__color', title: 'Custom color', value: activeColor,
        oninput: (e) => { activeColor = e.target.value; tool = 'paint'; refreshToolbar(); },
      }),
    ),
    h('label', { class: 'planet__brush', title: 'Brush size' },
      h('span', {}, '⚫'),
      h('input', {
        type: 'range', min: '8', max: '200', value: String(brushSize),
        oninput: (e) => { brushSize = Number(e.target.value); },
      }),
    ),
  );
}

/** Stamp controls (element picker + size) — shown for the Stamp tool. */
function stampBar() {
  return h('div', { class: 'planet__ctxbar' },
    h('div', { class: 'planet__stamp-grid' },
      ...PLANET_STAMPS.flatMap((g) => g.items).map((it) => h('button', {
        class: `planet__stamp-btn ${activeStamp === it.shape ? 'planet__stamp-btn--active' : ''}`,
        title: it.label,
        onclick: () => { activeStamp = it.shape; refreshToolbar(); },
        innerHTML: shapeMarkup(it.shape, 26, it.color),
      })),
    ),
    h('label', { class: 'planet__brush', title: 'Element size' },
      h('span', {}, '⬍'),
      h('input', {
        type: 'range', min: '20', max: '140', value: String(stampSize),
        oninput: (e) => { stampSize = Number(e.target.value); },
      }),
    ),
  );
}

function toolBtn(id, icon, label) {
  return h('button', {
    class: `planet__tool ${tool === id ? 'planet__tool--active' : ''}`,
    title: label, dataset: { tool: id },
    onclick: () => { tool = id; refreshToolbar(); updateHint(); },
  }, icon);
}

function refreshToolbar() {
  const bar = hostContainer && hostContainer.querySelector('.planet__toolbar');
  if (bar) { const fresh = renderToolbar(); bar.replaceWith(fresh); }
  updateHint();
}

function hintText() {
  const verb = tool === 'orbit' ? 'Drag to spin the planet'
    : tool === 'paint' ? 'Drag to paint the surface'
      : tool === 'stamp' ? 'Click the globe to place the selected element'
        : 'Click an element to remove it';
  return `🌐 ${verb} · scroll to zoom · right-drag always spins`;
}

function updateHint() {
  const hint = document.querySelector('.planet__hint');
  if (hint) hint.textContent = hintText();
}

// ─── WebGL setup ─────────────────────────────────────────────────────────────

const VERT_SRC = `
  attribute vec3 aPos;
  attribute vec2 aUV;
  uniform mat4 uModel;
  uniform mat4 uProj;
  varying vec2 vUV;
  varying vec3 vNormal;
  void main() {
    vUV = aUV;
    vNormal = mat3(uModel) * aPos; // unit sphere: position == normal
    vec4 world = uModel * vec4(aPos, 1.0);
    world.z -= uDistance;          // pull the camera back (see uDistance)
    gl_Position = uProj * world;
  }
`;

// NOTE: uDistance is declared via string injection below so the vertex shader
// can offset in view space without a separate view matrix (keeps it tiny).
const VERT_HEADER = 'uniform float uDistance;\n';

const FRAG_SRC = `
  precision mediump float;
  varying vec2 vUV;
  varying vec3 vNormal;
  uniform sampler2D uTex;
  void main() {
    vec3 base = texture2D(uTex, vUV).rgb;
    // Simple directional light for a 3D read; ambient keeps the dark side visible.
    vec3 L = normalize(vec3(0.5, 0.7, 0.8));
    float diff = max(dot(normalize(vNormal), L), 0.0);
    float shade = 0.45 + 0.55 * diff;
    // A soft rim so the silhouette reads against a dark background.
    gl_FragColor = vec4(base * shade, 1.0);
  }
`;

function compile(glc, type, src) {
  const s = glc.createShader(type);
  glc.shaderSource(s, src);
  glc.compileShader(s);
  if (!glc.getShaderParameter(s, glc.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + glc.getShaderInfoLog(s));
  }
  return s;
}

function initGL() {
  const canvas = document.getElementById('planet-canvas');
  if (!canvas) return;
  sizeCanvas(canvas);
  // preserveDrawingBuffer lets us read the rendered globe back for the "view"
  // export (globe + stamps as seen), which a default WebGL context clears.
  const glOpts = { preserveDrawingBuffer: true, antialias: true };
  gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts);
  if (!gl) { toastInfo('Your browser could not start WebGL for the 3D planet.'); return; }

  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_HEADER + VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    glProgram = gl.createProgram();
    gl.attachShader(glProgram, vs);
    gl.attachShader(glProgram, fs);
    gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(glProgram));
    }
  } catch (_err) {
    toastInfo('3D planet shader failed to build.');
    return;
  }

  sphere = buildSphere(64, 96);
  uploadSphere(sphere);
  uniforms = {
    uModel: gl.getUniformLocation(glProgram, 'uModel'),
    uProj: gl.getUniformLocation(glProgram, 'uProj'),
    uDistance: gl.getUniformLocation(glProgram, 'uDistance'),
    uTex: gl.getUniformLocation(glProgram, 'uTex'),
    aPos: gl.getAttribLocation(glProgram, 'aPos'),
    aUV: gl.getAttribLocation(glProgram, 'aUV'),
  };

  initTextureCanvas();
  gl.clearColor(0.04, 0.05, 0.08, 1);
  gl.enable(gl.DEPTH_TEST);
}

/** Size the drawing buffer to the CSS box (with devicePixelRatio) for crispness. */
function sizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round((rect.width || 640) * dpr));
  const hgt = Math.max(1, Math.round((rect.height || 480) * dpr));
  if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
}

/** Procedural UV sphere: latitude/longitude grid of positions + equirect UVs. */
function buildSphere(latBands, lonBands) {
  const position = [];
  const uv = [];
  const index = [];
  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat / latBands) * Math.PI;   // 0..π (north→south)
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon / lonBands) * 2 * Math.PI - Math.PI; // -π..π
      const sp = Math.sin(phi), cp = Math.cos(phi);
      // Match pointToUV: y = cos(theta) (north pole +Y), x = sinθ cosφ, z = sinθ sinφ.
      position.push(st * cp, ct, st * sp);
      // Equirect UV consistent with the engine (u wraps, v=0 at north pole).
      uv.push(lon / lonBands, lat / latBands);
    }
  }
  const stride = lonBands + 1;
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const a = lat * stride + lon;
      const b = a + stride;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { position, uv, index, count: index.length };
}

function uploadSphere(s) {
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(s.position), gl.STATIC_DRAW);
  s._posBuf = posBuf;

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(s.uv), gl.STATIC_DRAW);
  s._uvBuf = uvBuf;

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(s.index), gl.STATIC_DRAW);
  s._idxBuf = idxBuf;
}

// ─── Surface texture (offscreen 2D canvas) ───────────────────────────────────

function initTextureCanvas() {
  texCanvas = document.createElement('canvas');
  texCanvas.width = planet.texW;
  texCanvas.height = planet.texH;
  texCtx = texCanvas.getContext('2d');
  // Fill with the base color, then restore any saved painting.
  texCtx.fillStyle = safeColor(planet.base, '#2f6f9e');
  texCtx.fillRect(0, 0, texCanvas.width, texCanvas.height);

  glTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  if (planet.textureDataUrl) {
    const img = new Image();
    img.onload = () => { texCtx.drawImage(img, 0, 0, texCanvas.width, texCanvas.height); textureDirty = true; };
    img.src = planet.textureDataUrl;
  }
  textureDirty = true;
}

function uploadTexture() {
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas);
  textureDirty = false;
}

/**
 * Paint a soft radial dab at a UV position on the texture canvas. Wraps across
 * the u=0/1 seam so a stroke near the edge doesn't leave a gap.
 */
function paintDab(u, v) {
  const { x, y } = uvToPixel(u, v, texCanvas.width, texCanvas.height);
  dabAt(x, y);
  // Wrap: draw a second dab on the opposite edge when near the seam.
  if (x < brushSize) dabAt(x + texCanvas.width, y);
  else if (x > texCanvas.width - brushSize) dabAt(x - texCanvas.width, y);
  textureDirty = true;
}

function dabAt(cx, cy) {
  const r = brushSize;
  const col = safeColor(activeColor, '#5f8f4f');
  const g = texCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, col);
  g.addColorStop(0.7, col);
  g.addColorStop(1, hexWithAlpha(col, 0));
  texCtx.fillStyle = g;
  texCtx.beginPath();
  texCtx.arc(cx, cy, r, 0, Math.PI * 2);
  texCtx.fill();
}

/** Return an rgba() string for a hex color with the given alpha (0..1). */
function hexWithAlpha(hex, a) {
  const c = hex.replace('#', '');
  const n = c.length === 3
    ? c.split('').map((ch) => parseInt(ch + ch, 16))
    : [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
}

// ─── Render loop ─────────────────────────────────────────────────────────────

function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  const frame = () => {
    const canvas = document.getElementById('planet-canvas');
    // Self-teardown: if our canvas left the DOM (mode switch), stop the loop and
    // drop the GL context. There is no framework unmount hook to do this for us.
    if (!canvas) { teardown(); return; }
    rafId = requestAnimationFrame(frame);
    if (!gl || !glProgram) return;
    drawScene(canvas);
    renderStampsOverlay(canvas);
  };
  rafId = requestAnimationFrame(frame);
}

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  // A drag that ended just before the mode switch may have a debounced save
  // pending; cancel it so it can't fire against torn-down state.
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  // Delete GL objects explicitly so cleanup doesn't depend on the optional
  // WEBGL_lose_context extension being present.
  if (gl) {
    try {
      if (sphere) { gl.deleteBuffer(sphere._posBuf); gl.deleteBuffer(sphere._uvBuf); gl.deleteBuffer(sphere._idxBuf); }
      if (glTexture) gl.deleteTexture(glTexture);
      if (glProgram) gl.deleteProgram(glProgram);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (_) { /* ignore */ }
  }
  gl = null; glProgram = null; glTexture = null; sphere = null;
  dragging = null; hostContainer = null;
  stampNodes.clear();
  _overlaySig = ''; // force a fresh overlay layout on the next mount
}

// ─── Element stamps (billboard overlay) ──────────────────────────────────────

/**
 * Position every stamp over the globe each frame. Each stamp is stored at a
 * fixed surface UV; we project it through the current orbit so it tracks the
 * spinning planet, scale it by the perspective factor, hide it when it rotates
 * to the far hemisphere, and set z-index by depth so nearer stamps sit on top.
 */
let _overlaySig = '';
function renderStampsOverlay(canvas) {
  const overlay = document.getElementById('planet-overlay');
  if (!overlay) return;
  // Skip the whole pass when nothing that affects billboard layout changed
  // (view + stamp set + canvas size). Keeps idle frames free even with many stamps.
  const sig = `${planet.view.yaw.toFixed(4)}|${planet.view.pitch.toFixed(4)}|${planet.view.distance.toFixed(4)}|${canvas.width}x${canvas.height}|${planet.stamps.map((s) => s.id + s.size).join(',')}`;
  if (sig === _overlaySig) return;
  _overlaySig = sig;
  const rect = canvas.getBoundingClientRect();
  const cam = { width: rect.width, height: rect.height, fov: CAMERA_FOV, distance: planet.view.distance };
  const live = new Set();

  for (const s of planet.stamps) {
    live.add(s.id);
    let node = stampNodes.get(s.id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'planet__stamp';
      node.innerHTML = shapeMarkup(s.shape, 100, safeColor(s.color, '#c9b58a'));
      overlay.appendChild(node);
      stampNodes.set(s.id, node);
    }
    const pr = projectSurfacePoint(s.u, s.v, cam, planet.view.yaw, planet.view.pitch);
    if (!pr.visible) { node.style.display = 'none'; continue; }
    const px = s.size * pr.scale;
    node.style.display = 'block';
    node.style.width = `${px}px`;
    node.style.height = `${px}px`;
    // Anchor the stamp's BOTTOM-center on the surface point so it "stands" on it.
    node.style.transform = `translate(${pr.x - px / 2}px, ${pr.y - px}px)`;
    node.style.zIndex = String(1000 - Math.round(pr.depth * 100));
    node.style.opacity = String(0.35 + 0.65 * Math.min(1, pr.scale)); // fade tiny/edge ones slightly
  }

  // Drop DOM nodes for stamps that no longer exist.
  for (const [id, node] of stampNodes) {
    if (!live.has(id)) { node.remove(); stampNodes.delete(id); }
  }
}

/** Place the active element stamp at the surface point under the cursor. */
function placeStampAt(p) {
  const uv = screenToSurfaceUV(p.x, p.y, camFromCanvas(), planet.view.yaw, planet.view.pitch);
  if (!uv) return;
  planet.stamps.push({
    id: `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    shape: activeStamp,
    color: stampColor(activeStamp),
    size: stampSize,
    u: uv.u,
    v: uv.v,
  });
  scheduleSave();
}

/**
 * Remove the visible stamp nearest to the cursor (within a small radius).
 * Only front-facing stamps are candidates so you can't delete one hidden on the
 * back of the globe.
 */
function eraseStampAt(p) {
  const canvas = document.getElementById('planet-canvas');
  const rect = canvas.getBoundingClientRect();
  const cam = { width: rect.width, height: rect.height, fov: CAMERA_FOV, distance: planet.view.distance };
  let best = -1; let bestD = 30 * 30; // 30px pick radius (squared)
  planet.stamps.forEach((s, i) => {
    const pr = projectSurfacePoint(s.u, s.v, cam, planet.view.yaw, planet.view.pitch);
    if (!pr.visible) return;
    const dx = pr.x - p.x, dy = pr.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0) {
    const [removed] = planet.stamps.splice(best, 1);
    const node = stampNodes.get(removed.id);
    if (node) { node.remove(); stampNodes.delete(removed.id); }
    scheduleSave();
  }
}

function drawScene(canvas) {
  sizeCanvas(canvas);
  const W = canvas.width, H = canvas.height;
  gl.viewport(0, 0, W, H);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (textureDirty) uploadTexture();

  gl.useProgram(glProgram);

  // Model matrix = orbit rotation (row-major 3×3 → column-major mat4).
  const R = orbitMatrix(planet.view.yaw, planet.view.pitch);
  gl.uniformMatrix4fv(uniforms.uModel, false, mat3ToMat4ColMajor(R));
  gl.uniformMatrix4fv(uniforms.uProj, false, perspective(CAMERA_FOV, W / H, 0.1, 100));
  gl.uniform1f(uniforms.uDistance, planet.view.distance);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.uniform1i(uniforms.uTex, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, sphere._posBuf);
  gl.enableVertexAttribArray(uniforms.aPos);
  gl.vertexAttribPointer(uniforms.aPos, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, sphere._uvBuf);
  gl.enableVertexAttribArray(uniforms.aUV);
  gl.vertexAttribPointer(uniforms.aUV, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere._idxBuf);
  gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
}

/** A row-major 3×3 rotation → column-major 4×4 (for uniformMatrix4fv). */
function mat3ToMat4ColMajor(m) {
  return new Float32Array([
    m[0], m[3], m[6], 0,
    m[1], m[4], m[7], 0,
    m[2], m[5], m[8], 0,
    0, 0, 0, 1,
  ]);
}

/** Column-major perspective projection matrix. */
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

// ─── Interaction ─────────────────────────────────────────────────────────────

function camFromCanvas() {
  const canvas = document.getElementById('planet-canvas');
  const rect = canvas ? canvas.getBoundingClientRect() : { width: 640, height: 480 };
  return { width: rect.width, height: rect.height, fov: CAMERA_FOV, distance: planet.view.distance };
}

/** Pointer position relative to the canvas CSS box. */
function localXY(e) {
  const canvas = document.getElementById('planet-canvas');
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onPointerDown(e) {
  e.preventDefault();
  document.getElementById('planet-pointer').setPointerCapture?.(e.pointerId);
  const p = localXY(e);
  // Right button always spins. Otherwise the active tool decides.
  const mode = (e.button === 2) ? 'orbit' : (tool === 'orbit' ? 'orbit' : tool);
  dragging = { mode, lastX: e.clientX, lastY: e.clientY };
  if (mode === 'paint') paintAt(p);
  else if (mode === 'stamp') placeStampAt(p);
  else if (mode === 'erase') eraseStampAt(p);
}

function onPointerMove(e) {
  if (!dragging) return;
  const p = localXY(e);
  if (dragging.mode === 'orbit') {
    const dx = e.clientX - dragging.lastX;
    const dy = e.clientY - dragging.lastY;
    dragging.lastX = e.clientX; dragging.lastY = e.clientY;
    planet.view.yaw = wrapYaw(planet.view.yaw - dx * 0.008);
    planet.view.pitch = clampPitch(planet.view.pitch + dy * 0.008);
  } else if (dragging.mode === 'paint') {
    paintAt(p);
  } else if (dragging.mode === 'erase') {
    eraseStampAt(p);
  }
  // 'stamp' places once on pointerdown (dragging it would spray dozens).
}

function onPointerUp() {
  if (dragging) { dragging = null; scheduleSave(); }
}

function onWheel(e) {
  e.preventDefault();
  const step = 1 + Math.min(Math.abs(e.deltaY), 60) / 60 * 0.18;
  planet.view.distance = clampDistance(planet.view.distance * (e.deltaY < 0 ? 1 / step : step));
  scheduleSave();
}

/** Raycast a screen point onto the globe and paint the surface texel it hits. */
function paintAt(p) {
  const uv = screenToSurfaceUV(p.x, p.y, camFromCanvas(), planet.view.yaw, planet.view.pitch);
  if (uv) paintDab(uv.u, uv.v);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function resetView() {
  planet.view = { yaw: 0.6, pitch: 0.3, distance: 3 };
  scheduleSave();
}

function clearPlanet() {
  if (!confirm('Clear the planet back to a blank ocean (removes painting AND placed elements)?')) return;
  if (texCtx) {
    texCtx.fillStyle = safeColor(planet.base, '#2f6f9e');
    texCtx.fillRect(0, 0, texCanvas.width, texCanvas.height);
    textureDirty = true;
  }
  planet.textureDataUrl = null;
  planet.stamps = [];
  for (const [, node] of stampNodes) node.remove();
  stampNodes.clear();
  save();
  toastInfo('Planet cleared.');
}

function downloadCanvas(canvas, name, message) {
  canvas.toBlob((blob) => {
    if (!blob) { toastInfo('Export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastSuccess(message);
  }, 'image/png');
}

/**
 * Export the current 3D VIEW (the globe with placed elements, exactly as seen).
 * Composites the rendered WebGL frame with the element billboards drawn on top
 * so nothing the user placed is silently dropped — the previous surface-only
 * export omitted stamps entirely.
 */
function exportTexture() {
  const canvas = document.getElementById('planet-canvas');
  if (!canvas || !gl) return;
  // Force one fresh render so the preserved buffer is current, then read it.
  drawScene(canvas);
  const W = canvas.width, H = canvas.height;      // device pixels
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  octx.drawImage(canvas, 0, 0);

  // Draw the visible stamps on top, at the same device-pixel scale as the canvas.
  const rect = canvas.getBoundingClientRect();
  const dpr = rect.width > 0 ? W / rect.width : 1;
  const cam = { width: rect.width, height: rect.height, fov: CAMERA_FOV, distance: planet.view.distance };
  const visible = planet.stamps
    .map((s) => ({ s, pr: projectSurfacePoint(s.u, s.v, cam, planet.view.yaw, planet.view.pitch) }))
    .filter((e) => e.pr.visible)
    .sort((a, b) => b.pr.depth - a.pr.depth); // far → near so nearer draw on top

  let pending = visible.length;
  const finish = () => downloadCanvas(out, `loreforge-planet-${Date.now()}.png`, 'Exported the planet view (globe + elements).');
  if (pending === 0) { finish(); return; }
  visible.forEach(({ s, pr }) => {
    const img = new Image();
    const px = s.size * pr.scale * dpr;
    img.onload = () => {
      octx.drawImage(img, (pr.x * dpr) - px / 2, (pr.y * dpr) - px, px, px); // bottom-center anchor
      if (--pending === 0) finish();
    };
    img.onerror = () => { if (--pending === 0) finish(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(shapeMarkup(s.shape, 100, safeColor(s.color, '#c9b58a')));
  });
}

/** Export the flat painted surface as an equirectangular texture map (no elements). */
function exportSurfaceMap() {
  if (!texCanvas) return;
  captureTexture();
  downloadCanvas(texCanvas, `loreforge-planet-surface-${Date.now()}.png`, 'Exported the surface texture (equirectangular map).');
}
