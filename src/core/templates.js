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
  applySeed(projectId, tpl.build());
}

/**
 * Write a seed object into a project's namespace. Shared by templates and the
 * procedural world generator. Includes optional scenes + a mystery.
 * @param {string} projectId
 * @param {{factions?:any[], pieces?:any[], conflictLines?:any[], scenes?:any[], mysteries?:any[]}} seed
 */
export function applySeed(projectId, seed) {
  const prefix = `loreforge_${projectId}_`;
  const put = (key, val) => { if (val && val.length) localStorage.setItem(prefix + key, JSON.stringify(val)); };
  try {
    put('factions', seed.factions);
    put('pieces', seed.pieces);
    put('conflictLines', seed.conflictLines);
    put('scenes', seed.scenes);
    put('mysteries', seed.mysteries);
  } catch (e) {
    console.warn('[LoreForge] Failed to apply seed:', e.message);
  }
}

// ─── #30 Procedural World Seeding ────────────────────────────────────────────

const WORLD_PARTS = {
  factionNoun: ['Dominion', 'Covenant', 'Collective', 'Syndicate', 'Order', 'Coalition', 'Ascendancy', 'Concord', 'Assembly', 'Remnant', 'Compact', 'Directorate'],
  factionAdj: ['Iron', 'Crimson', 'Silent', 'Radiant', 'Broken', 'Verdant', 'Obsidian', 'Golden', 'Hollow', 'Eternal', 'Azure', 'Ashen'],
  factionGoals: [
    'Unify the known world under one banner', 'Reclaim what was stolen from them',
    'Awaken a sleeping power', 'Preserve the old order at any cost',
    'Break free of an ancient debt', 'Control the one resource everyone needs',
    'Expose the lie the world is built on', 'Survive the coming cataclysm',
  ],
  given: ['Aeryn', 'Kael', 'Sable', 'Doran', 'Mira', 'Voss', 'Ryn', 'Talia', 'Corin', 'Zeya', 'Halden', 'Nyra', 'Orin', 'Sefa', 'Bram', 'Ilya'],
  epithet: ['the Undying', 'the Betrayer', 'the Just', 'the Veiled', 'Ironhand', 'the Exile', 'the Kingmaker', 'the Last', 'Ashborn', 'the Silver Tongue'],
  roles: ['king', 'queen', 'rook', 'bishop', 'knight'],
  charRoles: ['protagonist', 'antagonist', 'ally', 'henchman', 'opponent'],
  colors: ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316'],
  icons: ['⚔️', '👑', '🐉', '🔥', '🌑', '🛡️', '🦅', '🌟', '🕷️', '🐺'],
  mysteryQuestions: [
    'Who really rules from the shadows?', 'What happened to the vanished kingdom?',
    'What is the true source of the great power?', 'Which leader is not who they claim?',
    'What was sealed away, and why?',
  ],
};

/** Small seeded RNG (mulberry32) so generation is reproducible when desired. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a COHERENT starter world: factions with opposing goals, characters
 * distributed among them (each faction gets a leader + members), conflict lines
 * connecting rival leaders, one central mystery, and an opening scene.
 *
 * @param {object} [opts]
 * @param {number} [opts.factions]   number of factions (default 3)
 * @param {number} [opts.charsPerFaction] default 2
 * @param {number} [opts.seed]       RNG seed for reproducibility (default random)
 * @returns {{factions:any[], pieces:any[], conflictLines:any[], mysteries:any[], scenes:any[]}}
 */
export function generateWorld({ factions = 3, charsPerFaction = 2, seed } = {}) {
  const rng = makeRng(seed == null ? (Math.floor(Math.random() * 1e9)) : seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const rint = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const uid = (prefix) => `${prefix}_${Math.floor(rng() * 1e9).toString(36)}${Math.floor(rng() * 1e9).toString(36)}`;

  factions = Math.max(2, Math.min(6, factions));
  const usedGoals = new Set();
  const usedNames = new Set();
  const uniquePick = (arr, used) => { let v, guard = 0; do { v = pick(arr); guard++; } while (used.has(v) && guard < 30); used.add(v); return v; };

  const factionObjs = [];
  const pieceObjs = [];
  const leaderByFaction = {};

  for (let i = 0; i < factions; i++) {
    const fid = uid('f');
    const name = `The ${uniquePick(WORLD_PARTS.factionAdj, usedNames)} ${pick(WORLD_PARTS.factionNoun)}`;
    factionObjs.push({
      id: fid, name, color: WORLD_PARTS.colors[i % WORLD_PARTS.colors.length],
      icon: pick(WORLD_PARTS.icons), goal: uniquePick(WORLD_PARTS.factionGoals, usedGoals), goalProgress: rint(20, 70),
    });

    for (let j = 0; j < Math.max(1, charsPerFaction); j++) {
      const pid = uid('p');
      const isLeader = j === 0;
      // First faction leans protagonist, second antagonist, rest mixed.
      const role = isLeader
        ? (i === 0 ? 'protagonist' : i === 1 ? 'antagonist' : pick(WORLD_PARTS.charRoles))
        : pick(['ally', 'henchman', 'opponent']);
      const character = {
        id: pid,
        name: `${pick(WORLD_PARTS.given)} ${pick(WORLD_PARTS.epithet)}`,
        faction: fid,
        type: isLeader ? 'king' : pick(WORLD_PARTS.roles.slice(1)),
        role,
        position: { row: i % 8, col: (j * 2) % 8 },
        momentum: pick(['rising', 'stable', 'falling']),
        goal: pick(WORLD_PARTS.factionGoals),
        hiddenGoal: rng() < 0.4 ? 'Has an agenda that diverges from their faction' : '',
        resources: { political: rint(20, 90), military: rint(20, 90), economic: rint(20, 90), knowledge: rint(20, 90) },
      };
      pieceObjs.push(character);
      if (isLeader) leaderByFaction[fid] = pid;
    }
  }

  // Conflict lines: connect each faction leader to the next (a rivalry ring),
  // plus one alliance across the ring so it isn't all opposition.
  const conflictLines = [];
  const leaderIds = factionObjs.map((f) => leaderByFaction[f.id]).filter(Boolean);
  for (let i = 0; i < leaderIds.length; i++) {
    const a = leaderIds[i];
    const b = leaderIds[(i + 1) % leaderIds.length];
    if (a && b && a !== b) conflictLines.push({ from: a, to: b, type: 'opposition' });
  }
  if (leaderIds.length >= 3) conflictLines.push({ from: leaderIds[0], to: leaderIds[2], type: 'alliance' });

  // A central mystery.
  const mysteries = [{
    id: uid('m'), title: 'The Central Mystery', question: pick(WORLD_PARTS.mysteryQuestions),
    truth: 'To be discovered by the author.', status: 'active', importance: 'critical', progress: 10, clues: 1, redHerrings: 0,
  }];

  // An opening scene featuring the first two leaders in opposition.
  const scenes = [];
  if (leaderIds.length >= 2) {
    scenes.push({
      id: uid('sc'), title: 'The Opening Move', order: 1,
      summary: `${factionObjs[0].name} and ${factionObjs[1].name} make their first move against each other.`,
      participants: [leaderIds[0], leaderIds[1]], conflictType: 'opposition',
      powerShift: { [factionObjs[0].id]: 5, [factionObjs[1].id]: -5 }, status: 'active',
    });
  }

  return { factions: factionObjs, pieces: pieceObjs, conflictLines, mysteries, scenes };
}

/** Generate + apply a procedural world to a project. */
export function applyGeneratedWorld(projectId, opts) {
  applySeed(projectId, generateWorld(opts));
}
