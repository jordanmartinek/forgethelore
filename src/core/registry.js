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
import { renderCharacterBuilder } from '../modules/character-builder.js';
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
import { renderCharacterInterview } from '../modules/character-interview.js';
import { renderLanguagePlanner } from '../modules/language-planner.js';
import { renderResourcePlanner } from '../modules/resource-planner.js';
import { renderWritingSprint } from '../modules/writing-sprint.js';
import { renderExportImport } from '../ui/export-import.js';
import { renderFocusMode } from '../modules/focus-mode.js';
import { renderWorldMap } from '../modules/world-map.js';
import { renderPovAnalytics } from '../modules/pov-analytics.js';
import { renderCharacterHub } from '../modules/character-hub.js';
import { renderWorldHub } from '../modules/world-hub.js';

/**
 * @typedef {Object} ModuleDef
 * @property {string} id       Stable module id used in the app store.
 * @property {string} label    Human-friendly name for nav/palette/status bar.
 * @property {string} icon     Emoji icon.
 * @property {string} group    LEGACY coarse group ('write'|'plan'|'world'|'analysis').
 *                             Kept for backward compatibility; the sidebar now
 *                             reads `section`.
 * @property {string} section  Story-centric nav section: 'write' | 'story' |
 *                             'world' | 'create' | 'insights' | 'settings'.
 * @property {'primary'|'advanced'} tier  Whether the item shows in the section's
 *                             always-visible list (primary) or is tucked behind a
 *                             "More" disclosure (advanced) — progressive disclosure
 *                             so the sidebar stays quiet without hiding features.
 * @property {(container: HTMLElement, id: string) => void} render
 * @property {boolean} [hidden] If true, not shown in the sidebar (still routable).
 */

/**
 * The module registry — the single source of truth. The redesign reorganizes
 * these into a story-centric hierarchy (section + tier) WITHOUT removing any
 * module: everything remains routable and discoverable. The mental model is
 * "here is your story; everything else helps you work on it", so the sections
 * are ordered Write → Story → World → Create → Insights → Settings, and the
 * powerful-but-occasional tools are marked `tier: 'advanced'` so the sidebar can
 * keep them one disclosure away instead of shouting all 30+ at once.
 *
 * @type {ModuleDef[]}
 */
