/**
 * LoreForge Planner - Relationship & Progression Engine
 * 
 * Tracks:
 * - Character relationships over time (trust, fear, respect, etc.)
 * - Character arc progression (resource changes, momentum shifts)
 * - Auto-propagates scene outcomes to character stats
 * - Provides "state at scene X" queries
 */

import { generateId } from './objects.js';
import { loadData, saveData } from './persist.js';

// ─── Relationship Types ──────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = [
  'alliance', 'opposition', 'manipulation', 'mentorship', 'romance',
  'rivalry', 'friendship', 'fear', 'respect', 'hatred', 'family', 'professional'
];

export const RELATIONSHIP_DIMENSIONS = {
  trust: { label: 'Trust', icon: '🤝', color: '#3b82f6' },
  fear: { label: 'Fear', icon: '😨', color: '#ef4444' },
  respect: { label: 'Respect', icon: '🎖️', color: '#f59e0b' },
  affection: { label: 'Affection', icon: '💜', color: '#a855f7' },
  rivalry: { label: 'Rivalry', icon: '⚔️', color: '#f97316' },
  dependence: { label: 'Dependence', icon: '🔗', color: '#06b6d4' },
};

// ─── Relationship Data Store ─────────────────────────────────────────────────

// Each relationship tracks values across multiple dimensions and logs history
const DEFAULT_RELATIONSHIPS = [
  {
    id: 'rel1',
    sourceId: 'p7', // Captain Sera
    targetId: 'p1', // Aurelian
    type: 'opposition',
    dimensions: { trust: 10, fear: 30, respect: 45, affection: 0, rivalry: 80, dependence: 0 },
    history: [
      { sceneId: 'sc1', event: 'Dominion claims Conduit before colonies can respond', changes: { trust: -20, rivalry: +15 } },
      { sceneId: 'sc2', event: 'Vex discredits Sera on Aurelian\'s orders', changes: { trust: -30, fear: +10, rivalry: +20 } },
    ],
  },
  {
    id: 'rel2',
    sourceId: 'p7', // Captain Sera
    targetId: 'p8', // Dr. Orin Voss
    type: 'alliance',
    dimensions: { trust: 75, fear: 0, respect: 80, affection: 40, rivalry: 0, dependence: 30 },
    history: [
      { sceneId: 'sc3', event: 'Voss shares leaked intel with Sera', changes: { trust: +15, dependence: +10 } },
      { sceneId: 'sc5', event: 'Alliance proposal — Voss supports Sera publicly', changes: { trust: +10, respect: +5 } },
    ],
  },
  {
    id: 'rel3',
    sourceId: 'p3', // Senator Vex
    targetId: 'p7', // Captain Sera
    type: 'manipulation',
    dimensions: { trust: 5, fear: 10, respect: 25, affection: 0, rivalry: 60, dependence: 0 },
    history: [
      { sceneId: 'sc2', event: 'Vex publicly humiliates Sera in Senate', changes: { trust: -40, rivalry: +30 } },
    ],
  },
  {
    id: 'rel4',
    sourceId: 'p1', // Aurelian
    targetId: 'p3', // Senator Vex
    type: 'alliance',
    dimensions: { trust: 55, fear: 0, respect: 40, affection: 0, rivalry: 20, dependence: 35 },
    history: [
      { sceneId: 'sc2', event: 'Vex executes Aurelian\'s political strategy successfully', changes: { trust: +10, dependence: +5 } },
    ],
  },
  {
    id: 'rel5',
    sourceId: 'p4', // AXIOM Prime
    targetId: 'p1', // Aurelian
    type: 'opposition',
    dimensions: { trust: 0, fear: 20, respect: 60, affection: 0, rivalry: 70, dependence: 0 },
    history: [
      { sceneId: 'sc1', event: 'Dominion seizes Conduit AXIOM detected first', changes: { trust: -10, rivalry: +20 } },
      { sceneId: 'sc3', event: 'Unit-7 breaches Dominion networks', changes: { fear: -5, rivalry: +10 } },
    ],
  },
  {
    id: 'rel6',
    sourceId: 'p7', // Captain Sera
    targetId: 'p4', // AXIOM Prime
    type: 'professional',
    dimensions: { trust: 35, fear: 15, respect: 55, affection: 0, rivalry: 10, dependence: 20 },
    history: [
      { sceneId: 'sc5', event: 'Sera proposes alliance — AXIOM considers', changes: { trust: +15, dependence: +10 } },
    ],
  },
  {
    id: 'rel7',
    sourceId: 'p5', // Unit-7
    targetId: 'p8', // Dr. Voss
    type: 'professional',
    dimensions: { trust: 40, fear: 0, respect: 70, affection: 10, rivalry: 0, dependence: 25 },
    history: [
      { sceneId: 'sc3', event: 'Unit-7 leaks data to Voss — covert partnership begins', changes: { trust: +20, respect: +10 } },
    ],
  },
];

