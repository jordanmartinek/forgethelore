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
import { getAISettings } from './ai-settings.js';
import { PROVIDERS } from './ai.js';

/** localStorage collection key (namespaced per project by persist.js). */
export const AI_RECORD_KEY = 'aiRecords';

/**
 * Event emitted on the shared bus whenever the AI-records collection changes
 * (add/edit/delete/import/review-toggle). The always-on review checklist
 * (ui/ai-record-review.js) listens for this to refresh without tight coupling
 * to the module.
 */
export const AI_RECORDS_CHANGED = 'ai-records:changed';

/**
 * localStorage key for a one-shot "open this record" hint. The review checklist
 * writes a record id here before navigating; the module consumes it on load to
 * focus that record, then clears it. NOT namespaced per project — it's a
 * transient UI hint, consumed immediately.
 */
export const AI_RECORD_FOCUS_KEY = 'loreforge_ai_record_focus';

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
 * @property {boolean} reviewed  true once the writer has investigated/integrated
 *                              this record (checked it off the review list)
 * @property {string} summary  an optional short summary (AI- or on-device-generated)
 * @property {string[]} linkedCharacterIds  ids of characters this record references
 * @property {string[]} linkedLocationIds   ids of places this record references
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** Coerce a value into a clean array of non-empty string ids (de-duped). */
export function toIdList(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const v of input) {
    const id = typeof v === 'string' ? v.trim() : (v && typeof v.id === 'string' ? v.id : '');
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

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
    reviewed: Boolean(partial.reviewed),
    summary: String(partial.summary || ''),
    linkedCharacterIds: toIdList(partial.linkedCharacterIds),
    linkedLocationIds: toIdList(partial.linkedLocationIds),
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
 * The records still awaiting review (not yet checked off), newest first. Drives
 * the always-on "AI records to review" checklist. Pinned records float to the
 * top so a deliberately-flagged record is reviewed first.
 * @param {AIRecord[]} records
 * @returns {AIRecord[]}
 */
export function pendingReviewRecords(records) {
  const list = Array.isArray(records) ? records.filter((r) => r && !r.reviewed) : [];
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

/** Count of records awaiting review. */
export function pendingReviewCount(records) {
  return Array.isArray(records) ? records.filter((r) => r && !r.reviewed).length : 0;
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

// ─── Entity links ────────────────────────────────────────────────────────────

/**
 * Return the records linked to a given entity (character or place). Pure, so
 * other modules can call it with their own loaded records to show "referenced
 * by AI Records" without importing the UI module.
 * @param {AIRecord[]} records
 * @param {'character'|'location'} kind
 * @param {string} entityId
 * @returns {AIRecord[]}
 */
export function recordsForEntity(records, kind, entityId) {
  if (!Array.isArray(records) || !entityId) return [];
  const field = kind === 'location' ? 'linkedLocationIds' : 'linkedCharacterIds';
  return records.filter((r) => Array.isArray(r[field]) && r[field].includes(entityId));
}

/** Total count of entity links on a record (characters + places). */
export function linkCount(record) {
  if (!record) return 0;
  return (record.linkedCharacterIds?.length || 0) + (record.linkedLocationIds?.length || 0);
}

// ─── AI summary (bring-your-own-key, offline-first) ──────────────────────────

/** Is an AI provider configured with a key? (mirrors core/ai.js). */
export function isAIEnabled() {
  const s = getAISettings();
  return Boolean(s.provider && s.apiKey && PROVIDERS[s.provider]);
}

/** Max chars of a record we send to the model for summarisation. */
const SUMMARY_INPUT_CHARS = 6000;

export const SUMMARY_SYSTEM_PROMPT =
  'You are a research assistant helping a novelist file away brainstorming they did with another AI. Given a session (an optional prompt plus the AI\'s response), write a tight summary the writer can skim later: 2-4 sentences capturing the key ideas, followed by up to 5 short bullet "takeaways" of the most reusable, concrete ideas. ' +
  'Be faithful to the content — never invent ideas that are not present. ' +
  'Respond ONLY with JSON of the form {"summary":"<2-4 sentences>","takeaways":["<idea>", "..."]}.';

/** Build the user message for a summary request. */
export function buildSummaryPrompt(record) {
  const prompt = String(record?.prompt || '').trim();
  const content = String(record?.content || '').trim().slice(0, SUMMARY_INPUT_CHARS);
  return JSON.stringify({ title: record?.title || '', prompt: prompt || undefined, session: content });
}

/**
 * Parse a summary reply defensively. Accepts {"summary","takeaways"}, a bare
 * string, or prose. Returns a single formatted string (summary + bullets) or ''.
 * @param {string} text
 * @returns {string}
 */
export function parseSummary(text) {
  if (!text || typeof text !== 'string') return '';
  let obj = null;
  try { obj = JSON.parse(text); } catch (_) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (_) { obj = null; } }
  }
  if (obj && typeof obj === 'object') {
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const takeaways = Array.isArray(obj.takeaways)
      ? obj.takeaways.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
      : [];
    if (!summary && !takeaways.length) return '';
    const parts = [];
    if (summary) parts.push(summary);
    if (takeaways.length) parts.push(takeaways.map((t) => `- ${t}`).join('\n'));
    return parts.join('\n\n');
  }
  // Not JSON — treat the whole reply as the summary.
  return text.trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
}

/**
 * Deterministic, on-device summary used when no key is configured or the call
 * fails. Extractive: picks the first substantive sentences plus a few short
 * lines/bullets from the content. Never empty for non-empty input.
 * @param {AIRecord} record
 * @returns {string}
 */
export function deterministicSummary(record) {
  const content = String(record?.content || '').replace(/\r/g, '').trim();
  if (!content) return '';
  // Lead: first 2 sentences (by terminal punctuation), capped.
  const sentences = content.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const lead = sentences.slice(0, 2).join(' ').slice(0, 320);

  // Takeaways: prefer existing bullet/numbered lines; else the next sentences.
  const bulletLines = content.split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-*•]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
  let takeaways = bulletLines.slice(0, 5);
  if (!takeaways.length) takeaways = sentences.slice(2, 5);
  takeaways = takeaways.map((t) => t.slice(0, 160)).filter(Boolean);

  const parts = [];
  if (lead) parts.push(lead);
  if (takeaways.length) parts.push(takeaways.map((t) => `- ${t}`).join('\n'));
  return parts.join('\n\n');
}

/** Low-level: call the configured provider for a summary. */
async function requestSummary(record) {
  const { provider, apiKey, model } = getAISettings();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: cfg.headers(apiKey),
      body: JSON.stringify(cfg.buildBody(model || cfg.defaultModel, SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(record))),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return parseSummary(cfg.extractText(json));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Public entry: summarise a record. Always resolves to a usable result. Uses
 * the model when a key is set (falling back to the on-device extractive summary
 * on any failure/empty result), otherwise summarises on-device.
 * @param {AIRecord} record
 * @returns {Promise<{ summary:string, usedAI:boolean }>}
 */
export async function summarizeRecord(record) {
  const offline = () => ({ summary: deterministicSummary(record), usedAI: false });
  if (!record || !String(record.content || '').trim()) return { summary: '', usedAI: false };
  if (!isAIEnabled()) return offline();
  try {
    const summary = await requestSummary(record);
    if (!summary) return offline();
    return { summary, usedAI: true };
  } catch (err) {
    console.warn('[LoreForge] Record summary failed, using on-device summary:', err.message);
    return offline();
  }
}
