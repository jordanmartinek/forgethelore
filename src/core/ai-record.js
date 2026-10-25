/**
 * LoreForge Planner - AI Record (external AI brainstorming library)
 *
 * A library for capturing brainstorming sessions produced by OTHER AI tools
 * (ChatGPT, Claude, Gemini, Copilot, …) so the writer can keep them beside
 * their universe, search them, and draw inspiration as they build. This is
 * reference material — it is intentionally NOT auto-pushed into story objects;
 * the writer decides what, if anything, graduates into the canon (and can send
 * a record to Brainstorm to start working it in).
 *
 * This core module holds the PURE, DOM-free data logic (shape, validation,
 * normalisation, search/filter, derived facets, plain-text rendering) so it is
 * unit-testable in Node. src/modules/ai-record.js is a thin view over it, and
 * persistence uses the same namespaced localStorage layer as every other module
 * (so records are included in export/import and cloud sync for free).
 */

import { generateId } from './objects.js';

/** localStorage collection key (namespaced per project by persist.js). */
export const AI_RECORD_KEY = 'aiRecords';

/**
 * Known AI sources, each with a label + emoji for the UI. 'other' is the
 * catch-all so nothing is ever un-filable.
 * @type {{ id:string, label:string, icon:string }[]}
 */
export const AI_SOURCES = [
  { id: 'chatgpt',    label: 'ChatGPT',       icon: '🟢' },
  { id: 'claude',     label: 'Claude',        icon: '🟠' },
  { id: 'gemini',     label: 'Gemini',        icon: '🔵' },
  { id: 'copilot',    label: 'Copilot',       icon: '🟣' },
  { id: 'perplexity', label: 'Perplexity',    icon: '🟤' },
  { id: 'grok',       label: 'Grok',          icon: '⚫' },
  { id: 'deepseek',   label: 'DeepSeek',      icon: '🔷' },
  { id: 'other',      label: 'Other AI',      icon: '✨' },
];

const SOURCE_IDS = new Set(AI_SOURCES.map((s) => s.id));

/** Metadata for a source id (falls back to the 'other' entry). */
export function sourceMeta(id) {
  return AI_SOURCES.find((s) => s.id === id) || AI_SOURCES[AI_SOURCES.length - 1];
}

/**
 * @typedef {Object} AIRecord
 * @property {string} id
 * @property {string} title
 * @property {string} source   one of AI_SOURCES ids
 * @property {string} model    optional free-text model name (e.g. "GPT-4o")
 * @property {string} prompt   the prompt the writer used (optional)
 * @property {string} content  the AI's response / the session transcript
 * @property {string[]} tags   free-form tags for grouping (e.g. "magic", "villains")
 * @property {boolean} pinned  surfaced to the top when true
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** Parse a comma/newline separated tag string into a clean, de-duped list. */
export function parseTags(input) {
  if (Array.isArray(input)) input = input.join(',');
  return String(input || '')
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)
    .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, 24);
}

/**
 * Build a validated, normalised record from partial input. Supplies ids and
 * timestamps, coerces the source to a known id, and cleans tags. Pure — no I/O.
 * @param {Partial<AIRecord>} partial
 * @returns {AIRecord}
 */
export function makeRecord(partial = {}) {
  const now = Date.now();
  const source = SOURCE_IDS.has(partial.source) ? partial.source : 'other';
  return {
    id: partial.id || generateId(),
    title: String(partial.title || '').trim() || 'Untitled session',
    source,
    model: String(partial.model || '').trim(),
    prompt: String(partial.prompt || ''),
    content: String(partial.content || ''),
    tags: parseTags(partial.tags),
    pinned: Boolean(partial.pinned),
    createdAt: typeof partial.createdAt === 'number' ? partial.createdAt : now,
    // Preserve an existing updatedAt (e.g. when reloading/normalising stored
    // records) and only default to now for brand-new records. Callers that
    // intend an edit bump updatedAt explicitly (see modules/ai-record.js).
    updatedAt: typeof partial.updatedAt === 'number' ? partial.updatedAt : now,
  };
}

/** Coerce stored data (possibly legacy/partial) into a clean record array. */
export function normalizeRecords(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === 'object').map((r) => makeRecord(r));
}

/** Word count of a record's content (prompt excluded). */
export function recordWordCount(record) {
  const text = String(record?.content || '').trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Filter + sort records for display. Pinned first, then most-recently-updated.
 * Search matches title, content, prompt, model and tags (case-insensitive).
 *
 * @param {AIRecord[]} records
 * @param {object} [q]
 * @param {string} [q.search]   free-text query
 * @param {string} [q.source]   restrict to a source id ('' = any)
 * @param {string} [q.tag]      restrict to a tag ('' = any)
 * @returns {AIRecord[]}
 */
export function queryRecords(records, q = {}) {
  const list = Array.isArray(records) ? records.slice() : [];
  const search = String(q.search || '').trim().toLowerCase();
  const source = q.source || '';
  const tag = (q.tag || '').toLowerCase();

  const matches = (r) => {
    if (source && r.source !== source) return false;
    if (tag && !r.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (search) {
      const hay = [r.title, r.content, r.prompt, r.model, r.tags.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  };

  return list.filter(matches).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

/**
 * Derive the facets needed to drive the filter UI: how many records per source,
 * and the set of tags in use (with counts), most-used first.
 * @param {AIRecord[]} records
 * @returns {{ total:number, bySource:Record<string,number>, tags:{tag:string,count:number}[] }}
 */
export function recordFacets(records) {
  const list = Array.isArray(records) ? records : [];
  /** @type {Record<string, number>} */
  const bySource = {};
  const tagCounts = new Map();
  for (const r of list) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    for (const t of r.tags) {
      const key = t.toLowerCase();
      const existing = tagCounts.get(key) || { tag: t, count: 0 };
      existing.count += 1;
      tagCounts.set(key, existing);
    }
  }
  const tags = [...tagCounts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { total: list.length, bySource, tags };
}

/** Plain-text rendering of a record, for copy / "send to brainstorm". */
export function recordToText(record) {
  if (!record) return '';
  const meta = sourceMeta(record.source);
  const lines = [];
  lines.push(record.title || 'Untitled session');
  const sub = [meta.label, record.model].filter(Boolean).join(' · ');
  if (sub) lines.push(sub);
  if (record.tags && record.tags.length) lines.push('Tags: ' + record.tags.map((t) => `#${t}`).join(' '));
  lines.push('');
  if (record.prompt && record.prompt.trim()) {
    lines.push('PROMPT');
    lines.push(record.prompt.trim());
    lines.push('');
    lines.push('RESPONSE');
  }
  lines.push(String(record.content || '').trim());
  return lines.join('\n');
}