export const MODULES = [
  // ── WRITE — what writers use constantly ─────────────────────────────────
  { id: 'manuscript',      label: 'Manuscript',      icon: '📖', section: 'write', tier: 'primary',  group: 'write',    render: renderManuscriptPlanner },
  { id: 'quick-log',       label: 'Notes / Quick Log', icon: '⚡', section: 'write', tier: 'primary', group: 'write',    render: renderQuickSceneLog },
  { id: 'focus-mode',      label: 'Focus Mode',      icon: '✍️', section: 'write', tier: 'advanced', group: 'write',    render: renderFocusMode },

  // ── STORY — the people, places and structure of the story ───────────────
  // `character-hub` is the unified character experience (Overview/Arc/…) and is
  // the primary entry; the raw planner remains available as "Character Profiles".
  { id: 'character-hub',   label: 'Characters',      icon: '👤', section: 'story', tier: 'primary',  group: 'world',    render: renderCharacterHub },
  { id: 'locations',       label: 'Places',          icon: '📍', section: 'story', tier: 'primary',  group: 'world',    render: renderLocationPlanner },
  { id: 'timeline',        label: 'Timeline',        icon: '⏳', section: 'story', tier: 'primary',  group: 'plan',     render: renderTimeline },
  { id: 'relationships',   label: 'Relationships',   icon: '💫', section: 'story', tier: 'primary',  group: 'analysis', render: renderRelationshipPlanner },
  { id: 'characters',      label: 'Character Profiles', icon: '📇', section: 'story', tier: 'advanced', group: 'world', render: renderCharacterPlanner },
  { id: 'character-builder', label: 'Character Builder', icon: '🪪', section: 'story', tier: 'advanced', group: 'world', render: renderCharacterBuilder },
  { id: 'knowledge-matrix',label: 'Character Arcs',  icon: '📈', section: 'story', tier: 'advanced', group: 'analysis', render: renderCharacterArc },
  { id: 'family-tree',     label: 'Family Trees',    icon: '🌳', section: 'story', tier: 'advanced', group: 'analysis', render: renderFamilyTree },

  // ── WORLD — worldbuilding, with hierarchical discovery ──────────────────
  // `world-hub` is the landing page (category cards); the full tree builder and
  // per-category planners remain available beneath it.
  { id: 'world-hub',       label: 'World',           icon: '🌌', section: 'world', tier: 'primary',  group: 'world',    render: renderWorldHub },
  { id: 'world-map',       label: 'Map',             icon: '🗺️', section: 'world', tier: 'primary',  group: 'world',    render: renderWorldMap },
  { id: 'factions',        label: 'Factions',        icon: '⚔️', section: 'world', tier: 'primary',  group: 'world',    render: renderFactionPlanner },
  { id: 'world-builder',   label: 'World Builder',   icon: '🗂️', section: 'world', tier: 'advanced', group: 'world',    render: renderWorldBuilder },
  { id: 'species',         label: 'Species',         icon: '🧬', section: 'world', tier: 'advanced', group: 'world',    render: renderSpeciesPlanner },
  { id: 'languages',       label: 'Languages',       icon: '🗣️', section: 'world', tier: 'advanced', group: 'world',    render: renderLanguagePlanner },
  { id: 'religions',       label: 'Religions',       icon: '🕯️', section: 'world', tier: 'advanced', group: 'world',    render: renderReligionPlanner },
  { id: 'organizations',   label: 'Organizations',   icon: '🏢', section: 'world', tier: 'advanced', group: 'world',    render: renderOrganizationPlanner },
  { id: 'politics',        label: 'Politics',        icon: '🏛️', section: 'world', tier: 'advanced', group: 'world',    render: renderPoliticsPlanner },
  { id: 'military',        label: 'Military',        icon: '🎖️', section: 'world', tier: 'advanced', group: 'world',    render: renderMilitaryPlanner },
  { id: 'technology',      label: 'Technology',      icon: '⚙️', section: 'world', tier: 'advanced', group: 'world',    render: renderTechnologyPlanner },
  { id: 'resources',       label: 'Resources',       icon: '💎', section: 'world', tier: 'advanced', group: 'world',    render: renderResourcePlanner },

  // ── CREATE — generative & planning workspaces ───────────────────────────
  { id: 'brainstorm',      label: 'Brainstorm',      icon: '💭', section: 'create', tier: 'primary',  group: 'write',   render: renderBrainstorm },
  { id: 'writing-sprint',  label: 'Writing Sprint',  icon: '⏱️', section: 'create', tier: 'primary',  group: 'write',   render: renderWritingSprint },
  { id: 'character-interview', label: 'Interview Character', icon: '💬', section: 'create', tier: 'primary', group: 'write', render: renderCharacterInterview },
  { id: 'conflict-board',  label: 'Strategic Board', icon: '♟️', section: 'create', tier: 'advanced', group: 'plan',    render: renderConflictBoard },
  { id: 'confrontations',  label: 'Confrontations',  icon: '⚔️', section: 'create', tier: 'advanced', group: 'plan',    render: renderConfrontations },
  { id: 'daily-planner',   label: 'Daily Planner',   icon: '📅', section: 'create', tier: 'advanced', group: 'plan',    render: renderDailyPlanner },
  { id: 'mysteries',       label: 'Conflicts & Mysteries', icon: '🔍', section: 'create', tier: 'advanced', group: 'plan', render: renderMysteryPlanner },

  // ── INSIGHTS — advanced analysis, subordinate to writing ────────────────
  { id: 'story-analytics', label: 'Story Analytics', icon: '🎢', section: 'insights', tier: 'primary',  group: 'analysis', render: renderStoryAnalytics },
  { id: 'knowledge-graph', label: 'Knowledge Graph', icon: '🕸️', section: 'insights', tier: 'advanced', group: 'analysis', render: renderKnowledgeGraph },
  { id: 'secrets-matrix',  label: 'Knowledge & Setups', icon: '🕵️', section: 'insights', tier: 'advanced', group: 'analysis', render: renderKnowledgeMatrix },
  { id: 'pov-analytics',   label: 'Word & POV',      icon: '🎭', section: 'insights', tier: 'advanced', group: 'analysis', render: renderPovAnalytics },
  { id: 'analytics',       label: 'Analytics',       icon: '📊', section: 'insights', tier: 'advanced', group: 'analysis', render: renderAnalytics },

  // ── SETTINGS ────────────────────────────────────────────────────────────
  { id: 'export-import',   label: 'Import / Export', icon: '💾', section: 'settings', tier: 'primary', group: 'analysis', render: renderExportImport },
];

/**
 * Ordered nav sections with display labels. This is the story-centric hierarchy
 * the sidebar and command palette render.
 */
export const SECTIONS = [
  { id: 'write',    label: 'Write' },
  { id: 'story',    label: 'Story' },
  { id: 'world',    label: 'World' },
  { id: 'create',   label: 'Create' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
];

/**
 * LEGACY coarse groups. Retained so any consumer still reading `GROUPS` /
 * `m.group` keeps working; the sidebar now uses `SECTIONS` / `m.section`.
 */
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

/**
 * Build the story-centric sectioned nav structure the sidebar expects. Each
 * item carries its `tier` so the sidebar can show primary items and tuck
 * advanced ones behind a "More" disclosure — no feature is removed.
 */
export function getNavGroups() {
  return SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    items: MODULES.filter((m) => m.section === s.id && !m.hidden)
      .map((m) => ({ id: m.id, label: m.label, icon: m.icon, tier: m.tier || 'primary' })),
  })).filter((s) => s.items.length > 0);
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
