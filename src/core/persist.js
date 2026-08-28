/**
 * LoreForge Planner - Simple Persistence Layer
 * Saves all module data to localStorage so changes survive page refreshes.
 * Each project has its own isolated data namespace.
 * 
 * Usage:
 *   const myArray = loadData('characters', defaultData);
 *   // ... modify myArray ...
 *   saveData('characters', myArray);
 */

let STORAGE_PREFIX = 'loreforge_proj1_';

/**
 * Set the active project (changes storage namespace)
 * Call this when switching projects — all subsequent load/save calls use the new prefix.
 */
export function setActiveProject(projectId) {
  STORAGE_PREFIX = `loreforge_${projectId}_`;
}

/**
 * Get the current active project ID from the prefix
 */
export function getActiveProjectId() {
  const match = STORAGE_PREFIX.match(/loreforge_(.+)_$/);
  return match ? match[1] : 'proj1';
}

/**
 * Save data to localStorage.
 * @returns {boolean} true if the write succeeded, false otherwise (e.g. quota).
 */
export function saveData(key, data) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('[LoreForge] Save failed for', key, e.message);
    return false;
  }
}

/**
 * Load data from localStorage, or return defaultData if nothing saved
 */
export function loadData(key, defaultData) {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[LoreForge] Load failed for', key, e.message);
  }
  return defaultData;
}

/**
 * Save data AND reflect the real result in the app's save indicator.
 *
 * This replaces the old per-module pattern of firing `saveStatus: 'saving'`
 * and then flipping to `'saved'` after a hardcoded 300ms timeout regardless of
 * whether the write actually succeeded. Now the indicator tells the truth:
 * `'saved'` only on a successful write, `'offline'` when the write fails
 * (e.g. localStorage quota exceeded), with a toast so the user is not left
 * silently losing data.
 *
 * @param {string} key
 * @param {*} data
 * @returns {boolean} whether the write succeeded
 */
export function persistState(key, data) {
  // Lazy imports to avoid any load-order/circular concerns at module init.
  let appStore, toastError;
  try { ({ appStore } = _deps); toastError = _deps.toastError; } catch (_) { /* deps not wired */ }

  if (appStore) appStore.setState({ saveStatus: 'saving' });
  const ok = saveData(key, data);
  if (appStore) {
    appStore.setState(ok
      ? { saveStatus: 'saved', lastSaved: Date.now() }
      : { saveStatus: 'offline' });
  }
  if (!ok && toastError) {
    toastError('Could not save — storage may be full. Export your project to avoid losing work.');
  }
  return ok;
}

// Dependency injection so persist.js stays free of hard UI/store imports and we
// avoid circular-import surprises. main.js wires this once at startup.
const _deps = { appStore: null, toastError: null };
export function wirePersistStatus({ appStore = null, toastError = null } = {}) {
  _deps.appStore = appStore;
  _deps.toastError = toastError;
}

/**
 * Clear all saved data for the current project
 */
export function clearProjectData() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
}

/**
 * Clear all saved data across all projects
 */
export function clearAllData() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('loreforge_'));
  keys.forEach(k => localStorage.removeItem(k));
}


// Auto-initialize from localStorage on module load
try {
  const savedProjectId = localStorage.getItem('loreforge_activeProjectId');
  if (savedProjectId) {
    STORAGE_PREFIX = `loreforge_${savedProjectId}_`;
  }
} catch(e) {}
