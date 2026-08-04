/**
 * LoreForge Planner - Simple Persistence Layer
 * Saves all module data to localStorage so changes survive page refreshes.
 * 
 * Usage:
 *   const myArray = loadData('characters', defaultData);
 *   // ... modify myArray ...
 *   saveData('characters', myArray);
 */

const STORAGE_PREFIX = 'loreforge_';

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
 * Clear all saved data (reset to defaults)
 */
export function clearAllData() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
}

/**
 * Auto-save helper: wraps an array so mutations trigger saves
 * Call scheduleSave() after any modification to the array
 */
export function createAutoSaver(key, dataArray) {
  let timer = null;
  return function scheduleSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveData(key, dataArray);
      timer = null;
    }, 300); // Debounce 300ms
  };
}
