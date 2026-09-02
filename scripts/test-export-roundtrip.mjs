/**
 * Export/Import round-trip test for the IndexedDB layer (database.js).
 *
 * Proves the Phase 3 data-safety guarantee (#8): importing a backup is purely
 * ADDITIVE — imported objects get fresh ids and never overwrite existing
 * records, and relationship endpoints are remapped to the new ids. Also proves
 * appState is excluded from export/import (it's global, not per-project).
 *
 * Uses a minimal in-memory fake of the exact IndexedDB surface database.js
 * touches (transaction -> objectStore -> put/get/getAll, objectStoreNames).
 * Zero dependencies. Run: NODE_OPTIONS= node scripts/test-export-roundtrip.mjs
 */

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

// ── Minimal fake IndexedDB ───────────────────────────────────────────────────
const STORES = ['objects', 'relationships', 'boards', 'snapshots', 'appState', 'blobs'];
const KEYPATH = { objects: 'id', relationships: 'id', boards: 'id', snapshots: 'id', appState: 'key', blobs: 'key' };

function makeRequest(resultFactory) {
  const req = { onsuccess: null, onerror: null, result: undefined };
  // Resolve on next microtask so onsuccess handlers (assigned after call) fire.
  Promise.resolve().then(() => {
    try { req.result = resultFactory(); if (req.onsuccess) req.onsuccess({ target: req }); }
    catch (e) { req.error = e; if (req.onerror) req.onerror({ target: req }); }
  });
  return req;
}

function makeFakeDB() {
  const data = new Map(STORES.map((s) => [s, new Map()]));
  return {
    objectStoreNames: { contains: (n) => STORES.includes(n) },
    transaction(name) {
      const store = data.get(name);
      return {
        objectStore() {
          return {
            put: (rec) => makeRequest(() => { store.set(rec[KEYPATH[name]], rec); return rec[KEYPATH[name]]; }),
            get: (id) => makeRequest(() => store.get(id)),
            getAll: () => makeRequest(() => [...store.values()]),
            clear: () => makeRequest(() => { store.clear(); return undefined; }),
            delete: (id) => makeRequest(() => { store.delete(id); return undefined; }),
          };
        },
      };
    },
    _data: data,
  };
}

const { db } = await import('../src/core/database.js');
db.db = makeFakeDB(); // inject the fake, bypassing indexedDB.open

// ── Seed an existing project's object graph ──────────────────────────────────
await db.put('objects', { id: 'obj_A', type: 'character', name: 'Existing Hero' });
await db.put('relationships', { id: 'rel_A', sourceId: 'obj_A', targetId: 'obj_A', type: 'self' });
await db.put('appState', { key: 'theme', value: 'dark' });

const beforeObjects = await db.getAll('objects');
const beforeRels = await db.getAll('relationships');
assert(beforeObjects.length === 1, 'seed has 1 object');

// ── exportAll excludes appState ──────────────────────────────────────────────
const dump = await db.exportAll();
assert(!('appState' in dump), 'exportAll excludes appState (global, not per-project)');
assert(Array.isArray(dump.objects) && dump.objects.length === 1, 'exportAll includes objects');
assert(Array.isArray(dump.relationships), 'exportAll includes relationships');

// ── Simulate importing a DIFFERENT backup that (maliciously) reuses obj_A's id
//    and references it in a relationship. Import must NOT overwrite obj_A. ────
const backup = {
  objects: [
    { id: 'obj_A', type: 'character', name: 'IMPOSTER (same id)' },
    { id: 'obj_B', type: 'faction', name: 'Imported Faction' },
  ],
  relationships: [
    { id: 'rel_A', sourceId: 'obj_A', targetId: 'obj_B', type: 'member_of' },
  ],
  appState: [{ key: 'theme', value: 'light' }], // must be ignored on import
};

const importedCount = await db.importAll(backup);
assert(importedCount === 3, `importAll reports 3 records imported (got ${importedCount})`);

const afterObjects = await db.getAll('objects');
const afterRels = await db.getAll('relationships');

// The original object must still exist, unmodified.
const original = afterObjects.find((o) => o.id === 'obj_A');
assert(original && original.name === 'Existing Hero', 'original obj_A was NOT overwritten by the same-id import');

// The imported records got FRESH ids (no collision), so total = 1 existing + 2 imported.
assert(afterObjects.length === 3, `objects are additive: 1 existing + 2 imported = 3 (got ${afterObjects.length})`);
const imposter = afterObjects.find((o) => o.name === 'IMPOSTER (same id)');
assert(imposter && imposter.id !== 'obj_A', 'imported "same-id" object was given a fresh id, not obj_A');

// The imported relationship must be remapped to the NEW imported object ids,
// and must not point at the original obj_A.
assert(afterRels.length === 2, `relationships additive: 1 existing + 1 imported = 2 (got ${afterRels.length})`);
const importedRel = afterRels.find((r) => r.type === 'member_of');
const importedFaction = afterObjects.find((o) => o.name === 'Imported Faction');
assert(importedRel && importedRel.sourceId === imposter.id, 'imported relationship source remapped to new imported object id');
assert(importedRel && importedRel.targetId === importedFaction.id, 'imported relationship target remapped to new imported faction id');
assert(importedRel.id !== 'rel_A', 'imported relationship got a fresh id (did not overwrite existing rel_A)');

