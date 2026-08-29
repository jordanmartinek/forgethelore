/**
 * LoreForge Planner - Global Content Search
 *
 * Searches across every module's data for the active project. Modules persist
 * flat arrays under known localStorage keys (via persist.js); this indexes those
 * keys so the command palette can surface characters, factions, locations,
 * scenes, notes, etc. — not just command names.
 *
 * Returns lightweight hits that know which module to open, so selecting a result
 * navigates the user straight to the relevant planner.
 */

import * as repo from './repo.js';

/**
 * Map of localStorage key -> descriptor for how to interpret its records.
 * `module` is the registry id to navigate to when a hit is selected.
 * `fields` are the record fields to match/display (first is treated as title).
 */
const SEARCHABLE = [
  { key: 'characters',        module: 'characters',      icon: '👤', label: 'Character',    fields: ['name', 'role', 'description', 'faction', 'goal'] },
  { key: 'factionData',       module: 'factions',        icon: '⚔️', label: 'Faction',      fields: ['name', 'goal', 'description'] },
  { key: 'factions',          module: 'conflict-board',  icon: '⚔️', label: 'Faction',      fields: ['name', 'goal'] },
  { key: 'pieces',            module: 'conflict-board',  icon: '♟️', label: 'Board Piece',  fields: ['name', 'role', 'goal', 'hiddenGoal'] },
  { key: 'scenes',            module: 'conflict-board',  icon: '🎬', label: 'Scene',        fields: ['title', 'summary', 'location', 'outcome'] },
  { key: 'locations',         module: 'locations',       icon: '📍', label: 'Location',     fields: ['name', 'type', 'description'] },
  { key: 'species',           module: 'species',         icon: '🧬', label: 'Species',      fields: ['name', 'description'] },
  { key: 'languages',         module: 'languages',       icon: '🗣️', label: 'Language',     fields: ['name', 'description'] },
  { key: 'religions',         module: 'religions',       icon: '🕯️', label: 'Religion',     fields: ['name', 'description'] },
  { key: 'organizations',     module: 'organizations',   icon: '🏢', label: 'Organization', fields: ['name', 'description'] },
  { key: 'politicalEntities', module: 'politics',        icon: '🏛️', label: 'Political',    fields: ['name', 'description'] },
  { key: 'militaryForces',    module: 'military',        icon: '🎖️', label: 'Military',     fields: ['name', 'description'] },
  { key: 'technologies',      module: 'technology',      icon: '⚙️', label: 'Technology',   fields: ['name', 'description', 'impact'] },
  { key: 'resources',         module: 'resources',       icon: '💎', label: 'Resource',     fields: ['name', 'description'] },
  { key: 'mysteries',         module: 'mysteries',       icon: '🔍', label: 'Mystery',      fields: ['title', 'name', 'description'] },
  { key: 'manuscriptScenes',  module: 'manuscript',      icon: '📖', label: 'Scene',        fields: ['title', 'summary', 'content'] },
  { key: 'brainstormSessions',module: 'brainstorm',      icon: '💭', label: 'Brainstorm',   fields: ['title', 'content'] },
  { key: 'characterArcs',     module: 'knowledge-matrix',icon: '📈', label: 'Character Arc',fields: ['name', 'summary'] },
  { key: 'writingSprints',    module: 'writing-sprint',  icon: '⏱️', label: 'Sprint',       fields: ['title', 'content'] },
  { key: 'timelineEvents',    module: 'timeline',        icon: '⏳', label: 'Timeline Event',fields: ['title', 'name', 'description'] },
];

/**
 * @typedef {Object} SearchHit
 * @property {string} title
 * @property {string} snippet   Short contextual excerpt of the match.
 * @property {string} module    Registry id to navigate to.
 * @property {string} icon
 * @property {string} typeLabel
 * @property {number} score
 */

function firstString(record, fields) {
  for (const f of fields) {
    if (typeof record[f] === 'string' && record[f].trim()) return record[f];
  }
  return '';
}

/**
 * Search all indexed module data for the active project.
 * @param {string} query
 * @param {number} [limit]
 * @returns {SearchHit[]}
 */
export function searchContent(query, limit = 8) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];

  const hits = [];

  for (const src of SEARCHABLE) {
    const records = repo.list(src.key);
    if (!Array.isArray(records) || records.length === 0) continue;

    for (const rec of records) {
      if (!rec || typeof rec !== 'object') continue;

      const title = (rec.name || rec.title || 'Untitled');
      let bestSnippet = '';
      let score = 0;

      for (const field of src.fields) {
        const val = rec[field];
        if (typeof val !== 'string') continue;
        const idx = val.toLowerCase().indexOf(q);
        if (idx === -1) continue;

        // Title/name matches rank highest; earlier matches rank higher.
        const isTitleField = field === 'name' || field === 'title';
        const fieldScore = (isTitleField ? 100 : 20) + Math.max(0, 20 - idx);
        if (fieldScore > score) {
          score = fieldScore;
          const start = Math.max(0, idx - 24);
          bestSnippet = (start > 0 ? '…' : '') + val.slice(start, idx + q.length + 40).trim() + (val.length > idx + q.length + 40 ? '…' : '');
        }
      }

      if (score > 0) {
        hits.push({
          title: String(title),
          snippet: bestSnippet && bestSnippet.toLowerCase() !== String(title).toLowerCase() ? bestSnippet : src.label,
          module: src.module,
          icon: src.icon,
          typeLabel: src.label,
          score,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
