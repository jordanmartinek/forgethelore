/**
 * LoreForge Planner - Unified Data-Access Layer (Repository)
 *
 * PHASE 2 GOAL (#1 persistence consolidation): give every module ONE API to
 * read and write its data, instead of each module calling loadData/saveData
 * directly with ad-hoc keys. This is intentionally non-destructive: the backing
 * store is still the same namespaced localStorage used today (via persist.js),
 * so nothing breaks and no data migration is required to adopt it. Consolidating
 * behind a single interface is what makes it possible to later swap the backing
 * store (e.g. to the IndexedDB object system) in ONE place rather than 25.
 *
 * It also emits change events so cross-module views (dashboard, knowledge graph,
 * search) can react without the fragile window.__loreforge_* globals.
 */

import { loadData, saveData, persistState } from './persist.js';
import { events } from './events.js';

/**
 * Canonical collection keys used across the app. Centralizing them here means
 * the collection names are no longer magic strings scattered through modules,
 * and tooling (search, export, graph) can enumerate every collection.
 */
export const Collections = {
  CHARACTERS: 'characters',
  FACTIONS: 'factionData',
  BOARD_FACTIONS: 'factions',
  PIECES: 'pieces',
  CONFLICT_LINES: 'conflictLines',
  SCENES: 'scenes',
  LOCATIONS: 'locations',
  SPECIES: 'species',
  LANGUAGES: 'languages',
  RELIGIONS: 'religions',
  ORGANIZATIONS: 'organizations',
  POLITICS: 'politicalEntities',
  MILITARY: 'militaryForces',
  TECHNOLOGIES: 'technologies',
  RESOURCES: 'resources',
  MYSTERIES: 'mysteries',
  MANUSCRIPT: 'manuscriptScenes',
  BRAINSTORM: 'brainstormSessions',
  TIMELINE: 'timelineEvents',
  TIMELINE_TRACKS: 'timelineTracks',
  WORLD: 'worldBuilder',
  RELATIONSHIPS: 'relationships',
  ARCS: 'characterArcs',
  SPRINTS: 'writingSprints',
  DAILY: 'dailyPlans',
};

/** All array-shaped collections (excludes the object-shaped `worldBuilder`). */
export const LIST_COLLECTIONS = Object.values(Collections).filter((k) => k !== Collections.WORLD);

/**
 * Read a collection as an array. Returns a fresh array (never shares a
 * reference with the caller's previous read) so accidental mutation of stale
 * data can't corrupt storage silently.
 *
 * Records are dynamically-shaped user data, so they are typed as `any` — this
 * keeps checkJs useful for real bugs without demanding a full schema for every
 * module's evolving record shape.
 * @param {string} collection
 * @returns {any[]}
 */
export function list(collection) {
  const data = loadData(collection, []);
  return Array.isArray(data) ? data : [];
}

/**
 * Read a single object-shaped collection (e.g. the world tree).
 * @param {string} collection
 * @param {object} [fallback]
 */
export function readObject(collection, fallback = null) {
  return loadData(collection, fallback);
}

/**
 * Persist a whole collection and report the honest save status.
 * @param {string} collection
 * @param {*} data
 * @returns {boolean} write success
 */
export function write(collection, data) {
  const ok = persistState(collection, data);
  events.emit('repo:changed', { collection });
  return ok;
}

/**
 * Persist a collection WITHOUT touching the save indicator (for bulk/internal
 * writes such as migrations). Still emits a change event.
 */
export function writeSilent(collection, data) {
  const ok = saveData(collection, data);
  events.emit('repo:changed', { collection });
  return ok;
}

/** Find a record by id within a collection. */
export function getById(collection, id) {
  return list(collection).find((r) => r && r.id === id) || null;
}

/**
 * Upsert a record by id: replaces an existing record with the same id, or
 * appends it. Returns { ok, records }.
 */
export function upsert(collection, record) {
  const records = list(collection);
  const idx = records.findIndex((r) => r && r.id === record.id);
  if (idx === -1) records.push(record);
  else records[idx] = { ...records[idx], ...record };
  const ok = write(collection, records);
  return { ok, records };
}

/** Remove a record by id. Returns { ok, records, removed }. */
export function remove(collection, id) {
  const records = list(collection);
  const idx = records.findIndex((r) => r && r.id === id);
  const removed = idx !== -1;
  if (removed) records.splice(idx, 1);
  const ok = removed ? write(collection, records) : true;
  return { ok, records, removed };
}

/** Subscribe to collection changes. Returns an unsubscribe function. */
export function onChange(handler) {
  return events.on('repo:changed', handler);
}
