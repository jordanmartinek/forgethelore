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
import { safeColor } from '../core/world-shapes.js';
import {
  PLANET_PALETTE, normalizePlanet,
  orbitMatrix, screenToSurfaceUV, uvToPixel,
  clampPitch, wrapYaw, clampDistance,
} from '../core/planet-engine.js';

const STORE_KEY = 'planetPainter';
// Vertical field of view shared by BOTH the render projection and the ray
// caster. They must match exactly or painted dabs drift from the cursor, so
// keep this as the single source of truth for the camera FOV.
const CAMERA_FOV = Math.PI / 4;

// ─── Module state ──────────────────────────────────────────────────────────
let planet = null;         // persisted planet state (view + texture)
let tool = 'orbit';        // 'orbit' | 'paint'
let activeColor = '#5f8f4f';
let brushSize = 60;        // paint dab radius in TEXTURE pixels

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
      h('div', {
        class: 'planet__pointer', id: 'planet-pointer',
        onpointerdown: onPointerDown,
        onpointermove: onPointerMove,
        onpointerup: onPointerUp,
        onpointerleave: onPointerUp,
        onwheel: onWheel,
      }),
      h('div', { class: 'planet__hint' },
        `🌐 ${tool === 'orbit' ? 'Drag to spin the planet' : 'Drag to paint'} · scroll to zoom · switch tools above`),
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
    ),
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
    h('div', { class: 'planet__actions' },
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Reset view', onclick: resetView }, '⤢'),
      h('button', { class: 'btn btn--sm btn--ghost', title: 'Clear planet', onclick: clearPlanet }, '🗑'),
      h('button', { class: 'btn btn--sm btn--primary', title: 'Export PNG (equirectangular map)', onclick: exportTexture }, '⬇ Export'),
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

function updateHint() {
  const hint = document.querySelector('.planet__hint');
  if (hint) hint.textContent = `🌐 ${tool === 'orbit' ? 'Drag to spin the planet' : 'Drag to paint'} · scroll to zoom · switch tools above`;
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
  gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
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
  // Right button or the Orbit tool → spin; otherwise paint.
  const mode = (tool === 'orbit' || e.button === 2) ? 'orbit' : 'paint';
  dragging = { mode, lastX: e.clientX, lastY: e.clientY };
  if (mode === 'paint') paintAt(p);
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
  } else {
    paintAt(p);
  }
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
  if (!confirm('Clear the planet back to a blank ocean?')) return;
  if (texCtx) {
    texCtx.fillStyle = safeColor(planet.base, '#2f6f9e');
    texCtx.fillRect(0, 0, texCanvas.width, texCanvas.height);
    textureDirty = true;
  }
  planet.textureDataUrl = null;
  save();
  toastInfo('Planet cleared.');
}

function exportTexture() {
  if (!texCanvas) return;
  texCanvas.toBlob((blob) => {
    if (!blob) { toastInfo('Export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loreforge-planet-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastSuccess('Exported the planet surface (equirectangular PNG).');
  }, 'image/png');
}
