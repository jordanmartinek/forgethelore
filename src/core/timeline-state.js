/**
 * LoreForge Planner - Whole-World Temporal Engine
 *
 * Aggregates the per-entity progression engine (progression.js) into
 * WHOLE-WORLD state at any scene, and derives time-series used by the temporal
 * views (world time-scrubber, faction power chart, tension/pacing graph).
 *
 * Pure and dependency-injected where it matters: the scene-state functions take
 * pieces/scenes/relationships so they can be unit-tested with no DOM/storage.
 * Convenience wrappers read live data from the repo for the UI.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';
import { getArc, getRelationshipAtScene } from './progression.js';

/** Scenes sorted by their order field (ascending). */
export function orderedScenes(scenes) {
  return [...scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
}

const RESOURCE_KEYS = ['political', 'military', 'economic', 'knowledge'];

/**
 * Resource/momentum state for ONE piece at a scene, on a CONSISTENT scale.
 *
 * We deliberately do NOT use progression.getStateAtScene here: that function
 * anchors arc'd pieces at a fixed 50-per-axis base (=200) while returning the
 * authored resources for arc-less pieces, so summing across a faction mixes two
 * rulers. Instead we seed from the piece's OWN authored resources and apply the
 * arc's cumulative deltas up to the target scene — so every piece is measured
 * from its authored standing and faction power is comparable.
 *
 * @returns {{resources: object, momentum: string}}
 */
export function resourcesAtScene(piece, sceneId, scenes) {
  const base = {};
  for (const k of RESOURCE_KEYS) base[k] = Number(piece.resources?.[k] ?? 50);
  let momentum = piece.momentum || 'stable';

  const arc = getArc(piece.id);
  const target = scenes.find((s) => s.id === sceneId);
  if (arc && target) {
    for (const event of arc.events) {
      const evScene = scenes.find((s) => s.id === event.sceneId);
      if (!evScene) continue;
      if ((evScene.order || 0) > (target.order || 0)) break;
      for (const [key, delta] of Object.entries(event.resourceChanges || {})) {
        base[key] = Math.max(0, Math.min(100, (base[key] ?? 50) + delta));
      }
      if (event.momentumAfter) momentum = event.momentumAfter;
    }
  }
  return { resources: base, momentum: momentum || 'stable' };
}

/**
 * Compute every piece's resource/momentum state at a given scene (consistent scale).
 * @returns {Array<{piece:object, state:{resources:object, momentum:string}}>}
 */
export function piecesAtScene(sceneId, scenes, pieces) {
  return pieces.map((p) => ({ piece: p, state: resourcesAtScene(p, sceneId, scenes) }));
}

/**
 * Faction "power" at a scene = sum of its member pieces' total resources at
 * that scene. Returns a map factionId -> power and the contributing pieces.
 * @returns {Record<string, number>}
 */
export function factionPowerAtScene(sceneId, scenes, pieces) {
  const perPiece = piecesAtScene(sceneId, scenes, pieces);
  const power = {};
  for (const { piece, state } of perPiece) {
    const total = Object.values(state.resources || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    power[piece.faction] = (power[piece.faction] || 0) + total;
  }
  return power;
}

/**
 * Build faction power time-series across all scenes, for the stacked-area chart.
 * @returns {{labels:string[], series:Array<{name:string,color:string,values:number[]}>}}
 */
export function factionPowerSeries(scenes, pieces, factions) {
  const ordered = orderedScenes(scenes);
  const labels = ordered.map((s, i) => `S${s.order ?? i + 1}`);
  const series = factions.map((f) => ({
    name: f.name,
    color: f.color || '#6366f1',
    values: ordered.map((s) => factionPowerAtScene(s.id, scenes, pieces)[f.id] || 0),
  }));
  return { labels, series };
}

/**
 * Dramatic-tension score per scene, derived entirely from existing data:
 *   - magnitude of power shifts in the scene (bigger swings = more tension)
 *   - number of participants (more actors colliding = more tension)
 *   - conflict type weight (opposition/escalation > competition > alliance)
 *   - unresolved-mystery pressure at that point in the story
 * Normalized to 0..100. Returns per-scene scores + the ordered scenes.
 * @returns {{scenes:object[], scores:number[]}}
 */
export function tensionSeries(scenes) {
  const ordered = orderedScenes(scenes);

  const CONFLICT_WEIGHT = {
    opposition: 1.0, escalation: 1.1, competition: 0.7,
    manipulation: 0.8, alliance: 0.3, hidden: 0.6,
  };

  const raw = ordered.map((s) => {
    const shiftMag = s.powerShift
      ? Object.values(s.powerShift).reduce((sum, v) => sum + Math.abs(Number(v) || 0), 0)
      : 0;
    const participants = (s.participants || []).length;
    const typeW = CONFLICT_WEIGHT[s.conflictType] ?? 0.6;
    // Participants and power-shift magnitude are the dominant signals; conflict
    // type modulates them. (Kept purely per-scene so the curve reflects shape,
    // not a flat baseline.)
    return (shiftMag * 1.5 + participants * 6) * typeW;
  });

  // Normalize to 0..100 for a readable graph.
  const max = Math.max(1, ...raw);
  const scores = raw.map((v) => Math.round((v / max) * 100));
  return { scenes: ordered, scores };
}

/** Identify flat stretches (>= `run` consecutive low-tension scenes). */
export function flatStretches(scores, threshold = 30, run = 3) {
  const flags = [];
  let start = -1;
  for (let i = 0; i <= scores.length; i++) {
    const low = i < scores.length && scores[i] <= threshold;
    if (low && start === -1) start = i;
    if (!low && start !== -1) {
      if (i - start >= run) flags.push({ start, end: i - 1 });
      start = -1;
    }
  }
  return flags;
}

// ─── Live (repo-backed) convenience wrappers for the UI ──────────────────────

export function liveScenes() { return repo.list(Collections.SCENES); }
export function livePieces() { return repo.list(Collections.PIECES); }
export function liveFactions() { return repo.list(Collections.BOARD_FACTIONS); }
export function liveConflictLines() { return repo.list(Collections.CONFLICT_LINES); }
export function liveMysteries() { return repo.list(Collections.MYSTERIES); }

/**
 * Everything the world time-scrubber needs at one scene, read from live data.
 * @param {string} sceneId
 */
export function worldStateAtScene(sceneId) {
  const scenes = liveScenes();
  const pieces = livePieces();
  const factions = liveFactions();
  const rels = repo.list(Collections.RELATIONSHIPS);

  const pieceStates = piecesAtScene(sceneId, scenes, pieces);
  const power = factionPowerAtScene(sceneId, scenes, pieces);
  const relStates = rels.map((r) => ({ rel: r, dims: getRelationshipAtScene(r.id, sceneId, scenes) }));
  return { scenes: orderedScenes(scenes), pieces, factions, pieceStates, power, relStates };
}
