/**
 * LoreForge Planner - Project blob store (large image data URLs)
 *
 * Big binary payloads — the 3D planet's surface texture and the 2D map's
 * terrain raster + imported backdrop image — are PNG data URLs that can be
 * several megabytes each. localStorage caps a whole origin at ~5-10MB, so
 * storing them there quickly hits "storage full". This helper keeps those blobs
 * in IndexedDB (quota: hundreds of MB to GBs) instead, while the small project
 * JSON stays in localStorage.
 *
 * Keys are namespaced by the ACTIVE project id: `${projectId}:${ns}:${field}`
 * (e.g. 'proj1:planetPainter:texture'), so blobs are per-project and travel
 * with export/import + sync (database.js exports the `blobs` store).
 */

import { db } from './database.js';
import { getActiveProjectId } from './persist.js';

/** Build the namespaced blob key for the current project. */
export function blobKey(ns, field) {
  return `${getActiveProjectId()}:${ns}:${field}`;
}

/**
 * Store a blob (image data URL string) for the active project.
 * @returns {Promise<boolean>} true on success.
 */
export async function putProjectBlob(ns, field, dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return false;
  return db.putBlob(blobKey(ns, field), dataUrl);
}

/** Read a blob for the active project, or null if absent. */
export async function getProjectBlob(ns, field) {
  return db.getBlob(blobKey(ns, field));
}

/** Delete a blob for the active project. */
export async function deleteProjectBlob(ns, field) {
  return db.deleteBlob(blobKey(ns, field));
}