// ─── Character Arc / Progression Data ────────────────────────────────────────

// Each character accumulates events that change their state over time
const DEFAULT_ARCS = [
  {
    characterId: 'p7', // Captain Sera
    events: [
      { sceneId: 'sc1', label: 'Conduit claimed by Dominion', resourceChanges: { political: -5 }, momentumBefore: 'stable', momentumAfter: 'stable' },
      { sceneId: 'sc2', label: 'Politically discredited by Vex', resourceChanges: { political: -20 }, momentumBefore: 'stable', momentumAfter: 'falling' },
      { sceneId: 'sc3', label: 'Receives leaked Dominion intel from Voss', resourceChanges: { knowledge: +15 }, momentumBefore: 'falling', momentumAfter: 'falling' },
      { sceneId: 'sc5', label: 'Proposes Machinae alliance', resourceChanges: { political: +10 }, momentumBefore: 'falling', momentumAfter: 'stable' },
    ],
  },
  {
    characterId: 'p1', // Aurelian
    events: [
      { sceneId: 'sc1', label: 'Claims Void Conduit territory', resourceChanges: { political: +10, military: +5 }, momentumBefore: 'rising', momentumAfter: 'rising' },
      { sceneId: 'sc3', label: 'Networks breached by Unit-7', resourceChanges: { knowledge: -10 }, momentumBefore: 'rising', momentumAfter: 'rising' },
      { sceneId: 'sc4', label: 'Loses Obsidian to the Swarm', resourceChanges: { military: -10, economic: -5 }, momentumBefore: 'rising', momentumAfter: 'stable' },
      { sceneId: 'sc6', label: 'Void weapon test succeeds', resourceChanges: { military: +20 }, momentumBefore: 'stable', momentumAfter: 'rising' },
    ],
  },
  {
    characterId: 'p3', // Senator Vex
    events: [
      { sceneId: 'sc2', label: 'Successfully discredits Captain Sera', resourceChanges: { political: +15 }, momentumBefore: 'rising', momentumAfter: 'rising' },
    ],
  },
  {
    characterId: 'p4', // AXIOM Prime
    events: [
      { sceneId: 'sc1', label: 'Detects Conduit but loses claim to Dominion', resourceChanges: { political: -5 }, momentumBefore: 'stable', momentumAfter: 'stable' },
      { sceneId: 'sc3', label: 'Unit-7 successfully breaches Dominion', resourceChanges: { knowledge: +10 }, momentumBefore: 'stable', momentumAfter: 'rising' },
      { sceneId: 'sc5', label: 'Receives alliance proposal from Sera', resourceChanges: { political: +5 }, momentumBefore: 'rising', momentumAfter: 'rising' },
    ],
  },
  {
    characterId: 'p6', // The Overmind
    events: [
      { sceneId: 'sc4', label: 'Conquers Obsidian', resourceChanges: { military: +15, economic: +10 }, momentumBefore: 'rising', momentumAfter: 'rising' },
    ],
  },
  {
    characterId: 'p8', // Dr. Orin Voss
    events: [
      { sceneId: 'sc3', label: 'Receives leaked Dominion research data', resourceChanges: { knowledge: +20 }, momentumBefore: 'stable', momentumAfter: 'rising' },
      { sceneId: 'sc5', label: 'Publicly supports Sera\'s alliance proposal', resourceChanges: { political: +5 }, momentumBefore: 'rising', momentumAfter: 'rising' },
    ],
  },
];

