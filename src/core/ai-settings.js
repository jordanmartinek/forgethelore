/**
 * LoreForge Planner - AI Settings (Bring Your Own Key)
 *
 * Stores the user's optional AI provider + API key locally. The key is global
 * (applies to all projects) and lives only in this browser's localStorage; it
 * is only ever sent to the provider the user selected (see core/ai.js).
 */

const STORAGE_KEY = 'loreforge_ai_settings';

/**
 * @typedef {Object} AISettings
 * @property {string} provider  'openai' | 'anthropic' | ''
 * @property {string} apiKey
 * @property {string} model
 */

/** @returns {AISettings} */
export function getAISettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { provider: s.provider || '', apiKey: s.apiKey || '', model: s.model || '' };
    }
  } catch (_) { /* fall through */ }
  return { provider: '', apiKey: '', model: '' };
}

/** @param {Partial<AISettings>} partial */
export function saveAISettings(partial) {
  const next = { ...getAISettings(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearAISettings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
}
