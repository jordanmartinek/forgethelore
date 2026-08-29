/**
 * LoreForge Planner - Interactive Map Model (#22)
 *
 * Pure, DOM-free geometry/state helpers for the world map. The map itself is
 * rendered as inline SVG by the module layer (no chart library). This file
 * answers two questions deterministically so they can be unit-tested:
 *
 *   1. WHERE do things sit? Locations get stable pin coordinates. Rather than
 *      forcing the author to place every pin by hand, we derive a deterministic
 *      layout from each location's id (hash → position) unless an explicit
 *      { mapX, mapY } has been saved. This keeps pins stable across reloads and
 *      never jumps around when unrelated data changes.
 *
 *   2. WHO controls territory over TIME? Faction "power" evolves scene by scene
 *      via each board scene's `powerShift: { [factionId]: delta }`. We fold the
 *      shifts in scene order to produce a normalized control share per faction
 *      at every step, which the module animates with a time scrubber.
 */

/** Deterministic 32-bit string hash (FNV-1a style). Stable across runs. */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic pin position in a 0..1 normalized space for a location.
 * Explicit saved coordinates win; otherwise derive from the id hash. A second
 * hash channel keeps x and y independent so pins don't fall on a diagonal.
 *
 * @param {{id:string, mapX?:number, mapY?:number}} loc
 * @returns {{ x:number, y:number }}  Normalized 0..1 coordinates.
 */
export function pinPosition(loc) {
  if (loc && Number.isFinite(loc.mapX) && Number.isFinite(loc.mapY)) {
    return { x: clamp01(loc.mapX), y: clamp01(loc.mapY) };
  }
  const hMatch = hashString((loc && loc.id) || 'loc');
  const hy = hashString('y:' + ((loc && loc.id) || 'loc'));
  // Inset from the edges (0.06..0.94) so pins/labels aren't clipped.
  const x = 0.06 + (hMatch % 10000) / 10000 * 0.88;
  const y = 0.06 + (hy % 10000) / 10000 * 0.88;
  return { x, y };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Map each location to a faction color/id by matching its `faction` field
 * (a NAME string in the location planner) against the board factions. Unmatched
 * or neutral locations get a neutral color.
 *
 * @param {Array<{id:string, name?:string, faction?:string}>} locations
 * @param {Array<{id:string, name:string, color?:string}>} factions
 * @param {string} [neutralColor]
 * @returns {Array<{ id:string, name:string, factionId:string|null, color:string, x:number, y:number }>}
 */
export function placePins(locations, factions, neutralColor = '#6b5c48') {
  const byName = new Map(
    (Array.isArray(factions) ? factions : []).map((f) => [String(f.name || '').toLowerCase(), f]),
  );
  return (Array.isArray(locations) ? locations : [])
    .filter((l) => l && l.id)
    .map((l) => {
      const f = byName.get(String(l.faction || '').toLowerCase());
      const pos = pinPosition(l);
      return {
        id: l.id,
        name: l.name || 'Unnamed',
        factionId: f ? f.id : null,
        color: f && f.color ? f.color : neutralColor,
        x: pos.x,
        y: pos.y,
      };
    });
}

/**
 * Territory control over time.
 *
 * Starts each faction at a baseline power (its `goalProgress` if present, else
 * a flat 50) and folds in `powerShift` deltas scene by scene in `order`. At
 * every step it emits each faction's NORMALIZED share of total positive power,
 * so the numbers read as "% of the map controlled" and always sum to ~100.
 *
 * @param {Array<{id:string, order?:number, powerShift?:Record<string,number>}>} scenes
 * @param {Array<{id:string, name:string, color?:string, goalProgress?:number}>} factions
 * @returns {{
 *   factions: Array<{id:string,name:string,color:string}>,
 *   steps: Array<{
 *     order:number, sceneId:string|null, title:string,
 *     share: Record<string, number>,   // factionId -> 0..100
 *     raw: Record<string, number>,     // factionId -> clamped power
 *   }>,
 * }}
 */
export function territoryOverTime(scenes, factions) {
  const facList = (Array.isArray(factions) ? factions : []).filter((f) => f && f.id);
  const power = new Map(facList.map((f) => [f.id, Number.isFinite(f.goalProgress) ? f.goalProgress : 50]));

  const ordered = (Array.isArray(scenes) ? scenes : [])
    .filter((s) => s)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const steps = [];
  const snapshot = (order, sceneId, title) => {
    const raw = {};
    let totalPos = 0;
    for (const f of facList) {
      const v = Math.max(0, power.get(f.id) || 0);
      raw[f.id] = v;
      totalPos += v;
    }
    const share = {};
    for (const f of facList) {
      share[f.id] = totalPos > 0 ? Math.round((raw[f.id] / totalPos) * 100) : Math.round(100 / (facList.length || 1));
    }
    steps.push({ order, sceneId, title, share, raw });
  };

  // Step 0: the starting state before any scene resolves.
  snapshot(0, null, 'Start');

  ordered.forEach((scene, idx) => {
    const shift = scene.powerShift && typeof scene.powerShift === 'object' ? scene.powerShift : {};
    for (const [fid, delta] of Object.entries(shift)) {
      if (power.has(fid) && Number.isFinite(delta)) {
        power.set(fid, (power.get(fid) || 0) + delta);
      }
    }
    const order = Number.isFinite(scene.order) ? scene.order : idx + 1;
    snapshot(order, scene.id, scene.title || `Scene ${order}`);
  });

  return {
    factions: facList.map((f) => ({ id: f.id, name: f.name, color: f.color || '#6366f1' })),
    steps,
  };
}
