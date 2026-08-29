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
export async function buildProjectSnapshot(project) {
  const projectId = project.id;
  const data = readLocalData(projectId);

  let indexeddb = {};
  try { indexeddb = await db.exportAll(); }
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
  const str = keys.map((k) => `${k}:${JSON.stringify(data[k])}`).join('|');
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