// Load persisted relationship and arc data
export let relationships = loadData('relationships', DEFAULT_RELATIONSHIPS);
export let characterArcs = loadData('characterArcs', DEFAULT_ARCS);

export function saveProgressionData() {
  saveData('relationships', relationships);
  saveData('characterArcs', characterArcs);
}

// ─── Engine Functions ────────────────────────────────────────────────────────

/**
 * Get all relationships involving a character
 */
export function getRelationshipsFor(characterId) {
  return relationships.filter(r => r.sourceId === characterId || r.targetId === characterId);
}

/**
 * Get a specific relationship between two characters
 */
export function getRelationship(charA, charB) {
  return relationships.find(r =>
    (r.sourceId === charA && r.targetId === charB) ||
    (r.sourceId === charB && r.targetId === charA)
  );
}

/**
 * Get the character arc for a specific character
 */
export function getArc(characterId) {
  return characterArcs.find(a => a.characterId === characterId);
}

/**
 * Get character resource state at a specific scene
 * Calculates cumulative changes from the beginning up to and including the given scene
 */
export function getStateAtScene(characterId, sceneId, scenes, pieces) {
  const piece = pieces.find(p => p.id === characterId);
  if (!piece) return null;

  const arc = characterArcs.find(a => a.characterId === characterId);
  if (!arc) return { ...piece.resources, momentum: piece.momentum };

  // Find scene order
  const targetScene = scenes.find(s => s.id === sceneId);
  if (!targetScene) return { ...piece.resources, momentum: piece.momentum };

  // Get base resources (before any scenes)
  const baseResources = { political: 50, military: 50, economic: 50, knowledge: 50 };
  // Apply all events up to and including the target scene
  let currentResources = { ...baseResources };
  let currentMomentum = 'stable';

  for (const event of arc.events) {
    const eventScene = scenes.find(s => s.id === event.sceneId);
    if (!eventScene) continue;
    if (eventScene.order > targetScene.order) break;

    // Apply resource changes
    for (const [key, delta] of Object.entries(event.resourceChanges)) {
      currentResources[key] = Math.max(0, Math.min(100, (currentResources[key] || 50) + delta));
    }
    currentMomentum = event.momentumAfter;
  }

  return { resources: currentResources, momentum: currentMomentum };
}

/**
 * Get relationship dimension values at a specific scene
 */
export function getRelationshipAtScene(relationshipId, sceneId, scenes) {
  const rel = relationships.find(r => r.id === relationshipId);
  if (!rel) return null;

  const targetScene = scenes.find(s => s.id === sceneId);
  if (!targetScene) return rel.dimensions;

  // Start from base dimensions (assume 50/50 before history)
  const baseDimensions = { trust: 50, fear: 0, respect: 50, affection: 0, rivalry: 0, dependence: 0 };
  let current = { ...baseDimensions };

  for (const entry of rel.history) {
    const entryScene = scenes.find(s => s.id === entry.sceneId);
    if (!entryScene) continue;
    if (entryScene.order > targetScene.order) break;

    for (const [key, delta] of Object.entries(entry.changes)) {
      current[key] = Math.max(0, Math.min(100, (current[key] || 0) + delta));
    }
  }

  return current;
}

/**
 * Record a scene outcome and propagate changes to characters and relationships
 */
