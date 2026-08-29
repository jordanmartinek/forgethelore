/**
 * LoreForge Planner - Sync Bootstrap
 *
 * Wires the pure SyncEngine to the running app: builds the configured backend,
 * connects repo change events -> engine.notifyChange, reflects engine status in
 * the app store (syncStatus), applies remote snapshots on pull, and handles the
 * manual "sync now" action + online/offline transitions.
 *
 * If sync is not configured, this is a no-op and the app stays fully local.
 */

import { appStore } from '../store.js';
import * as repo from '../repo.js';
import { db } from '../database.js';
import { buildProjectSnapshot, applyLocalData } from '../project-data.js';
import { LocalMockBackend, RestBackend } from './backend.js';
import { SyncEngine } from './sync-engine.js';
import { getSyncSettings, isSyncConfigured } from './sync-settings.js';

let engine = null;
let _repoSubscribed = false;

/** Subscribe to repo changes once; the handler self-gates on engine + settings. */
function ensureRepoSubscription() {
  if (_repoSubscribed) return;
  _repoSubscribed = true;
  repo.onChange(() => {
    if (engine && getSyncSettings().autoSync) engine.notifyChange();
  });
}

/** The active project object from the app store. */
function getActiveProject() {
  const state = appStore.getState();
  return state.projects.find((p) => p.id === state.activeProjectId) || { id: state.activeProjectId };
}

/** Apply a remote snapshot to a project's local storage + IndexedDB. */
async function applySnapshot(projectId, snapshot) {
  applyLocalData(projectId, snapshot);
  if (snapshot && snapshot.indexeddb) {
    // Use replaceAll (not importAll): the remote snapshot IS the authoritative
    // state, so replace the object stores in place. This keeps sync idempotent
    // — importAll would additively re-import with fresh ids and duplicate
    // everything on every pull.
    try { await db.replaceAll(snapshot.indexeddb); }
    catch (e) { console.warn('[LoreForge] sync: IndexedDB apply skipped:', e.message); }
  }
  // Remote data just replaced local data for a project. If it's the ACTIVE
  // project, the on-screen module is now showing stale in-memory data, so ask
  // the app to re-hydrate. Modules read their arrays at module-eval time, so a
  // full reload is the reliable way to reflect a wholesale project swap.
  const active = appStore.getState().activeProjectId;
  if (projectId === active && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('loreforge:remote-applied', { detail: { projectId } }));
  }
}

/** Reflect engine status in the app store (drives the topbar indicator). */
function onStatus(status) {
  const patch = { syncStatus: status };
  if (status === 'synced') patch.lastSynced = Date.now();
  appStore.setState(patch);
}

/** Default conflict resolver: ask via a custom event the UI can answer; else remote-wins. */
let conflictResolver = async () => 'remote';
export function setConflictResolver(fn) { conflictResolver = fn; }

function buildBackend(settings) {
  if (settings.mode === 'local') {
    // Same-browser demo "cloud" (localStorage-backed) — lets a user try sync
    // and see the round-trip without any server. Not cross-device, by design.
    return new LocalMockBackend({ store: localStorageMapAdapter('loreforge_synccloud_') });
  }
  return new RestBackend({ baseUrl: settings.baseUrl, apiKey: settings.apiKey });
}

/**
 * Adapt localStorage to the Map-like interface LocalMockBackend expects, so the
 * 'local' demo mode persists across reloads under a dedicated prefix.
 */
function localStorageMapAdapter(prefix) {
  return {
    get: (k) => localStorage.getItem(prefix + k),
    set: (k, v) => localStorage.setItem(prefix + k, v),
    entries: function* () {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) yield [key.slice(prefix.length), localStorage.getItem(key)];
      }
    },
  };
}

/**
 * Initialize (or re-initialize) sync from the current settings. Safe to call
 * again after settings change. Returns the engine or null if not configured.
 */
export function initSync() {
  const settings = getSyncSettings();
  if (!isSyncConfigured()) {
    engine = null;
    appStore.setState({ syncStatus: 'idle' });
    return null;
  }

  let backend;
  try {
    backend = buildBackend(settings);
  } catch (e) {
    console.warn('[LoreForge] sync init failed:', e.message);
    appStore.setState({ syncStatus: 'error' });
    return null;
  }

  engine = new SyncEngine(backend, {
    getActiveProject,
    buildSnapshot: (project) => buildProjectSnapshot(project),
    applySnapshot,
    onStatus,
    resolveConflict: (local, remote) => conflictResolver(local, remote),
  });
  engine.setEnabled(true);

  // Push on local change. Subscribe to repo changes exactly ONCE for the life
  // of the page (guarded), then let the handler decide at call time whether to
  // push — so re-running initSync() on settings changes never stacks listeners.
  ensureRepoSubscription();

  // Pull on startup so this device catches up with the cloud, then push any
  // local changes made while away.
  (async () => {
    try {
      await engine.pull();
      await engine.flush();
    } catch (e) {
      console.warn('[LoreForge] initial sync failed:', e.message);
    }
  })();

  return engine;
}

/** Manual "Sync now": pull then push. */
export async function syncNow() {
  if (!engine) return { ok: false, reason: 'not-configured' };
  await engine.pull();
  const res = await engine.flush();
  return { ok: true, res };
}

let _remoteAppliedOnce = false;

/** Wire global listeners once (called from main.js). */
export function wireSyncListeners() {
  if (typeof window === 'undefined') return;
  // Manual sync from the topbar indicator.
  window.addEventListener('loreforge:sync-now', () => { syncNow(); });
  // Flush the outbox when connectivity returns.
  window.addEventListener('online', () => { if (engine) engine.flush(); });
  window.addEventListener('offline', () => { appStore.setState({ syncStatus: 'offline' }); });
  // When a remote snapshot replaces the active project's data, reload so the
  // UI reflects it. Guard against a reload loop: the very first startup pull
  // reloads at most once (the reloaded page's pull will be up-to-date).
  window.addEventListener('loreforge:remote-applied', () => {
    if (_remoteAppliedOnce) return;
    _remoteAppliedOnce = true;
    setTimeout(() => { try { window.location.reload(); } catch (_) { /* ignore */ } }, 400);
  });
}

export function getEngine() { return engine; }
