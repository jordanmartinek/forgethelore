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
 * Save data to localStorage
 */
export function saveData(key, data) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.warn('[LoreForge] Save failed for', key, e.message);
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