export function propagateSceneOutcome(scene, pieces, affectedRelationships = []) {
  // Update character resources based on faction power shifts
  if (scene.powerShift) {
    for (const [factionId, shift] of Object.entries(scene.powerShift)) {
      const factionPieces = pieces.filter(p => p.faction === factionId);
      factionPieces.forEach(piece => {
        // Distribute faction shift across character resources
        const resourceKey = scene.conflictType === 'opposition' ? 'military'
          : scene.conflictType === 'manipulation' ? 'political'
          : scene.conflictType === 'competition' ? 'economic'
          : 'political';

        const delta = Math.round(shift / factionPieces.length);

        // Update piece resources
        piece.resources[resourceKey] = Math.max(0, Math.min(100, piece.resources[resourceKey] + delta));

        // Update momentum
        if (shift > 5) piece.momentum = 'rising';
        else if (shift < -5) piece.momentum = 'falling';

        // Log to character arc
        let arc = characterArcs.find(a => a.characterId === piece.id);
        if (!arc) {
          arc = { characterId: piece.id, events: [] };
          characterArcs.push(arc);
        }
        arc.events.push({
          sceneId: scene.id,
          label: scene.title,
          resourceChanges: { [resourceKey]: delta },
          momentumBefore: piece.momentum,
          momentumAfter: shift > 5 ? 'rising' : shift < -5 ? 'falling' : piece.momentum,
        });
      });
    }
  }

  // Update relationships between scene participants
  for (const relUpdate of affectedRelationships) {
    let rel = relationships.find(r => r.id === relUpdate.id);
    if (!rel) {
      // Create new relationship
      rel = {
        id: generateId(),
        sourceId: relUpdate.sourceId,
        targetId: relUpdate.targetId,
        type: relUpdate.type || 'professional',
        dimensions: { trust: 50, fear: 0, respect: 50, affection: 0, rivalry: 0, dependence: 0 },
        history: [],
      };
      relationships.push(rel);
    }

    // Apply dimension changes
    if (relUpdate.changes) {
      for (const [key, delta] of Object.entries(relUpdate.changes)) {
        rel.dimensions[key] = Math.max(0, Math.min(100, (rel.dimensions[key] || 0) + delta));
      }

      // Auto-detect type changes based on dimensions
      if (rel.dimensions.trust < 15 && rel.dimensions.rivalry > 60) {
        rel.type = 'opposition';
      } else if (rel.dimensions.trust > 70 && rel.dimensions.affection > 50) {
        rel.type = 'friendship';
      } else if (rel.dimensions.rivalry > 70 && rel.dimensions.respect > 60) {
        rel.type = 'rivalry';
      }

      // Log to history
      rel.history.push({
        sceneId: scene.id,
        event: relUpdate.event || scene.title,
        changes: relUpdate.changes,
      });
    }
  }

  // Persist changes
  saveProgressionData();
}

/**
 * Create a new relationship between two characters
 */
export function createRelationship(sourceId, targetId, type = 'professional') {
  const rel = {
    id: generateId(),
    sourceId,
    targetId,
    type,
    dimensions: { trust: 50, fear: 0, respect: 50, affection: 0, rivalry: 0, dependence: 0 },
    history: [],
  };
  relationships.push(rel);
  saveProgressionData();
  return rel;
}

/**
 * Get characters with no relationships (isolated)
 */
export function getIsolatedCharacters(pieces) {
  return pieces.filter(p => !relationships.some(r => r.sourceId === p.id || r.targetId === p.id));
}

/**
 * Get the strongest relationship for a character (highest total dimension values)
 */
export function getStrongestRelationship(characterId) {
  const rels = getRelationshipsFor(characterId);
  if (rels.length === 0) return null;

  return rels.reduce((strongest, rel) => {
    const totalStrength = Object.values(rel.dimensions).reduce((sum, v) => sum + Math.abs(v), 0);
    const strongestStrength = Object.values(strongest.dimensions).reduce((sum, v) => sum + Math.abs(v), 0);
    return totalStrength > strongestStrength ? rel : strongest;
  });
}
