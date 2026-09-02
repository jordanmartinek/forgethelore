/**
 * LoreForge Planner - Project Snapshot Helpers
 *
 * Shared, dependency-light functions to snapshot a project's full state
 * (namespaced localStorage + IndexedDB object stores) into a plain object, and
 * to write a snapshot back into a project's namespace. Extracted so BOTH the
 * file export/import UI AND the cloud sync engine build/apply data the exact
 * same way — one code path, one place to fix bugs.
 *
 * A "snapshot" is: { _meta, data, indexeddb }
 *   - data:      { [collectionKey]: value } from localStorage (per project)
 *   - indexeddb: { objects, relationships, boards } (global object stores)
 */

import { db } from './database.js';
import { APP_NAME, EXPORT_SCHEMA_VERSION } from './version.js';

/**
 * Read every namespaced localStorage collection for a project into a plain map.
 * @param {string} projectId
 * @returns {Record<string, any>}
 */
export function readLocalData(projectId) {
  const prefix = `loreforge_${projectId}_`;
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const shortKey = key.slice(prefix.length);
      try { data[shortKey] = JSON.parse(localStorage.getItem(key)); }
      catch (_) { data[shortKey] = localStorage.getItem(key); }
    }
  }
  return data;
}

/**
 * Build a full snapshot of a project (localStorage + IndexedDB).
 * @param {object} project  { id, name, icon, description }
 * @returns {Promise<object>} snapshot payload
 */
// Modules with debounced saves (the map + planet, whose big images are written
// to IndexedDB asynchronously) register a flush here so a sync snapshot is
// never built while a blob write is still pending — otherwise the snapshot
// could capture a stale image and the peer's authoritative apply would drop the
// newest paint. Kept as a tiny registry to avoid the core importing UI modules.
const _preSnapshotFlushers = new Set();
export function registerPreSnapshotFlush(fn) {
  if (typeof fn === 'function') _preSnapshotFlushers.add(fn);
  return () => _preSnapshotFlushers.delete(fn);
}

export async function buildProjectSnapshot(project) {
  // Flush any pending debounced saves + in-flight blob writes first.
  for (const fn of _preSnapshotFlushers) {
    try { await fn(); } catch (_) { /* a flusher failing must not block sync */ }
  }
  const projectId = project.id;
  const data = readLocalData(projectId);

  let indexeddb = {};
  try { indexeddb = await db.exportAll(projectId); }
  catch (e) { console.warn('[LoreForge] IndexedDB snapshot skipped:', e.message); }

  return {
    _meta: {
      appName: APP_NAME,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      projectId,
      projectName: project?.name || 'Unknown',
      projectIcon: project?.icon || '📖',
      projectDescription: project?.description || '',
    },
    data,
    indexeddb,
  };
}

/**
 * Apply a snapshot's localStorage data into a target project's namespace.
 * Replaces the target project's collections with the snapshot's. Does NOT touch
 * IndexedDB (that's handled separately via db.importAll, which is additive).
 *
 * @param {string} targetProjectId
 * @param {object} snapshot  { data }
 * @param {object} [opts]
 * @param {boolean} [opts.clearFirst=true] Remove existing keys for the project first.
 * @returns {number} number of collections written
 */
export function applyLocalData(targetProjectId, snapshot, { clearFirst = true } = {}) {
  const prefix = `loreforge_${targetProjectId}_`;
  if (clearFirst) {
    const existing = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
    existing.forEach((k) => localStorage.removeItem(k));
  }
  const data = (snapshot && snapshot.data) || {};
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
      count++;
    } catch (e) {
      console.warn('[LoreForge] applyLocalData failed for', key, e.message);
    }
  }
  return count;
}

/**
 * A lightweight content hash of a snapshot's data, used to detect whether the
 * local project actually changed since the last sync (avoids pushing no-ops)
 * and to compare against a remote revision. Order-insensitive over collections.
 * @param {object} snapshot
 * @returns {string}
 */
export function snapshotHash(snapshot) {
  const data = (snapshot && snapshot.data) || {};
  const keys = Object.keys(data).sort();
  // FNV-1a over the stable serialization — cheap, dependency-free, good enough
  // to detect "did anything change" (not a cryptographic guarantee).
  let hash = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  feed(keys.map((k) => `${k}:${JSON.stringify(data[k])}`).join('|'));
  // Fold in the blob store's identity too — the big images (planet texture, map
  // terrain/backdrop) now live in IndexedDB, so a texture-only edit wouldn't
  // change `data`. Hash each blob's key + value length + a cheap content digest
  // so a paint that only touches a blob still marks the project dirty for sync.
  const blobs = (snapshot && snapshot.indexeddb && snapshot.indexeddb.blobs) || [];
  if (Array.isArray(blobs) && blobs.length) {
    const parts = blobs
      .filter((b) => b && typeof b.key === 'string')
      .map((b) => {
        const v = typeof b.value === 'string' ? b.value : '';
        // Full-coverage rolling checksum over the (multi-MB) value. O(n) but
        // branch-free and cheap; unlike sparse sampling it can't miss a
        // same-length edit that changes bytes anywhere in the image.
        let d = 0x811c9dc5;
        for (let i = 0; i < v.length; i++) {
          d ^= v.charCodeAt(i);
          d = Math.imul(d, 0x01000193);
        }
        return `${b.key}#${v.length}#${d >>> 0}`;
      })
      .sort();
    feed('|blobs|' + parts.join('|'));
  }
  return (hash >>> 0).toString(16);
}
