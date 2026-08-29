/**
 * LoreForge Planner - Module Registry
 *
 * Single source of truth mapping a module id to its metadata and render
 * function. Previously this information was split across THREE places that
 * silently drifted apart:
 *   - app-shell.js `navGroups` (sidebar labels)
 *   - app-shell.js `renderActiveModule()` giant switch (id -> render fn)
 *   - command-palette.js `commands` (nav entries)
 *
 * With a registry, the sidebar, the module dispatcher, the command palette, and
 * the dashboard all read from the same list, so adding a module is a one-liner
 * and no menu item can point at a missing render function (or vice-versa).
 *
 * Each module render function has the signature render(container, moduleId).
 */

import { renderConflictBoard } from '../modules/conflict-board.js';
import { renderConfrontations } from '../modules/confrontations.js';
import { renderWorldBuilder } from '../modules/world-builder.js';
import { renderCharacterPlanner } from '../modules/character-planner.js';
import { renderMysteryPlanner } from '../modules/mystery-planner.js';
import { renderTimeline } from '../modules/timeline.js';
import { renderKnowledgeGraph } from '../modules/knowledge-graph.js';
import { renderAnalytics } from '../modules/analytics.js';
import { renderStoryAnalytics } from '../modules/story-analytics.js';
import { renderKnowledgeMatrix } from '../modules/knowledge-matrix.js';
import { renderFamilyTree } from '../modules/family-tree.js';
import { renderLocationPlanner } from '../modules/location-planner.js';
import { renderReligionPlanner } from '../modules/religion-planner.js';
import { renderPoliticsPlanner } from '../modules/politics-planner.js';
import { renderOrganizationPlanner } from '../modules/organization-planner.js';
import { renderSpeciesPlanner } from '../modules/species-planner.js';
import { renderTechnologyPlanner } from '../modules/technology-planner.js';
import { renderMilitaryPlanner } from '../modules/military-planner.js';
import { renderFactionPlanner } from '../modules/faction-planner.js';
import { renderRelationshipPlanner } from '../modules/relationship-planner.js';
import { renderCharacterArc } from '../modules/character-arc.js';
import { renderQuickSceneLog } from '../modules/quick-scene-log.js';
import { renderManuscriptPlanner } from '../modules/manuscript-planner.js';
import { renderDailyPlanner } from '../modules/daily-planner.js';
import { renderBrainstorm } from '../modules/brainstorm.js';
import { renderLanguagePlanner } from '../modules/language-planner.js';
import { renderResourcePlanner } from '../modules/resource-planner.js';
import { renderWritingSprint } from '../modules/writing-sprint.js';
import { renderExportImport } from '../ui/export-import.js';

/**
 * @typedef {Object} ModuleDef
 * @property {string} id       Stable module id used in the app store.
 * @property {string} label    Human-friendly name for nav/palette/status bar.
 * @property {string} icon     Emoji icon.
 * @property {string} group    Sidebar group: 'write' | 'plan' | 'world' | 'analysis'.
 * @property {(container: HTMLElement, id: string) => void} render
 * @property {boolean} [hidden] If true, not shown in the sidebar (still routable).
 */

