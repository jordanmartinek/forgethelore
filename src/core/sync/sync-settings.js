/**
 * LoreForge Planner - Cloud Sync Settings (Bring Your Own Backend)
 *
 * Stores the user's optional sync configuration locally (like the AI settings).
 * With sync off, the app is exactly as before — fully local, no network. Turn
 * it on by choosing a mode and (for REST) providing a backend URL + optional key.
 */

const STORAGE_KEY = 'loreforge_sync_settings';

/**
 * @typedef {Object} SyncSettings
 * @property {boolean} enabled
 * @property {'rest'|'local'} mode   'rest' = BYO REST backend; 'local' = same-browser demo store.
 * @property {string} baseUrl
 * @property {string} apiKey
 * @property {boolean} autoSync      Push automatically on change (debounced) vs. manual only.
 */

/** @returns {SyncSettings} */
export function getSyncSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        enabled: !!s.enabled,
        mode: s.mode === 'local' ? 'local' : 'rest',
        baseUrl: s.baseUrl || '',
        apiKey: s.apiKey || '',
        autoSync: s.autoSync !== false,
      };
    }
  } catch (_) { /* fall through */ }
  return { enabled: false, mode: 'rest', baseUrl: '', apiKey: '', autoSync: true };
}

/** @param {Partial<SyncSettings>} partial */
export function saveSyncSettings(partial) {
  const next = { ...getSyncSettings(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearSyncSettings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
}

/** Is sync configured well enough to run? */
export function isSyncConfigured() {
  const s = getSyncSettings();
  if (!s.enabled) return false;
  if (s.mode === 'local') return true;
  return Boolean(s.baseUrl);
}