// appState must be untouched by import.
const themeAfter = (await db.getAll('appState')).find((r) => r.key === 'theme');
assert(themeAfter && themeAfter.value === 'dark', 'appState was NOT modified by import');

// ── replaceAll (the SYNC apply path) must be IDEMPOTENT ──────────────────────
// Applying the same snapshot twice must NOT grow the stores or change ids —
// this is what keeps cloud sync from duplicating objects on every pull.
const syncSnapshot = {
  objects: [
    { id: 'sync_obj_1', type: 'character', name: 'Synced Hero' },
    { id: 'sync_obj_2', type: 'faction', name: 'Synced Faction' },
  ],
  relationships: [
    { id: 'sync_rel_1', sourceId: 'sync_obj_1', targetId: 'sync_obj_2', type: 'member_of' },
  ],
};

await db.replaceAll(syncSnapshot);
const firstApply = await db.getAll('objects');
assert(firstApply.length === 2, `replaceAll clears then writes: exactly 2 objects (got ${firstApply.length})`);
assert(firstApply.find((o) => o.id === 'sync_obj_1'), 'replaceAll preserves ids verbatim (no fresh-id remap)');

await db.replaceAll(syncSnapshot); // apply the SAME snapshot again (simulates a 2nd pull)
const secondApply = await db.getAll('objects');
const secondRels = await db.getAll('relationships');
assert(secondApply.length === 2, `replaceAll is idempotent: still 2 objects after re-apply (got ${secondApply.length})`);
assert(secondRels.length === 1, `replaceAll is idempotent: still 1 relationship after re-apply (got ${secondRels.length})`);
assert(secondApply.find((o) => o.id === 'sync_obj_1'), 'replaceAll re-apply keeps stable ids');

// ── Blob store: large image data URLs live in IndexedDB, not localStorage ────
// put/get/delete round-trip.
assert(await db.putBlob('proj1:planetPainter:texture', 'data:image/png;base64,AAA') === true, 'putBlob stores a blob');
assert(await db.getBlob('proj1:planetPainter:texture') === 'data:image/png;base64,AAA', 'getBlob reads it back');
assert(await db.getBlob('nope') === null, 'getBlob returns null for a missing key');
await db.deleteBlob('proj1:planetPainter:texture');
assert(await db.getBlob('proj1:planetPainter:texture') === null, 'deleteBlob removes it');

// Seed two projects' blobs to prove per-project scoping.
await db.putBlob('proj1:planetPainter:texture', 'P1-TEX');
await db.putBlob('proj1:fantasyMap:terrain', 'P1-TERRAIN');
await db.putBlob('proj2:planetPainter:texture', 'P2-TEX');

// exportAll(projectId) includes ONLY that project's blobs.
const exp1 = await db.exportAll('proj1');
assert(Array.isArray(exp1.blobs), 'exportAll includes a blobs array');
assert(exp1.blobs.length === 2 && exp1.blobs.every((b) => b.key.startsWith('proj1:')), 'exportAll(projectId) scopes blobs to that project');
const expAll = await db.exportAll();
assert(expAll.blobs.length === 3, 'exportAll() with no projectId returns all blobs');

// getBlobsByPrefix filters by project.
assert((await db.getBlobsByPrefix('proj1:')).length === 2, 'getBlobsByPrefix scopes to a project');

// replaceAll only replaces the incoming project's blobs — must NOT wipe proj2.
await db.replaceAll({ objects: [], relationships: [], boards: [], blobs: [{ key: 'proj1:planetPainter:texture', value: 'P1-TEX-v2' }] });
assert(await db.getBlob('proj1:planetPainter:texture') === 'P1-TEX-v2', 'replaceAll updates the project blob');
assert(await db.getBlob('proj1:fantasyMap:terrain') === null, 'replaceAll cleared the project\'s OTHER blob (authoritative snapshot)');
assert(await db.getBlob('proj2:planetPainter:texture') === 'P2-TEX', 'replaceAll did NOT touch a different project\'s blobs');

// importAll re-keys blobs to a NEW project id (file import creates a new project).
await db.importAll({ objects: [], relationships: [], blobs: [{ key: 'proj9:planetPainter:texture', value: 'IMPORTED' }] }, 'projNEW');
assert(await db.getBlob('projNEW:planetPainter:texture') === 'IMPORTED', 'importAll re-keys imported blobs to the target project');
assert(await db.getBlob('proj9:planetPainter:texture') === null, 'importAll did not keep the original blob key');

// ── snapshotHash folds in blob identity (so a texture-only edit still syncs) ──
const { snapshotHash } = await import('../src/core/project-data.js');
const base = { data: { fantasyMap: { style: 'fantasy' } }, indexeddb: { blobs: [{ key: 'p:planetPainter:texture', value: 'AAAA' }] } };
const same = { data: { fantasyMap: { style: 'fantasy' } }, indexeddb: { blobs: [{ key: 'p:planetPainter:texture', value: 'AAAA' }] } };
const changed = { data: { fantasyMap: { style: 'fantasy' } }, indexeddb: { blobs: [{ key: 'p:planetPainter:texture', value: 'BBBB-different' }] } };
assert(snapshotHash(base) === snapshotHash(same), 'snapshotHash is stable for identical snapshots');
assert(snapshotHash(base) !== snapshotHash(changed), 'snapshotHash changes when ONLY a blob changes (blob-only edits still sync)');

console.log(`\n${failed === 0 ? '✅' : '❌'} export round-trip tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
