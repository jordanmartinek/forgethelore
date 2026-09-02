/**
 * LoreForge Planner - Local-First Database Layer
 * Uses IndexedDB for persistent storage with autosave
 */

const DB_NAME = 'loreforge-planner';
// v2 adds the `blobs` store — large image data URLs (planet texture, map
// terrain/backdrop) live here instead of localStorage, which has a tiny ~5-10MB
// quota. IndexedDB's quota is far larger (typically hundreds of MB to GBs).
const DB_VERSION = 2;

class LoreForgeDB {
  constructor() {
    this.db = null;
    this.saveQueue = [];
    this.isSaving = false;
    this.saveTimer = null;
    this.listeners = new Set();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Planning Objects store
        if (!db.objectStoreNames.contains('objects')) {
          const objStore = db.createObjectStore('objects', { keyPath: 'id' });
          objStore.createIndex('type', 'type', { unique: false });
          objStore.createIndex('name', 'name', { unique: false });
          objStore.createIndex('parentId', 'parentId', { unique: false });
          objStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        
        // Relationships
        if (!db.objectStoreNames.contains('relationships')) {
          const relStore = db.createObjectStore('relationships', { keyPath: 'id' });
          relStore.createIndex('sourceId', 'sourceId', { unique: false });
          relStore.createIndex('targetId', 'targetId', { unique: false });
          relStore.createIndex('type', 'type', { unique: false });
        }
        
        // Boards (Conflict Board state)
        if (!db.objectStoreNames.contains('boards')) {
          db.createObjectStore('boards', { keyPath: 'id' });
        }
        
        // Snapshots (version history)
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // App state
        if (!db.objectStoreNames.contains('appState')) {
          db.createObjectStore('appState', { keyPath: 'key' });
        }

        // Blobs — large binary payloads (image data URLs) kept OUT of the tiny
        // localStorage quota. Keyed by `${projectId}:namespace:field`, e.g.
        // 'proj1:planetPainter:texture'. Value: { key, value, updatedAt }.
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'key' });
        }
      };
    });
  }

  /* ─── Blob store (large image data URLs) ──────────────────────────────────
   * A simple key→value store for big strings (PNG data URLs) that would blow
   * the localStorage quota. Keys are namespaced by project so they travel with
   * export/sync and never collide across projects.
   */

  /** Store a blob string under `key`. Resolves true on success, false on error. */
  async putBlob(key, value) {
    if (!this.db || !key) return false;
    try {
      await this.put('blobs', { key, value });
      return true;
    } catch (e) {
      console.warn('[LoreForge] putBlob failed for', key, e && e.message);
      return false;
    }
  }

  /** Read a blob string by `key`, or null if absent/on error. */
  async getBlob(key) {
    if (!this.db || !key) return null;
    try {
      const rec = await this.get('blobs', key);
      return rec && typeof rec.value === 'string' ? rec.value : null;
    } catch (_) { return null; }
  }

  /** Remove a blob by `key`. */
  async deleteBlob(key) {
    if (!this.db || !key) return;
    try { await this.delete('blobs', key); } catch (_) { /* ignore */ }
  }

  /** All blob records whose key starts with `prefix` (e.g. a project's blobs). */
  async getBlobsByPrefix(prefix) {
    if (!this.db) return [];
    try {
      const all = await this.getAll('blobs');
      return (all || []).filter((b) => b && typeof b.key === 'string' && b.key.startsWith(prefix));
    } catch (_) { return []; }
  }

  // Generic CRUD operations
  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put({ ...data, updatedAt: Date.now() });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** @returns {Promise<void>} */
  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /** @returns {Promise<void>} */
  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Autosave with debouncing
  scheduleSave(storeName, data) {
    this.saveQueue.push({ storeName, data });
    this.notifyListeners('saving');
    
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => this.flushSaveQueue(), 300);
  }

  async flushSaveQueue() {
    if (this.isSaving || this.saveQueue.length === 0) return;
    
    this.isSaving = true;
    const batch = [...this.saveQueue];
    this.saveQueue = [];
    
    try {
      for (const { storeName, data } of batch) {
        await this.put(storeName, data);
      }
      this.notifyListeners('saved');
    } catch (error) {
      console.error('Save error:', error);
      this.notifyListeners('error');
      // Re-queue failed items
      this.saveQueue.unshift(...batch);
    } finally {
      this.isSaving = false;
      if (this.saveQueue.length > 0) {
        this.flushSaveQueue();
      }
    }
  }

  // Snapshot system
  async createSnapshot(label = '') {
    const objects = await this.getAll('objects');
    const relationships = await this.getAll('relationships');
    const boards = await this.getAll('boards');
    
    const snapshot = {
      id: `snapshot_${Date.now()}`,
      timestamp: Date.now(),
      label: label || `Snapshot ${new Date().toLocaleString()}`,
      data: { objects, relationships, boards },
    };
    
    await this.put('snapshots', snapshot);
    return snapshot;
  }

  async restoreSnapshot(snapshotId) {
    const snapshot = await this.get('snapshots', snapshotId);
    if (!snapshot) throw new Error('Snapshot not found');
    
    // Clear current data
    await this.clear('objects');
    await this.clear('relationships');
    await this.clear('boards');
    
    // Restore snapshot data
    for (const obj of snapshot.data.objects) {
      await this.put('objects', obj);
    }
    for (const rel of snapshot.data.relationships) {
      await this.put('relationships', rel);
    }
    for (const board of snapshot.data.boards) {
      await this.put('boards', board);
    }
    
    return snapshot;
  }

  /**
   * Dump object stores into a plain object for backup/export.
   *
   * Note: `appState` is intentionally EXCLUDED — it is global (not per-project)
   * app state, so exporting/importing it would leak or clobber settings across
   * projects. We only back up the content stores.
   * @returns {Promise<Record<string, any[]>>}
   */
  async exportAll(projectId = null) {
    if (!this.db) return {};
    const stores = ['objects', 'relationships', 'boards'];
    const dump = {};
    for (const name of stores) {
      try { dump[name] = await this.getAll(name); }
      catch (_) { dump[name] = []; }
    }
    // Blobs are per-project. When a projectId is given, export only that
    // project's blobs (keyed `${projectId}:...`); otherwise export them all.
    if (this.db.objectStoreNames.contains('blobs')) {
      try {
        const all = await this.getAll('blobs');
        dump.blobs = projectId
          ? (all || []).filter((b) => b && typeof b.key === 'string' && b.key.startsWith(`${projectId}:`))
          : (all || []);
      } catch (_) { dump.blobs = []; }
    }
    return dump;
  }

  /**
   * Restore object stores from an exportAll() dump.
   *
   * IMPORTANT: the object stores are NOT namespaced per project (unlike
   * localStorage). To honor the "import never overwrites your existing data"
   * guarantee, every imported record is given a FRESH id, and relationship
   * source/target ids are remapped to the new ids. This makes import purely
   * additive — it can never collide with or overwrite existing records.
   *
   * `appState` is never imported (it is excluded from export too).
   * @param {Record<string, any[]>} dump
   * @returns {Promise<number>} number of records imported
   */
  async importAll(dump, targetProjectId = null) {
    if (!this.db || !dump || typeof dump !== 'object') return 0;

    const idMap = new Map(); // oldId -> newId
    const freshId = (oldId) => {
      if (oldId == null) return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      if (!idMap.has(oldId)) idMap.set(oldId, `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`);
      return idMap.get(oldId);
    };

    let count = 0;

    // Pass 1: objects + boards get fresh ids (record the mapping).
    for (const name of ['objects', 'boards']) {
      const records = dump[name];
      if (!Array.isArray(records) || !this.db.objectStoreNames.contains(name)) continue;
      for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;
        try {
          await this.put(name, { ...rec, id: freshId(rec.id) });
          count++;
        } catch (_) { /* skip bad record */ }
      }
    }

    // Pass 2: relationships remap source/target to the new object ids.
    const rels = dump.relationships;
    if (Array.isArray(rels) && this.db.objectStoreNames.contains('relationships')) {
      for (const rel of rels) {
        if (!rel || typeof rel !== 'object') continue;
        try {
          await this.put('relationships', {
            ...rel,
            id: freshId(rel.id),
            sourceId: idMap.get(rel.sourceId) || rel.sourceId,
            targetId: idMap.get(rel.targetId) || rel.targetId,
          });
          count++;
        } catch (_) { /* skip bad record */ }
      }
    }

    // Blobs: re-key from their original project prefix to the NEW project id so
    // an imported planet/map's texture lands in the freshly-created project
    // (file import always creates a new project). If no target id is given we
    // keep keys verbatim (still additive — put won't collide across projects).
    if (this.db.objectStoreNames.contains('blobs') && Array.isArray(dump.blobs)) {
      for (const b of dump.blobs) {
        if (!b || typeof b.key !== 'string') continue;
        let key = b.key;
        if (targetProjectId) {
          const rest = b.key.split(':').slice(1).join(':'); // drop old projectId
          key = `${targetProjectId}:${rest}`;
        }
        try { await this.put('blobs', { key, value: b.value }); count++; } catch (_) { /* skip */ }
      }
    }

    return count;
  }

  /**
   * REPLACE object stores from an exportAll() dump, preserving ids verbatim.
   *
   * Unlike importAll (which is additive with fresh ids, for user file import),
   * this is for the SYNC path: the incoming snapshot IS the authoritative state
   * for this project, so we clear the content stores and write the records
   * as-is. This keeps sync idempotent — pulling the same revision twice yields
   * the same store contents instead of duplicating everything.
   *
   * `appState` is left untouched (it is global, never part of a snapshot).
   * @param {Record<string, any[]>} dump
   * @returns {Promise<number>} number of records written
   */
  async replaceAll(dump) {
    if (!this.db || !dump || typeof dump !== 'object') return 0;
    let count = 0;
    for (const name of ['objects', 'relationships', 'boards']) {
      if (!this.db.objectStoreNames.contains(name)) continue;
      try { await this.clear(name); } catch (_) { /* ignore */ }
      const records = dump[name];
      if (!Array.isArray(records)) continue;
      for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;
        try { await this.put(name, rec); count++; } catch (_) { /* skip bad record */ }
      }
    }
    // Blobs are per-project (keyed `${projectId}:...`). Replace ONLY the blobs
    // for the project ids present in this snapshot — clearing the whole store
    // would wipe other projects' textures. Keys are preserved verbatim.
    if (this.db.objectStoreNames.contains('blobs') && Array.isArray(dump.blobs)) {
      const incomingPids = new Set(
        dump.blobs
          .map((b) => (b && typeof b.key === 'string' ? b.key.split(':')[0] : null))
          .filter(Boolean),
      );
      for (const pid of incomingPids) {
        const existing = await this.getBlobsByPrefix(`${pid}:`);
        for (const b of existing) { try { await this.delete('blobs', b.key); } catch (_) { /* ignore */ } }
      }
      for (const b of dump.blobs) {
        if (!b || typeof b.key !== 'string') continue;
        try { await this.put('blobs', { key: b.key, value: b.value }); count++; } catch (_) { /* skip */ }
      }
    }
    return count;
  }

  // Listeners for save status
  onStatusChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(status) {
    this.listeners.forEach(fn => fn(status));
  }
}

export const db = new LoreForgeDB();
