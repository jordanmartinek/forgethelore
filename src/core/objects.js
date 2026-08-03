/**
 * LoreForge Planner - Object System
 * Everything is an object. Characters, planets, wars, mysteries, organizations...
 */

import { db } from './database.js';
import { appStore } from './store.js';

// Generate unique IDs
export function generateId() {
  return `lf_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// Object Types
export const ObjectTypes = {
  // World Building
  UNIVERSE: 'universe',
  MULTIVERSE: 'multiverse',
  GALAXY: 'galaxy',
  NEBULA: 'nebula',
  STAR_CLUSTER: 'star_cluster',
  SOLAR_SYSTEM: 'solar_system',
  BINARY_STAR: 'binary_star',
  PLANET: 'planet',
  MOON: 'moon',
  ASTEROID_BELT: 'asteroid_belt',
  SPACE_STATION: 'space_station',
  MEGASTRUCTURE: 'megastructure',
  FLEET: 'fleet',
  SHIP: 'ship',
  CONTINENT: 'continent',
  COUNTRY: 'country',
  KINGDOM: 'kingdom',
  CITY: 'city',
  DISTRICT: 'district',
  VILLAGE: 'village',
  BUILDING: 'building',
  FLOOR: 'floor',
  ROOM: 'room',
  FOREST: 'forest',
  MOUNTAIN: 'mountain',
  RIVER: 'river',
  OCEAN: 'ocean',
  PORTAL: 'portal',
  ARTIFACT: 'artifact',
  ANOMALY: 'anomaly',
  VOID_CONDUIT: 'void_conduit',
  
  // Characters & Factions
  CHARACTER: 'character',
  FACTION: 'faction',
  ORGANIZATION: 'organization',
  
  // Planning Objects
  WAR: 'war',
  CONFLICT: 'conflict',
  MYSTERY: 'mystery',
  TECHNOLOGY: 'technology',
  EVENT: 'event',
  TIMELINE_EVENT: 'timeline_event',
  CANON_ENTRY: 'canon_entry',
  SECRET: 'secret',
  KNOWLEDGE: 'knowledge',
  
  // Conflict Board
  OBJECTIVE: 'objective',
  STRATEGY: 'strategy',
  MOVE: 'move',
};

// Object Icons
export const ObjectIcons = {
  [ObjectTypes.UNIVERSE]: '🌌',
  [ObjectTypes.MULTIVERSE]: '🔮',
  [ObjectTypes.GALAXY]: '🌀',
  [ObjectTypes.NEBULA]: '✨',
  [ObjectTypes.STAR_CLUSTER]: '⭐',
  [ObjectTypes.SOLAR_SYSTEM]: '☀️',
  [ObjectTypes.BINARY_STAR]: '🌟',
  [ObjectTypes.PLANET]: '🪐',
  [ObjectTypes.MOON]: '🌙',
  [ObjectTypes.ASTEROID_BELT]: '☄️',
  [ObjectTypes.SPACE_STATION]: '🛸',
  [ObjectTypes.MEGASTRUCTURE]: '🏗️',
  [ObjectTypes.FLEET]: '⚓',
  [ObjectTypes.SHIP]: '🚀',
  [ObjectTypes.CONTINENT]: '🗺️',
  [ObjectTypes.COUNTRY]: '🏴',
  [ObjectTypes.KINGDOM]: '👑',
  [ObjectTypes.CITY]: '🏙️',
  [ObjectTypes.DISTRICT]: '🏘️',
  [ObjectTypes.VILLAGE]: '🏡',
  [ObjectTypes.BUILDING]: '🏛️',
  [ObjectTypes.FLOOR]: '📐',
  [ObjectTypes.ROOM]: '🚪',
  [ObjectTypes.FOREST]: '🌲',
  [ObjectTypes.MOUNTAIN]: '⛰️',
  [ObjectTypes.RIVER]: '🏞️',
  [ObjectTypes.OCEAN]: '🌊',
  [ObjectTypes.PORTAL]: '🌀',
  [ObjectTypes.ARTIFACT]: '💎',
  [ObjectTypes.ANOMALY]: '⚡',
  [ObjectTypes.VOID_CONDUIT]: '🕳️',
  [ObjectTypes.CHARACTER]: '👤',
  [ObjectTypes.FACTION]: '⚔️',
  [ObjectTypes.ORGANIZATION]: '🏢',
  [ObjectTypes.WAR]: '🔥',
  [ObjectTypes.CONFLICT]: '💥',
  [ObjectTypes.MYSTERY]: '🔍',
  [ObjectTypes.TECHNOLOGY]: '⚙️',
  [ObjectTypes.EVENT]: '📅',
  [ObjectTypes.TIMELINE_EVENT]: '⏳',
  [ObjectTypes.CANON_ENTRY]: '📜',
  [ObjectTypes.SECRET]: '🤫',
  [ObjectTypes.KNOWLEDGE]: '📚',
  [ObjectTypes.OBJECTIVE]: '🎯',
  [ObjectTypes.STRATEGY]: '♟️',
  [ObjectTypes.MOVE]: '→',
};

// Relationship Types
export const RelationshipTypes = {
  // Personal
  FRIENDSHIP: 'friendship',
  TRUST: 'trust',
  FEAR: 'fear',
  RESPECT: 'respect',
  ROMANCE: 'romance',
  HATRED: 'hatred',
  MANIPULATION: 'manipulation',
  MENTORSHIP: 'mentorship',
  FAMILY: 'family',
  PROFESSIONAL: 'professional',
  
  // Political
  ALLIANCE: 'alliance',
  OPPOSITION: 'opposition',
  VASSAL: 'vassal',
  TRADE: 'trade',
  TREATY: 'treaty',
  
  // Structural
  PARENT_CHILD: 'parent_child',
  CONTAINS: 'contains',
  DEPENDS_ON: 'depends_on',
  CONFLICTS_WITH: 'conflicts_with',
  REFERENCES: 'references',
  SUPPORTS: 'supports',
  BLOCKS: 'blocks',
};

/**
 * Create a new planning object
 */
export function createObject(type, name, properties = {}) {
  const obj = {
    id: generateId(),
    type,
    name,
    description: '',
    tags: [],
    status: 'active',
    parentId: null,
    position: { x: 0, y: 0 },
    
    // Metadata
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    
    // Content
    notes: '',
    images: [],
    attachments: [],
    
    // AI
    aiSummary: '',
    
    // Strategic (for Conflict Board)
    faction: null,
    goal: '',
    hiddenGoal: '',
    momentum: 'stable', // 'rising' | 'falling' | 'stable'
    resources: {},
    strategies: [],
    
    // Timeline
    timelineStart: null,
    timelineEnd: null,
    
    // Custom properties
    properties: {},
    
    // Spread user properties
    ...properties,
  };
  
  // Save to DB
  db.scheduleSave('objects', obj);
  
  return obj;
}

/**
 * Update an existing object (triggers autosave)
 */
export function updateObject(id, changes) {
  const update = {
    ...changes,
    id,
    updatedAt: Date.now(),
  };
  
  db.scheduleSave('objects', update);
  return update;
}

/**
 * Create a relationship between two objects
 */
export function createRelationship(sourceId, targetId, type, properties = {}) {
  const rel = {
    id: generateId(),
    sourceId,
    targetId,
    type,
    strength: 50, // 0-100
    label: '',
    bidirectional: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...properties,
  };
  
  db.scheduleSave('relationships', rel);
  return rel;
}

/**
 * Get all relationships for an object
 */
export async function getObjectRelationships(objectId) {
  const asSource = await db.getByIndex('relationships', 'sourceId', objectId);
  const asTarget = await db.getByIndex('relationships', 'targetId', objectId);
  return [...asSource, ...asTarget];
}

/**
 * Get child objects
 */
export async function getChildren(parentId) {
  return db.getByIndex('objects', 'parentId', parentId);
}

/**
 * Search objects by name
 */
export async function searchObjects(query) {
  const all = await db.getAll('objects');
  const lower = query.toLowerCase();
  return all.filter(obj => 
    obj.name.toLowerCase().includes(lower) ||
    obj.description.toLowerCase().includes(lower) ||
    obj.tags.some(t => t.toLowerCase().includes(lower))
  );
}
