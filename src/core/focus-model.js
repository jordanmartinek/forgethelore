/**
 * LoreForge Planner - Focus / Typewriter Mode Model (#16)
 *
 * Pure helpers backing the distraction-free writing overlay. The overlay itself
 * (fullscreen editor, typewriter scrolling, context side-rail) lives in the
 * module layer; the testable logic lives here:
 *
 *   - session progress math (words written this session, delta vs. a goal)
 *   - the "context rail" projection: given the scene being edited and the wider
 *     world, surface the handful of entities the author most likely needs at a
 *     glance (participants first, then same-location characters/factions).
 */

import { countWords } from './format.js';

/**
 * Compute live session stats for the focus editor.
 *
 * @param {string} startText   The scene content when the session began.
 * @param {string} currentText The scene content right now.
 * @param {number} [goal]      Optional word goal for the session.
 * @param {number} [startedAt] Optional epoch ms when the session began.
 * @param {number} [now]       Optional current epoch ms (injectable for tests).
 * @returns {{
 *   currentWords:number, startWords:number, added:number,
 *   goal:number, goalPct:number, goalMet:boolean,
 *   minutes:number, wpm:number,
 * }}
 */
export function sessionStats(startText, currentText, goal = 0, startedAt = 0, now = Date.now()) {
  const startWords = countWords(startText || '');
  const currentWords = countWords(currentText || '');
  const added = Math.max(0, currentWords - startWords);
  const g = Number.isFinite(goal) && goal > 0 ? goal : 0;
  const goalPct = g > 0 ? Math.min(100, Math.round((added / g) * 100)) : 0;
  const minutes = startedAt > 0 ? Math.max(0, (now - startedAt) / 60000) : 0;
  const wpm = minutes >= 0.5 ? Math.round(added / minutes) : 0;
  return {
    currentWords,
    startWords,
    added,
    goal: g,
    goalPct,
    goalMet: g > 0 && added >= g,
    minutes: Math.floor(minutes),
    wpm,
  };
}

/**
 * Build the context rail for a scene being written.
 *
 * Ranks entities by likely relevance so the author keeps names/goals in view
 * without leaving the editor:
 *   1. Scene participants (the pieces actually in this scene), in order.
 *   2. Characters/pieces sharing the scene's location.
 *   3. Factions represented by the above.
 *
 * @param {{ participants?:string[], location?:string }} scene
 * @param {{
 *   pieces?: Array<{id:string,name:string,faction?:string,goal?:string,role?:string}>,
 *   factions?: Array<{id:string,name:string,color?:string,goal?:string}>,
 *   locations?: Array<{id:string,name:string,faction?:string}>,
 * }} world
 * @param {number} [limit]  Max number of character entries in the rail.
 * @returns {{
 *   characters: Array<{id:string,name:string,role:string,goal:string,color:string,reason:string}>,
 *   factions: Array<{id:string,name:string,color:string,goal:string}>,
 *   location: {id:string,name:string}|null,
 * }}
 */
export function contextRail(scene, world = {}, limit = 8) {
  const pieces = Array.isArray(world.pieces) ? world.pieces : [];
  const factions = Array.isArray(world.factions) ? world.factions : [];
  const locations = Array.isArray(world.locations) ? world.locations : [];

  const factionById = new Map(factions.map((f) => [f.id, f]));
  const pieceById = new Map(pieces.map((p) => [p.id, p]));

  const chosen = new Map(); // id -> { entry, rank }
  const addPiece = (p, reason, rank) => {
    if (!p || !p.id || chosen.has(p.id)) return;
    const f = factionById.get(p.faction);
    chosen.set(p.id, {
      rank,
      entry: {
        id: p.id,
        name: p.name || 'Unnamed',
        role: p.role || '',
        goal: p.goal || '',
        color: (f && f.color) || '#6366f1',
        reason,
      },
    });
  };

  // 1) Participants, preserving their scene order via a fractional rank.
  const parts = (scene && Array.isArray(scene.participants)) ? scene.participants : [];
  parts.forEach((pid, i) => addPiece(pieceById.get(pid), 'in this scene', 0 + i / 1000));

  // 2) Same-location characters.
  const locName = scene && scene.location ? String(scene.location).toLowerCase() : '';
  if (locName) {
    pieces.forEach((p) => {
      // Pieces don't carry a location, but locations carry a faction; match a
      // piece whose faction owns this location.
      const loc = locations.find((l) => String(l.name || '').toLowerCase() === locName);
      const locFactionName = loc ? String(loc.faction || '').toLowerCase() : '';
      const f = factionById.get(p.faction);
      if (f && String(f.name || '').toLowerCase() === locFactionName && locFactionName) {
        addPiece(p, 'holds this location', 1);
      }
    });
  }

  const characters = [...chosen.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, Math.max(0, limit))
    .map((c) => c.entry);

  // Factions represented by the chosen characters (dedup, keep order).
  const facOrder = [];
  const seenFac = new Set();
  for (const c of characters) {
    const p = pieceById.get(c.id);
    const f = p && factionById.get(p.faction);
    if (f && !seenFac.has(f.id)) {
      seenFac.add(f.id);
      facOrder.push({ id: f.id, name: f.name, color: f.color || '#6366f1', goal: f.goal || '' });
    }
  }

  const loc = locName ? locations.find((l) => String(l.name || '').toLowerCase() === locName) : null;

  return {
    characters,
    factions: facOrder,
    location: loc ? { id: loc.id, name: loc.name } : null,
  };
}
