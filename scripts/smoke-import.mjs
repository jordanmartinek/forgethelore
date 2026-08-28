/**
 * Import smoke test — validates the ES module graph resolves and evaluates
 * without a real browser. Stubs the browser globals modules touch at import
 * time (localStorage, document, window, indexedDB). This catches broken import
 * paths, missing/renamed exports, and circular-import eval failures.
 *
 * Run: NODE_OPTIONS= node scripts/smoke-import.mjs
 */

// ── Minimal browser global stubs ────────────────────────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};

const noop = () => {};
function makeEl() {
  return new Proxy({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [], childNodes: [],
    appendChild: (c) => c, removeChild: noop, remove: noop, insertBefore: (c) => c,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [],
    focus: noop, click: noop, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
    setAttributeNS: noop, appendChild2: noop,
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return null;
      return undefined;
    },
    set(target, prop, val) { target[prop] = val; return true; },
  });
}

globalThis.document = {
  createElement: makeEl,
  createElementNS: makeEl,
  createDocumentFragment: makeEl,
  createTextNode: (t) => ({ textContent: t }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  body: makeEl(),
  documentElement: makeEl(),
  readyState: 'complete',
  get activeElement() { return null; },
};

globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { register: () => Promise.reject(new Error('no sw in node')) } },
    configurable: true, writable: true,
  });
} catch (_) { /* navigator already defined & non-configurable — fine */ }
globalThis.indexedDB = { open: () => ({ addEventListener: noop, onupgradeneeded: null, onsuccess: null, onerror: null }) };
globalThis.setTimeout = globalThis.setTimeout || ((fn) => fn && 0);
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// ── Import every source module so any resolution/eval error throws here ──────
const modules = [
  '../src/core/version.js',
  '../src/core/format.js',
  '../src/core/events.js',
  '../src/core/store.js',
  '../src/core/persist.js',
  '../src/core/objects.js',
  '../src/core/renderer.js',
  '../src/core/progression.js',
  '../src/core/search.js',
  '../src/core/repo.js',
  '../src/core/entities.js',
  '../src/core/analysis.js',
  '../src/core/ai-settings.js',
  '../src/core/ai.js',
  '../src/core/templates.js',
  '../src/ui/toast.js',
  '../src/ui/modal.js',
  '../src/ui/ai-settings-panel.js',
  '../src/ui/expandable-text.js',
  '../src/ui/export-import.js',
  '../src/core/registry.js',
  '../src/ui/command-palette.js',
  '../src/ui/app-shell.js',
];

let failed = false;
for (const m of modules) {
  try {
    await import(m);
    console.log('OK   ', m);
  } catch (e) {
    failed = true;
    console.error('FAIL ', m, '\n      ', e.message);
  }
}

// Spot-check key exports exist and are wired.
try {
  const reg = await import('../src/core/registry.js');
  const nav = reg.getNavGroups();
  const total = nav.reduce((n, g) => n + g.items.length, 0);
  if (total !== reg.MODULES.length) throw new Error(`nav items (${total}) != MODULES (${reg.MODULES.length})`);
  // Every module must have a render fn and a group.
  for (const mod of reg.MODULES) {
    if (typeof mod.render !== 'function') throw new Error(`module ${mod.id} has no render fn`);
    if (!['write', 'plan', 'world', 'analysis'].includes(mod.group)) throw new Error(`module ${mod.id} bad group ${mod.group}`);
  }
  console.log(`OK    registry: ${reg.MODULES.length} modules, all render fns present, nav covers all`);
} catch (e) {
  failed = true;
  console.error('FAIL  registry checks:', e.message);
}

// Export-schema migration: a legacy v1 payload (version:'1.0', no indexeddb)
// must migrate forward to the current schema with an indexeddb section.
try {
  const { migrateExportPayload } = await import('../src/ui/export-import.js');
  const legacy = { _meta: { version: '1.0', projectName: 'Old' }, data: { characters: [] } };
  const migrated = migrateExportPayload(legacy);
  if (typeof migrated._meta.schemaVersion !== 'number') throw new Error('schemaVersion not set');
  if (!migrated.indexeddb) throw new Error('indexeddb section not added');
  if (migrated.data !== legacy.data) { /* ok: shallow copy keeps data ref */ }
  console.log('OK    export migration: v1 -> current schema');
} catch (e) {
  failed = true;
  console.error('FAIL  export migration:', e.message);
}

// Service worker must be self-maintaining: no hand-written full file list that
// drifts out of sync (the old CRITICAL_FILES hazard). Assert the shell is tiny.
try {
  const { readFileSync } = await import('node:fs');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const shellMatch = sw.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
  if (!shellMatch) throw new Error('APP_SHELL not found');
  const entries = (shellMatch[1].match(/'[^']+'/g) || []).length;
  if (entries > 5) throw new Error(`APP_SHELL has ${entries} entries — should be a minimal shell, not a full file list`);
  // Behavioral checks (not comment-text): runtime caching + HTML-poison guard.
  if (!/cache\.put\(/.test(sw)) throw new Error('SW missing runtime cache.put (cache-on-fetch)');
  if (!/text\/html/.test(sw)) throw new Error('SW missing HTML-body cache guard (SPA-fallback poisoning protection)');
  console.log(`OK    service worker: minimal shell (${entries} entries) + runtime cache-on-fetch + poison guard`);
} catch (e) {
  failed = true;
  console.error('FAIL  service worker check:', e.message);
}

// renderPreservingScroll must be exported for opt-in scroll-preserving re-renders.
try {
  const r = await import('../src/core/renderer.js');
  if (typeof r.renderPreservingScroll !== 'function') throw new Error('renderPreservingScroll not exported');
  console.log('OK    renderer: renderPreservingScroll available');
} catch (e) {
  failed = true;
  console.error('FAIL  renderer check:', e.message);
}

console.log(failed ? '\n❌ SMOKE TEST FAILED' : '\n✅ SMOKE TEST PASSED');
process.exit(failed ? 1 : 0);
