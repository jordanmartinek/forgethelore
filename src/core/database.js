/**
 * LoreForge Planner - Local-First Database Layer
 * Uses IndexedDB for persistent storage with autosave
 */

const DB_NAME = 'loreforge-planner';
const DB_VERSION = 1;

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
      };
    });
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
  async exportAll() {
    if (!this.db) return {};
    const stores = ['objects', 'relationships', 'boards'];
    const dump = {};
    for (const name of stores) {
      try { dump[name] = await this.getAll(name); }
      catch (_) { dump[name] = []; }
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
  async importAll(dump) {
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
