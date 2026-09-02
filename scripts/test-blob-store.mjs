/**
 * Tests for the project-scoped blob store (core/blob-store.js) — the layer that
 * keeps large image data URLs (planet texture, map terrain/backdrop) in
 * IndexedDB instead of the tiny localStorage quota. Uses a localStorage stub
 * and the same in-memory fake IndexedDB the export round-trip test uses.
 * Zero dependencies. Run: NODE_OPTIONS= node scripts/test-blob-store.mjs
 */

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

// ── localStorage stub (persist.js reads loreforge_activeProjectId at import) ──
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
store.set('loreforge_activeProjectId', 'projA');

// ── minimal fake IndexedDB (blobs store) ─────────────────────────────────────
const STORES = ['objects', 'relationships', 'boards', 'snapshots', 'appState', 'blobs'];
const KEYPATH = { objects: 'id', relationships: 'id', boards: 'id', snapshots: 'id', appState: 'key', blobs: 'key' };
function makeRequest(fn) {
  const req = { onsuccess: null, onerror: null, result: undefined };
  Promise.resolve().then(() => {
    try { req.result = fn(); if (req.onsuccess) req.onsuccess({ target: req }); }
    catch (e) { req.error = e; if (req.onerror) req.onerror({ target: req }); }
  });
  return req;
}
function makeFakeDB() {
  const data = new Map(STORES.map((s) => [s, new Map()]));
  return {
    objectStoreNames: { contains: (n) => STORES.includes(n) },
    transaction(name) {
      const s = data.get(name);
      return { objectStore() {
        return {
          put: (rec) => makeRequest(() => { s.set(rec[KEYPATH[name]], rec); return rec[KEYPATH[name]]; }),
          get: (id) => makeRequest(() => s.get(id)),
          getAll: () => makeRequest(() => [...s.values()]),
          clear: () => makeRequest(() => { s.clear(); return undefined; }),
          delete: (id) => makeRequest(() => { s.delete(id); return undefined; }),
        };
      } };
    },
  };
}

const { db } = await import('../src/core/database.js');
db.db = makeFakeDB();
const blobStore = await import('../src/core/blob-store.js');
const persist = await import('../src/core/persist.js');

// ── project-scoped put/get/delete ────────────────────────────────────────────
assert(blobStore.blobKey('planetPainter', 'texture') === 'projA:planetPainter:texture', 'blobKey namespaces by active project');
assert(await blobStore.putProjectBlob('planetPainter', 'texture', 'data:image/png;base64,ZZZ') === true, 'putProjectBlob stores');
assert(await blobStore.getProjectBlob('planetPainter', 'texture') === 'data:image/png;base64,ZZZ', 'getProjectBlob reads back');
assert(await blobStore.putProjectBlob('planetPainter', 'texture', '') === false, 'putProjectBlob rejects empty/non-string');
await blobStore.deleteProjectBlob('planetPainter', 'texture');
assert(await blobStore.getProjectBlob('planetPainter', 'texture') === null, 'deleteProjectBlob removes it');

// ── blobs are isolated per active project ────────────────────────────────────
await blobStore.putProjectBlob('fantasyMap', 'terrain', 'A-TERRAIN');
persist.setActiveProject('projB');
assert(await blobStore.getProjectBlob('fantasyMap', 'terrain') === null, 'a different project cannot see projA\'s blob');
await blobStore.putProjectBlob('fantasyMap', 'terrain', 'B-TERRAIN');
assert(await blobStore.getProjectBlob('fantasyMap', 'terrain') === 'B-TERRAIN', 'projB has its own blob');
persist.setActiveProject('projA');
assert(await blobStore.getProjectBlob('fantasyMap', 'terrain') === 'A-TERRAIN', 'projA blob intact after switching back');
// Both projects' blobs coexist in the store.
assert((await db.getBlobsByPrefix('projA:')).length === 1 && (await db.getBlobsByPrefix('projB:')).length === 1, 'per-project blobs coexist');

// ── Write FAILURE must report false, so callers can keep an inline fallback ──
// (This is the data-safety contract: a failed blob write is never mistaken for
// success — planet/map save() falls back to persisting the image inline.)
const failingDB = {
  objectStoreNames: { contains: () => true },
  transaction() {
    return { objectStore() {
      return { put: () => makeRequest(() => { throw new Error('QuotaExceededError'); }) };
    } };
  },
};
db.db = failingDB;
assert(await db.putBlob('projA:planetPainter:texture', 'X') === false, 'putBlob returns false when the IDB write fails');
assert(await blobStore.putProjectBlob('planetPainter', 'texture', 'X') === false, 'putProjectBlob propagates the failure so callers fall back to inline');

console.log(`\n${failed === 0 ? '✅' : '❌'} blob-store tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
