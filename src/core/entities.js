/**
 * LoreForge Planner - Entity & Relationship Graph
 *
 * PHASE 2 GOAL (#2): replace the fragile, name-based cross-module linking that
 * previously relied on mutable globals (window.__loreforge_pieces / _scenes /
 * _factions / _factionData) with a single ID-addressable entity graph.
 *
 * Every "thing" in the world (character, faction, board piece, location,
 * scene, tech, …) is projected into a uniform Entity { id, type, name, module,
 * color, icon }. Relationships (from progression.js, conflict lines, and
 * name-based fields like character.faction) are projected into typed Edges
 * { source, target, type, label }.
 *
 * Backwards compatibility: a name resolver is provided so data that still links
 * by NAME (e.g. character.faction = "The Dominion") resolves to the right id
 * during the migration period. The old window.__loreforge_* globals are still
 * published by conflict-board for now, but modules should read through here.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';

const TYPE_META = {
  character: { icon: '👤', module: 'characters' },
  piece:     { icon: '♟️', module: 'conflict-board' },
  faction:   { icon: '⚔️', module: 'factions' },
  location:  { icon: '📍', module: 'locations' },
  scene:     { icon: '🎬', module: 'conflict-board' },
  species:   { icon: '🧬', module: 'species' },
  technology:{ icon: '⚙️', module: 'technology' },
  organization: { icon: '🏢', module: 'organizations' },
  religion:  { icon: '🕯️', module: 'religions' },
  mystery:   { icon: '🔍', module: 'mysteries' },
};

/**
 * @typedef {Object} Entity
 * @property {string} id
 * @property {string} type
 * @property {string} name
 * @property {string} module   Registry id to open when the entity is selected.
 * @property {string} icon
 * @property {string} [color]
 * @property {object} [raw]     The original record.
 */

/**
 * @typedef {Object} Edge
 * @property {string} source    Entity id.
 * @property {string} target    Entity id.
 * @property {string} type      Relationship type.
 * @property {string} [label]
 */

function pushEntity(map, ent) {
  if (!ent || !ent.id || map.has(ent.id)) return;
  const meta = TYPE_META[ent.type] || { icon: '📦', module: 'dashboard' };
  map.set(ent.id, {
    color: '#6366f1',
    icon: meta.icon,
    module: meta.module,
    ...ent,
  });
}

/**
 * Build the full entity map for the active project by projecting every relevant
 * collection into uniform entities.
 * @returns {Map<string, Entity>}
 */
export function buildEntityMap() {
  const map = new Map();

  // Board factions carry canonical colors used across modules.
  const boardFactions = repo.list(Collections.BOARD_FACTIONS);
  const factionColor = new Map(boardFactions.map((f) => [f.id, f.color]));
  boardFactions.forEach((f) =>
    pushEntity(map, { id: f.id, type: 'faction', name: f.name, color: f.color, raw: f }));

  // Standalone faction planner data (may duplicate names; keyed by its own id).
  repo.list(Collections.FACTIONS).forEach((f) =>
    pushEntity(map, { id: f.id, type: 'faction', name: f.name, color: f.color || '#6366f1', raw: f }));

  // Board pieces (the de-facto character/actor table for the strategic layer).
  repo.list(Collections.PIECES).forEach((p) =>
    pushEntity(map, { id: p.id, type: 'piece', name: p.name, color: factionColor.get(p.faction) || '#6366f1', raw: p }));

  // Character planner entries.
  repo.list(Collections.CHARACTERS).forEach((c) =>
    pushEntity(map, { id: c.id, type: 'character', name: c.name, color: c.color || '#a855f7', raw: c }));

  // Scenes.
  repo.list(Collections.SCENES).forEach((s) =>
    pushEntity(map, { id: s.id, type: 'scene', name: s.title || 'Untitled Scene', color: '#64748b', raw: s }));

  // World collections that are naturally node-like.
  const simple = [
    [Collections.LOCATIONS, 'location', '#22c55e'],
    [Collections.SPECIES, 'species', '#84cc16'],
    [Collections.TECHNOLOGIES, 'technology', '#06b6d4'],
    [Collections.ORGANIZATIONS, 'organization', '#f59e0b'],
    [Collections.RELIGIONS, 'religion', '#eab308'],
    [Collections.MYSTERIES, 'mystery', '#ec4899'],
  ];
  for (const [coll, type, color] of simple) {
    repo.list(coll).forEach((r) =>
      pushEntity(map, { id: r.id, type, name: r.name || r.title || 'Untitled', color, raw: r }));
  }

  return map;
}

/**
 * Resolve a NAME to an entity id (case-insensitive), preferring a given type.
 * Used to migrate name-based links (character.faction = "The Dominion") to ids.
 * @param {Map<string,Entity>} map
 * @param {string} name
 * @param {string} [preferType]
 * @returns {string|null}
 */
export function resolveIdByName(map, name, preferType) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  let fallback = null;
  for (const ent of map.values()) {
    if (ent.name && ent.name.toLowerCase() === lower) {
      if (!preferType || ent.type === preferType) return ent.id;
      if (!fallback) fallback = ent.id;
    }
  }
  return fallback;
}

/**
 * Build typed edges between entities from every available relationship source.
 * @param {Map<string,Entity>} map
 * @returns {Edge[]}
 */
export function buildEdges(map) {
  const edges = [];
  const has = (id) => id && map.has(id);
  const add = (source, target, type, label) => {
    if (has(source) && has(target) && source !== target) edges.push({ source, target, type, label });
  };

  // 1) Progression relationships (already id-based -> board pieces).
  repo.list(Collections.RELATIONSHIPS).forEach((r) =>
    add(r.sourceId, r.targetId, r.type || 'related', r.type));

  // 2) Conflict lines between pieces (id-based).
  repo.list(Collections.CONFLICT_LINES).forEach((l) =>
    add(l.from, l.to, l.type || 'conflict', l.type));

  // 3) Piece -> faction membership (piece.faction is a faction id).
  repo.list(Collections.PIECES).forEach((p) =>
    add(p.id, p.faction, 'member_of', 'member of'));

  // 4) Name-based links from world modules, resolved to ids.
  repo.list(Collections.CHARACTERS).forEach((c) => {
    if (c.faction) {
      const fid = resolveIdByName(map, c.faction, 'faction');
      add(c.id, fid, 'member_of', 'member of');
    }
  });

  // 5) Scene participants (ids referencing pieces).
  repo.list(Collections.SCENES).forEach((s) => {
    (s.participants || []).forEach((pid) => add(s.id, pid, 'features', 'features'));
  });

  return edges;
}

/**
 * Convenience: build the whole graph in one call.
 * @returns {{ entities: Entity[], edges: Edge[], map: Map<string,Entity> }}
 */
export function buildGraph() {
  const map = buildEntityMap();
  const edges = buildEdges(map);
  return { entities: [...map.values()], edges, map };
}

/**
 * Compatibility accessors that replace the window.__loreforge_* globals.
 * Prefer these over touching the globals directly.
 */
export function getPieces() { return repo.list(Collections.PIECES); }
export function getScenes() { return repo.list(Collections.SCENES); }
export function getBoardFactions() { return repo.list(Collections.BOARD_FACTIONS); }
export function getFactionData() { return repo.list(Collections.FACTIONS); }
