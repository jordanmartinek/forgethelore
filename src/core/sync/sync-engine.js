/**
 * LoreForge Planner - Cloud Sync Engine
 *
 * Local-first sync: every write hits localStorage FIRST (synchronous, offline-
 * safe) and merely *enqueues* a sync intent. The engine flushes that outbox to
 * the backend when online, using a per-project revision for optimistic
 * concurrency. On conflict (someone else pushed since our last pull) it surfaces
 * the situation to a resolver instead of silently clobbering.
 *
 * Design rules:
 *   - The network is always async and best-effort; it NEVER blocks a local write.
 *   - One project is synced at a time (whole-project snapshot = "Option A").
 *   - Debounced: rapid edits coalesce into a single push.
 *   - Everything is injected (backend, deps) so the engine is unit-testable with
 *     no DOM and no network.
 *
 * State kept per project (persisted so revisions survive reloads):
 *   loreforge_sync_rev_{projectId}  -> last rev we successfully pulled/pushed
 *   loreforge_sync_hash_{projectId} -> content hash at that rev (dirty check)
 */

import { snapshotHash } from '../project-data.js';

const REV_KEY = (pid) => `loreforge_sync_rev_${pid}`;
const HASH_KEY = (pid) => `loreforge_sync_hash_${pid}`;

/**
 * @typedef {Object} SyncDeps
 * @property {() => {id:string,name?:string,icon?:string,description?:string}} getActiveProject
 * @property {(project:object) => Promise<object>} buildSnapshot   Build a project snapshot payload.
 * @property {(projectId:string, snapshot:object) => (number|Promise<number>)} applySnapshot Apply a remote snapshot locally.
 * @property {(status:string, detail?:object) => void} [onStatus]  'synced'|'syncing'|'offline'|'conflict'|'error'|'idle'
 * @property {(local:object, remote:object) => Promise<'local'|'remote'|'cancel'>} [resolveConflict]
 * @property {() => boolean} [isOnline]
 * @property {Storage} [storage]  Defaults to localStorage.
 * @property {number} [debounceMs]
 */

export class SyncEngine {
  /**
   * @param {import('./backend.js').LocalMockBackend|import('./backend.js').RestBackend} backend
   * @param {SyncDeps} deps
   */
  constructor(backend, deps) {
    this.backend = backend;
    this.d = deps;
    this.storage = deps.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.debounceMs = deps.debounceMs ?? 1500;

    this._timer = null;
    this._flushing = false;
    this._pendingProjectIds = new Set();
    this._enabled = true;
  }

