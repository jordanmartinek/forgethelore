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
const STORES = ['objects', 'relationships', 'boards', 'snapshots', 'appState'];
const KEYPATH = { objects: 'id', relationships: 'id', boards: 'id', snapshots: 'id', appState: 'key' };

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

console.log(`\n${failed === 0 ? '✅' : '❌'} export round-trip tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