/** @type {ModuleDef[]} */
export const MODULES = [
  // ── Write ──────────────────────────────────────────────────────────────
  { id: 'manuscript',      label: 'Manuscript',      icon: '📖', group: 'write',    render: renderManuscriptPlanner },
  { id: 'quick-log',       label: 'Quick Log',       icon: '⚡', group: 'write',    render: renderQuickSceneLog },
  { id: 'brainstorm',      label: 'Brainstorm',      icon: '💭', group: 'write',    render: renderBrainstorm },
  { id: 'writing-sprint',  label: 'Writing Sprint',  icon: '⏱️', group: 'write',    render: renderWritingSprint },

  // ── Plan ───────────────────────────────────────────────────────────────
  { id: 'conflict-board',  label: 'Strategic Board', icon: '♟️', group: 'plan',     render: renderConflictBoard },
  { id: 'confrontations',  label: 'Confrontations',  icon: '⚔️', group: 'plan',     render: renderConfrontations },
  { id: 'daily-planner',   label: 'Daily Planner',   icon: '📅', group: 'plan',     render: renderDailyPlanner },
  { id: 'timeline',        label: 'Timeline',        icon: '⏳', group: 'plan',     render: renderTimeline },
  { id: 'mysteries',       label: 'Conflicts & Mysteries', icon: '🔍', group: 'plan', render: renderMysteryPlanner },

  // ── World ──────────────────────────────────────────────────────────────
  { id: 'world-builder',   label: 'World Builder',   icon: '🌌', group: 'world',    render: renderWorldBuilder },
  { id: 'characters',      label: 'Characters',      icon: '👤', group: 'world',    render: renderCharacterPlanner },
  { id: 'factions',        label: 'Factions',        icon: '⚔️', group: 'world',    render: renderFactionPlanner },
  { id: 'locations',       label: 'Locations',       icon: '📍', group: 'world',    render: renderLocationPlanner },
  { id: 'species',         label: 'Species',         icon: '🧬', group: 'world',    render: renderSpeciesPlanner },
  { id: 'languages',       label: 'Languages',       icon: '🗣️', group: 'world',    render: renderLanguagePlanner },
  { id: 'religions',       label: 'Religions',       icon: '🕯️', group: 'world',    render: renderReligionPlanner },
  { id: 'organizations',   label: 'Organizations',   icon: '🏢', group: 'world',    render: renderOrganizationPlanner },
  { id: 'politics',        label: 'Politics',        icon: '🏛️', group: 'world',    render: renderPoliticsPlanner },
  { id: 'military',        label: 'Military',        icon: '🎖️', group: 'world',    render: renderMilitaryPlanner },
  { id: 'technology',      label: 'Technology',      icon: '⚙️', group: 'world',    render: renderTechnologyPlanner },
  { id: 'resources',       label: 'Resources',       icon: '💎', group: 'world',    render: renderResourcePlanner },

  // ── Analysis ───────────────────────────────────────────────────────────
  { id: 'knowledge-graph', label: 'Knowledge Graph', icon: '🕸️', group: 'analysis', render: renderKnowledgeGraph },
  { id: 'relationships',   label: 'Relationships',   icon: '💫', group: 'analysis', render: renderRelationshipPlanner },
  { id: 'knowledge-matrix',label: 'Character Arcs',  icon: '📈', group: 'analysis', render: renderCharacterArc },
  { id: 'story-analytics', label: 'Story Analytics', icon: '🎢', group: 'analysis', render: renderStoryAnalytics },
  { id: 'secrets-matrix',  label: 'Knowledge & Setups', icon: '🕵️', group: 'analysis', render: renderKnowledgeMatrix },
  { id: 'family-tree',     label: 'Family Trees',    icon: '🌳', group: 'analysis', render: renderFamilyTree },
  { id: 'analytics',       label: 'Analytics',       icon: '📊', group: 'analysis', render: renderAnalytics },
  { id: 'export-import',   label: 'Export / Import', icon: '💾', group: 'analysis', render: renderExportImport },
];

/** Ordered sidebar groups with their display labels. */
export const GROUPS = [
  { id: 'write',    label: 'Write' },
  { id: 'plan',     label: 'Plan' },
  { id: 'world',    label: 'World' },
  { id: 'analysis', label: 'Analysis' },
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

/** Look up a module definition by id. */
export function getModule(id) {
  return BY_ID.get(id) || null;
}

/** Human-friendly label for a module id (falls back to the id). */
export function getModuleLabel(id) {
  if (id === 'dashboard') return 'Dashboard';
  return BY_ID.get(id)?.label || id;
}

/** Build the grouped nav structure the sidebar expects. */
export function getNavGroups() {
  return GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: MODULES.filter((m) => m.group === g.id && !m.hidden)
      .map((m) => ({ id: m.id, label: m.label, icon: m.icon })),
  }));
}

/**
 * Render a module by id into a container. Returns true if a module handled it,
 * false if the id was unknown (caller can render a placeholder).
 */
export function renderModuleById(id, container) {
  const mod = BY_ID.get(id);
  if (!mod) return false;
  mod.render(container, id);
  return true;
}
