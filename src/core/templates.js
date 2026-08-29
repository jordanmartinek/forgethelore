/**
 * LoreForge Planner - Genre Starter Templates
 *
 * PHASE 3 (#19): the built-in demo is sci-fi/space-opera. New authors starting a
 * fantasy or mystery project faced a blank slate. These lightweight templates
 * seed a new project with a few genre-appropriate factions and board pieces so
 * the board, graph, and analysis have something to work with immediately.
 *
 * Templates write through the repo into the new project's namespace. They are
 * intentionally small — a scaffold, not a finished world.
 */

import { generateId } from './objects.js';

/** @type {Record<string, {label:string, icon:string, description:string, build:()=>object}>} */
export const TEMPLATES = {
  blank: {
    label: 'Blank',
    icon: '📄',
    description: 'Start from nothing.',
    build: () => ({ factions: [], pieces: [], conflictLines: [] }),
  },

  fantasy: {
    label: 'Fantasy Epic',
    icon: '⚔️',
    description: 'Warring kingdoms, an ancient order, and a looming dark power.',
    build: () => {
      const f1 = 'f_' + generateId();
      const f2 = 'f_' + generateId();
      const f3 = 'f_' + generateId();
      const hero = 'p_' + generateId();
      const villain = 'p_' + generateId();
      const ally = 'p_' + generateId();
      return {
        factions: [
          { id: f1, name: 'The Crown Realm', color: '#f59e0b', icon: '👑', goal: 'Hold the throne against all claimants', goalProgress: 55 },
          { id: f2, name: 'The Shadow Court', color: '#7c3aed', icon: '🌑', goal: 'Return the old power to the world', goalProgress: 40 },
          { id: f3, name: 'The Free Cities', color: '#22c55e', icon: '🏰', goal: 'Stay independent of the Crown', goalProgress: 30 },
        ],
        pieces: [
          { id: hero, name: 'The Young Heir', faction: f1, type: 'king', role: 'protagonist', position: { row: 7, col: 3 }, momentum: 'rising', goal: 'Prove worthy of the throne', hiddenGoal: '', resources: { political: 60, military: 45, economic: 40, knowledge: 35 } },
          { id: villain, name: 'The Shadow Queen', faction: f2, type: 'queen', role: 'antagonist', position: { row: 0, col: 4 }, momentum: 'rising', goal: 'Break the ancient seal', hiddenGoal: 'Become the new dark power herself', resources: { political: 50, military: 60, economic: 30, knowledge: 90 } },
          { id: ally, name: 'The Merchant Prince', faction: f3, type: 'bishop', role: 'ally', position: { row: 5, col: 6 }, momentum: 'stable', goal: 'Keep the trade routes open', hiddenGoal: '', resources: { political: 70, military: 20, economic: 95, knowledge: 40 } },
        ],
        conflictLines: [
          { from: hero, to: villain, type: 'opposition' },
          { from: hero, to: ally, type: 'alliance' },
        ],
      };
    },
  },

  mystery: {
    label: 'Mystery / Noir',
    icon: '🔍',
    description: 'A detective, a victim, and a web of suspects with secrets.',
    build: () => {
      const f1 = 'f_' + generateId();
      const f2 = 'f_' + generateId();
      const detective = 'p_' + generateId();
      const fixer = 'p_' + generateId();
      const witness = 'p_' + generateId();
      return {
        factions: [
          { id: f1, name: 'The Investigators', color: '#3b82f6', icon: '🕵️', goal: 'Uncover the truth', goalProgress: 20 },
          { id: f2, name: 'The Conspiracy', color: '#ef4444', icon: '🎭', goal: 'Keep the secret buried', goalProgress: 65 },
        ],
        pieces: [
          { id: detective, name: 'The Detective', faction: f1, type: 'king', role: 'protagonist', position: { row: 7, col: 3 }, momentum: 'stable', goal: 'Solve the case', hiddenGoal: '', resources: { political: 30, military: 40, economic: 25, knowledge: 70 } },
          { id: fixer, name: 'The Fixer', faction: f2, type: 'rook', role: 'antagonist', position: { row: 1, col: 4 }, momentum: 'rising', goal: 'Silence loose ends', hiddenGoal: 'Is protecting someone above them', resources: { political: 80, military: 50, economic: 70, knowledge: 40 } },
          { id: witness, name: 'The Witness', faction: f1, type: 'pawn', role: 'ally', position: { row: 5, col: 5 }, momentum: 'falling', goal: 'Survive long enough to talk', hiddenGoal: 'Knows more than they admit', resources: { political: 10, military: 10, economic: 20, knowledge: 60 } },
        ],
        conflictLines: [
          { from: detective, to: fixer, type: 'opposition' },
          { from: fixer, to: witness, type: 'manipulation' },
        ],
      };
    },
  },

  scifi: {
    label: 'Space Opera',
    icon: '🚀',
    description: 'Rival powers contest a galaxy-changing discovery.',
    build: () => {
      const f1 = 'f_' + generateId();
      const f2 = 'f_' + generateId();
      const warlord = 'p_' + generateId();
      const captain = 'p_' + generateId();
      return {
        factions: [
          { id: f1, name: 'The Ascendancy', color: '#ef4444', icon: '🦅', goal: 'Control the discovery', goalProgress: 55 },
          { id: f2, name: 'The Free Worlds', color: '#f59e0b', icon: '🌟', goal: 'Keep it out of any one hand', goalProgress: 30 },
        ],
        pieces: [
          { id: warlord, name: 'The Warlord', faction: f1, type: 'king', role: 'antagonist', position: { row: 0, col: 3 }, momentum: 'rising', goal: 'Weaponize the discovery', hiddenGoal: '', resources: { political: 70, military: 90, economic: 60, knowledge: 50 } },
          { id: captain, name: 'The Captain', faction: f2, type: 'knight', role: 'protagonist', position: { row: 6, col: 3 }, momentum: 'stable', goal: 'Unite the Free Worlds', hiddenGoal: '', resources: { political: 55, military: 45, economic: 30, knowledge: 40 } },
        ],
        conflictLines: [
          { from: captain, to: warlord, type: 'opposition' },
        ],
      };
    },
  },
};

/**
 * Apply a template's seed data into a project's localStorage namespace.
 * Writes directly (bypassing the active-project prefix) so it can seed a project
 * other than the currently active one.
 * @param {string} projectId
 * @param {string} templateId
 */
export function applyTemplate(projectId, templateId) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) return;
  const seed = tpl.build();
  const prefix = `loreforge_${projectId}_`;
  try {
    if (seed.factions && seed.factions.length) localStorage.setItem(prefix + 'factions', JSON.stringify(seed.factions));
    if (seed.pieces && seed.pieces.length) localStorage.setItem(prefix + 'pieces', JSON.stringify(seed.pieces));
    if (seed.conflictLines && seed.conflictLines.length) localStorage.setItem(prefix + 'conflictLines', JSON.stringify(seed.conflictLines));
  } catch (e) {
    console.warn('[LoreForge] Failed to apply template:', e.message);
  }
}