  _online() {
    if (this.d.isOnline) return this.d.isOnline();
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  _status(status, detail) {
    if (this.d.onStatus) { try { this.d.onStatus(status, detail); } catch (_) { /* ignore */ } }
  }

  _getRev(pid) {
    try { return Number(this.storage?.getItem(REV_KEY(pid))) || 0; } catch (_) { return 0; }
  }
  _setRev(pid, rev) {
    try { this.storage?.setItem(REV_KEY(pid), String(rev)); } catch (_) { /* ignore */ }
  }
  _getHash(pid) {
    try { return this.storage?.getItem(HASH_KEY(pid)) || ''; } catch (_) { return ''; }
  }
  _setHash(pid, hash) {
    try { this.storage?.setItem(HASH_KEY(pid), hash); } catch (_) { /* ignore */ }
  }

  /** Enable/disable syncing entirely (e.g. when the user turns sync off). */
  setEnabled(on) { this._enabled = !!on; if (!on) this._status('idle'); }

  /**
   * Signal that a project changed. Debounced; coalesces rapid edits. Safe to
   * call from repo.onChange on every write.
   * @param {string} [projectId] defaults to the active project.
   */
  notifyChange(projectId) {
    if (!this._enabled) return;
    const pid = projectId || this.d.getActiveProject()?.id;
    if (!pid) return;
    this._pendingProjectIds.add(pid);
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /**
   * Push all pending projects now. Returns a summary. Never throws — surfaces
   * problems through onStatus and the returned result.
   * @returns {Promise<{pushed:string[], conflicts:string[], skipped:string[], offline:boolean}>}
   */
  async flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const result = { pushed: [], conflicts: [], skipped: [], offline: false };
    if (!this._enabled) return result;
    if (this._flushing) return result; // a flush is already running; its drain will pick up pending
    if (!this._online()) { result.offline = true; this._status('offline'); return result; }

    this._flushing = true;
    this._status('syncing');
    try {
      let ids = [...this._pendingProjectIds];
      this._pendingProjectIds.clear();
      // If nothing is explicitly queued (e.g. a manual "Sync now"), fall back to
      // the active project so flush() always does something sensible.
      if (ids.length === 0) {
        const active = this.d.getActiveProject();
        if (active && active.id) ids = [active.id];
      }
      for (const pid of ids) {
        const outcome = await this._pushProject(pid);
        if (outcome === 'pushed') result.pushed.push(pid);
        else if (outcome === 'conflict') result.conflicts.push(pid);
        else result.skipped.push(pid);
      }
      this._status(result.conflicts.length ? 'conflict' : 'synced', result);
    } catch (e) {
      this._status('error', { message: e.message });
    } finally {
      this._flushing = false;
    }
    return result;
  }

  /**
   * Push a single project: snapshot -> dirty check -> put(baseRev) -> on
   * conflict, resolve. Returns 'pushed' | 'conflict' | 'skipped'.
   */
  async _pushProject(pid) {
    const project = this._projectById(pid);
    if (!project) return 'skipped';

    const snapshot = await this.d.buildSnapshot(project);
    const hash = snapshotHash(snapshot);

    // Nothing changed since our last successful sync -> no-op push.
    if (hash === this._getHash(pid)) return 'skipped';

    const baseRev = this._getRev(pid);
    try {
      const { rev } = await this.backend.put(pid, snapshot, baseRev);
      this._setRev(pid, rev);
      this._setHash(pid, hash);
      return 'pushed';
    } catch (e) {
      if (e && e.conflict) {
        const resolved = await this._handleConflict(pid, snapshot, e.remote);
        return resolved ? 'pushed' : 'conflict';
      }
      throw e;
    }
  }

  /**
   * Resolve a push conflict. Asks the resolver which side wins:
   *   'remote' -> apply the remote snapshot locally, adopt its rev.
   *   'local'  -> re-push our snapshot on top of the remote rev (force).
   *   'cancel' -> leave as-is; project stays flagged conflicted.
   * @returns {Promise<boolean>} true if the conflict was resolved by a push/apply.
   */
  async _handleConflict(pid, localSnapshot, remote) {
    const choice = this.d.resolveConflict
      ? await this.d.resolveConflict(localSnapshot, remote)
      : 'remote'; // default: remote wins (safest — never lose the shared truth silently)

    if (choice === 'remote') {
      if (remote && remote.snapshot) {
        await this.d.applySnapshot(pid, remote.snapshot);
        this._setRev(pid, remote.rev);
        this._setHash(pid, snapshotHash(remote.snapshot));
      }
      return true;
    }
    if (choice === 'local') {
      // Force our version on top of the current remote revision. Retry against a
      // freshly-fetched rev if a third writer advanced the server between the
      // original 409 and now, so "keep local" reliably wins instead of erroring.
      let baseRev = remote ? remote.rev : this._getRev(pid);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { rev } = await this.backend.put(pid, localSnapshot, baseRev);
          this._setRev(pid, rev);
          this._setHash(pid, snapshotHash(localSnapshot));
          return true;
        } catch (e) {
          if (e && e.conflict) {
            const latest = e.remote || (await this.backend.get(pid));
            baseRev = latest ? latest.rev : baseRev;
            continue;
          }
          throw e;
        }
      }
      return false; // gave up after retries
    }
    return false; // cancel
  }

  /**
   * Pull the latest for a project from the backend and apply it locally IF the
   * remote is newer than what we have. Returns 'applied' | 'up-to-date' |
   * 'conflict' | 'none' | 'offline'.
   *
   * "conflict" here means: the remote advanced AND we have unpushed local
   * changes (local hash differs from our recorded hash) — applying blindly
   * would lose local edits, so we defer to the resolver.
   */
  async pull(projectId) {
    const pid = projectId || this.d.getActiveProject()?.id;
    if (!pid) return 'none';
    if (!this._online()) { this._status('offline'); return 'offline'; }

    const remote = await this.backend.get(pid);
    if (!remote) return 'none';

    const localRev = this._getRev(pid);
    if (remote.rev <= localRev) return 'up-to-date';

    // Remote is newer. Do we have local edits that haven't been pushed?
    const project = this._projectById(pid);
    const localSnapshot = project ? await this.d.buildSnapshot(project) : null;
    const localDirty = localSnapshot && snapshotHash(localSnapshot) !== this._getHash(pid);

    if (localDirty) {
      const resolved = await this._handleConflict(pid, localSnapshot, remote);
      return resolved ? 'applied' : 'conflict';
    }

    // Clean local -> safe to fast-forward to the remote.
    await this.d.applySnapshot(pid, remote.snapshot);
    this._setRev(pid, remote.rev);
    this._setHash(pid, snapshotHash(remote.snapshot));
    this._status('synced');
    return 'applied';
  }

  _projectById(pid) {
    const active = this.d.getActiveProject();
    if (active && active.id === pid) return active;
    // Fall back to a minimal project object if only the id is known.
    return { id: pid };
  }
}
