/**
 * LoreForge Planner - Sync Backend Interface + Implementations
 *
 * A sync backend is a small key-value store of project snapshots with a
 * revision number for optimistic concurrency. The engine (sync-engine.js) only
 * ever talks to this interface, so backends are pluggable:
 *   - LocalMockBackend: in-memory (tests) or localStorage-backed (a second
 *     "device" simulation). No network — used for testing and offline demos.
 *   - RestBackend: a generic REST/Supabase-compatible backend the user supplies
 *     (bring-your-own, like the AI layer). No infra required from us.
 *
 * Contract — every backend implements:
 *   async get(projectId)            -> { rev, snapshot, updatedAt } | null
 *   async put(projectId, snapshot, baseRev) -> { rev, updatedAt }
 *          Must reject with a { conflict: true, remote } shaped error if the
 *          stored rev !== baseRev (someone else wrote since we last pulled).
 *   async listProjects()            -> [{ projectId, rev, updatedAt, name }]
 *
 * `rev` is an opaque, monotonically-increasing token (we use integers).
 */

/** Error thrown on optimistic-concurrency conflict. */
export class ConflictError extends Error {
  constructor(remote) {
    super('Sync conflict: remote revision is newer');
    this.name = 'ConflictError';
    this.conflict = true;
    this.remote = remote; // { rev, snapshot, updatedAt }
  }
}

/**
 * In-memory / localStorage-backed backend. With no store passed it is pure
 * in-memory (ideal for tests). Pass a Storage-like object to simulate a shared
 * "cloud" across two engine instances in a test, or to persist locally.
 */
export class LocalMockBackend {
  /** @param {{store?: Map<string,string>, latencyMs?: number}} [opts] */
  constructor({ store = new Map(), latencyMs = 0 } = {}) {
    this._store = store;
    this._latency = latencyMs;
  }

  async _delay() {
    if (this._latency) await new Promise((r) => setTimeout(r, this._latency));
  }

  _read(projectId) {
    const raw = this._store.get(`sync:${projectId}`);
    return raw ? JSON.parse(raw) : null;
  }

  _write(projectId, record) {
    this._store.set(`sync:${projectId}`, JSON.stringify(record));
  }

  async get(projectId) {
    await this._delay();
    return this._read(projectId);
  }

  async put(projectId, snapshot, baseRev) {
    await this._delay();
    const current = this._read(projectId);
    const currentRev = current ? current.rev : 0;
    // Optimistic concurrency: caller must have based their write on the latest.
    if (baseRev !== currentRev) {
      throw new ConflictError(current);
    }
    const record = {
      rev: currentRev + 1,
      snapshot,
      updatedAt: Date.now(),
      name: snapshot?._meta?.projectName || 'Untitled',
    };
    this._write(projectId, record);
    return { rev: record.rev, updatedAt: record.updatedAt };
  }

  async listProjects() {
    await this._delay();
    const out = [];
    for (const [key, raw] of this._store.entries()) {
      if (!key.startsWith('sync:')) continue;
      const rec = JSON.parse(raw);
      out.push({ projectId: key.slice(5), rev: rec.rev, updatedAt: rec.updatedAt, name: rec.name });
    }
    return out;
  }
}

/**
 * Generic REST backend (bring-your-own). Expects three endpoints under baseUrl:
 *   GET    {baseUrl}/{projectId}   -> 200 { rev, snapshot, updatedAt } | 404
 *   PUT    {baseUrl}/{projectId}   body { snapshot, baseRev }
 *                                  -> 200 { rev, updatedAt } | 409 { remote }
 *   GET    {baseUrl}               -> 200 [{ projectId, rev, updatedAt, name }]
 * An optional apiKey is sent as a Bearer token. This shape maps cleanly onto a
 * tiny serverless function, a Supabase Edge Function, or Firebase callable.
 *
 * NOTE: the live network path can't be exercised in the offline sandbox; it is
 * implemented against this documented contract and covered structurally. The
 * engine logic is fully tested against LocalMockBackend.
 */
export class RestBackend {
  /** @param {{baseUrl: string, apiKey?: string, fetchImpl?: typeof fetch}} opts */
  constructor({ baseUrl, apiKey = '', fetchImpl } = {}) {
    if (!baseUrl) throw new Error('RestBackend requires a baseUrl');
    this._base = baseUrl.replace(/\/+$/, '');
    this._key = apiKey;
    this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (!this._fetch) throw new Error('No fetch implementation available');
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this._key) h.Authorization = `Bearer ${this._key}`;
    return h;
  }

  async get(projectId) {
    const res = await this._fetch(`${this._base}/${encodeURIComponent(projectId)}`, { headers: this._headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Sync GET failed: HTTP ${res.status}`);
    return res.json();
  }

  async put(projectId, snapshot, baseRev) {
    const res = await this._fetch(`${this._base}/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify({ snapshot, baseRev }),
    });
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      throw new ConflictError(body.remote || null);
    }
    if (!res.ok) throw new Error(`Sync PUT failed: HTTP ${res.status}`);
    return res.json();
  }

  async listProjects() {
    const res = await this._fetch(this._base, { headers: this._headers() });
    if (!res.ok) throw new Error(`Sync list failed: HTTP ${res.status}`);
    return res.json();
  }
}
