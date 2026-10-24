/**
 * LoreForge Planner - Writing Companion (real-time synonyms + writing devices)
 *
 * A live writing coach that works AS YOU WRITE. Two capabilities:
 *   1. Synonyms      — pick/double-click a word → better word choices, ranked
 *                      for fit and tone, each with a one-word register hint.
 *   2. Writing devices — on a typing pause, analyse the current sentence(s) and
 *                      suggest concrete craft upgrades: stronger verbs, sensory
 *                      detail, metaphor/simile, rhythm/variety, trimming filler.
 *
 * Offline-first, exactly like core/ai.js and core/story-ai.js:
 *   - No key configured  -> a deterministic, on-device result (never empty). The
 *                           on-device engine uses a compact built-in thesaurus
 *                           and mechanical heuristics so the feature is always
 *                           useful without a network.
 *   - Key configured     -> the user's provider (incl. the free Gemini tier) is
 *                           called for richer, context-aware suggestions; on any
 *                           network/parse error we fall back to the deterministic
 *                           result so the feature never breaks the app.
 *
 * All the heavy lifting (prompt assembly, defensive reply parsing, deterministic
 * engines, word extraction) lives here as PURE functions so it is unit-testable
 * in Node with no DOM/network; src/ui/writing-companion-panel.js is a thin view.
 */

import { getAISettings } from './ai-settings.js';
import { PROVIDERS } from './ai.js';

/** Is an AI provider configured with a key? (mirrors core/ai.js / story-ai.js) */
export function isAIEnabled() {
  const s = getAISettings();
  return Boolean(s.provider && s.apiKey && PROVIDERS[s.provider]);
}

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Debounce before analysing writing devices after the writer pauses (ms). */
export const DEVICE_DEBOUNCE_MS = 1200;
/** Max synonyms surfaced for a single word. */
export const MAX_SYNONYMS = 8;
/** Max device suggestions surfaced at once. */
export const MAX_DEVICES = 6;
/** Chars of surrounding prose sent as context for a synonym lookup. */
const SYNONYM_CONTEXT_CHARS = 160;
/** Max chars of the passage analysed for writing devices. */
const DEVICE_PASSAGE_CHARS = 600;

/** The device categories we recognise — used for icons + offline heuristics. */
export const DEVICE_KINDS = {
  verb:      { icon: '💪', label: 'Stronger verb' },
  sensory:   { icon: '👁️', label: 'Sensory detail' },
  figurative:{ icon: '🌙', label: 'Figurative language' },
  rhythm:    { icon: '🎵', label: 'Rhythm & variety' },
  concise:   { icon: '✂️', label: 'Trim filler' },
  precise:   { icon: '🎯', label: 'Precise wording' },
};

function deviceMeta(kind) {
  return DEVICE_KINDS[kind] || { icon: '✍️', label: 'Suggestion' };
}

// ─── Word extraction (pure) ──────────────────────────────────────────────────

/**
 * Given the full text and a caret/selection offset, return the word under that
 * offset plus a small window of surrounding prose for context. Returns null if
 * the offset doesn't sit on a word character.
 *
 * @param {string} text
 * @param {number} offset  caret index (selectionStart)
 * @param {number} [offsetEnd]  selection end; if a range is selected and spans a
 *                              single word, that word is used directly.
 * @returns {null | { word:string, start:number, end:number, context:string }}
 */
export function wordAt(text, offset, offsetEnd) {
  if (typeof text !== 'string' || !text) return null;
  const n = text.length;
  let start = Math.max(0, Math.min(offset | 0, n));
  let end = typeof offsetEnd === 'number' ? Math.max(start, Math.min(offsetEnd, n)) : start;

  const isWord = (ch) => /[A-Za-z'’-]/.test(ch);

  // If the user selected exactly one word, honour the selection.
  if (end > start) {
    const sel = text.slice(start, end).trim();
    if (sel && /^[A-Za-z'’-]+$/.test(sel)) {
      const s = text.indexOf(sel, start);
      return { word: sel, start: s, end: s + sel.length, context: contextAround(text, s, s + sel.length) };
    }
  }

  // Otherwise expand from the caret to the surrounding word.
  // Nudge left if the caret sits just past the end of a word.
  if (start > 0 && start === end && !isWord(text[start] || '') && isWord(text[start - 1])) start -= 1;
  if (!isWord(text[start] || '')) return null;

  let a = start;
  let b = start;
  while (a > 0 && isWord(text[a - 1])) a -= 1;
  while (b < n && isWord(text[b])) b += 1;
  const word = text.slice(a, b).replace(/^[-'’]+|[-'’]+$/g, '');
  if (!word) return null;
  return { word, start: a, end: b, context: contextAround(text, a, b) };
}

/** A trimmed window of prose around [start,end) for context. */
function contextAround(text, start, end) {
  const from = Math.max(0, start - SYNONYM_CONTEXT_CHARS);
  const to = Math.min(text.length, end + SYNONYM_CONTEXT_CHARS);
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
}

/**
 * Extract the sentence(s) surrounding a caret offset, capped to a sane length —
 * the unit we analyse for writing devices. Falls back to the whole (capped)
 * text when no caret is given.
 *
 * @param {string} text
 * @param {number} [offset]
 * @returns {string}
 */
export function sentenceAround(text, offset) {
  if (typeof text !== 'string' || !text.trim()) return '';
  if (typeof offset !== 'number') return text.slice(-DEVICE_PASSAGE_CHARS).trim();
  const n = text.length;
  const at = Math.max(0, Math.min(offset, n));
  let a = at;
  let b = at;
  while (a > 0 && !'.!?\n'.includes(text[a - 1])) a -= 1;
  while (b < n && !'.!?\n'.includes(text[b])) b += 1;
  if (b < n) b += 1; // include the terminal punctuation
  return text.slice(a, b).slice(0, DEVICE_PASSAGE_CHARS).trim();
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

export const SYNONYM_SYSTEM_PROMPT =
  'You are a precise thesaurus for a novelist. Given a single word and the sentence it appears in, suggest stronger or more fitting alternatives that preserve the intended meaning and part of speech, ordered best-first. ' +
  'Prefer vivid, specific words over generic ones; respect the sentence\'s tone. Do NOT repeat the original word. ' +
  'Respond ONLY with JSON of the form {"synonyms":[{"word":"<alternative>","hint":"<one or two words on nuance/register, e.g. formal, harsher, archaic>"}]}. Return 4-8 options.';

export const DEVICE_SYSTEM_PROMPT =
  'You are a line-editing writing coach. Given a short passage of a novelist\'s draft, suggest concrete craft improvements. Each suggestion must name the technique and give a short, specific rewrite the writer could paste in. ' +
  'Use these kinds: "verb" (replace a weak/vague verb), "sensory" (add a concrete sense detail), "figurative" (a fitting metaphor or simile), "rhythm" (vary sentence length/flow), "concise" (cut filler/redundancy), "precise" (a vaguer phrase made specific). ' +
  'Stay in the passage\'s voice, tense and POV; never invent named characters or places. ' +
  'Respond ONLY with JSON of the form {"suggestions":[{"kind":"verb","note":"<what & why, one sentence>","rewrite":"<the improved phrase or sentence>"}]}. Return 3-6, most impactful first.';

/** Build the user message for a synonym lookup. */
export function buildSynonymPrompt(word, context) {
  return JSON.stringify({ word, sentence: context || '' });
}

/** Build the user message for a device analysis. */
export function buildDevicePrompt(passage) {
  return JSON.stringify({ passage: String(passage || '').slice(0, DEVICE_PASSAGE_CHARS) });
}

// ─── Defensive reply parsers (pure) ──────────────────────────────────────────

/** Pull the first {...} JSON object out of a model reply (handles prose/fences). */
function extractObject(text) {
  if (!text || typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch (_) { /* try to salvage */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

/**
 * Parse a synonyms reply into a clean array. Accepts {"synonyms":[...]}, a bare
 * array, or a list of plain strings. Always returns an array (possibly empty).
 * @returns {{ word:string, hint:string }[]}
 */
export function parseSynonyms(text, original = '') {
  const obj = extractObject(text);
  const arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.synonyms) ? obj.synonyms : null);
  if (!arr) return [];
  const origLc = String(original).toLowerCase();
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    let word = '';
    let hint = '';
    if (typeof item === 'string') word = item;
    else if (item && typeof item === 'object') { word = String(item.word || item.synonym || ''); hint = String(item.hint || item.note || ''); }
    word = word.trim();
    const key = word.toLowerCase();
    if (!word || key === origLc || seen.has(key)) continue;
    seen.add(key);
    out.push({ word, hint: hint.trim() });
    if (out.length >= MAX_SYNONYMS) break;
  }
  return out;
}

/**
 * Parse a device-suggestions reply into a clean array. Always returns an array.
 * @returns {{ kind:string, icon:string, label:string, note:string, rewrite:string }[]}
 */
export function parseDevices(text) {
  const obj = extractObject(text);
  const arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.suggestions) ? obj.suggestions : null);
  if (!arr) return [];
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const kind = typeof item.kind === 'string' && DEVICE_KINDS[item.kind] ? item.kind : 'precise';
    const note = String(item.note || item.detail || '').trim();
    const rewrite = String(item.rewrite || item.suggestion || '').trim();
    if (!note && !rewrite) continue;
    const meta = deviceMeta(kind);
    out.push({ kind, icon: meta.icon, label: meta.label, note, rewrite });
    if (out.length >= MAX_DEVICES) break;
  }
  return out;
}

// ─── Deterministic engines (offline / fallback) ──────────────────────────────

/**
 * A small, hand-curated thesaurus of words writers overuse, mapped to vivid
 * alternatives. Intentionally compact — the model does the heavy lifting when a
 * key is present; this keeps the feature genuinely useful offline.
 * @type {Record<string, {word:string,hint:string}[]>}
 */
const THESAURUS = {
  good: [ {word:'excellent',hint:'stronger'}, {word:'superb',hint:'formal'}, {word:'fine',hint:'understated'}, {word:'admirable',hint:'formal'} ],
  bad: [ {word:'dreadful',hint:'stronger'}, {word:'wretched',hint:'literary'}, {word:'poor',hint:'mild'}, {word:'awful',hint:'blunt'} ],
  big: [ {word:'vast',hint:'scale'}, {word:'immense',hint:'awe'}, {word:'towering',hint:'height'}, {word:'massive',hint:'weight'} ],
  small: [ {word:'tiny',hint:'plain'}, {word:'slight',hint:'subtle'}, {word:'minute',hint:'precise'}, {word:'cramped',hint:'spatial'} ],
  said: [ {word:'murmured',hint:'quiet'}, {word:'snapped',hint:'sharp'}, {word:'whispered',hint:'soft'}, {word:'muttered',hint:'low'} ],
  walked: [ {word:'strode',hint:'purposeful'}, {word:'trudged',hint:'weary'}, {word:'ambled',hint:'relaxed'}, {word:'crept',hint:'stealthy'} ],
  looked: [ {word:'gazed',hint:'lingering'}, {word:'glanced',hint:'brief'}, {word:'stared',hint:'intense'}, {word:'peered',hint:'strained'} ],
  ran: [ {word:'sprinted',hint:'fast'}, {word:'bolted',hint:'sudden'}, {word:'dashed',hint:'urgent'}, {word:'fled',hint:'fearful'} ],
  happy: [ {word:'elated',hint:'intense'}, {word:'content',hint:'calm'}, {word:'joyful',hint:'warm'}, {word:'gleeful',hint:'playful'} ],
  sad: [ {word:'mournful',hint:'literary'}, {word:'forlorn',hint:'lonely'}, {word:'despondent',hint:'deep'}, {word:'crestfallen',hint:'visible'} ],
  nice: [ {word:'pleasant',hint:'plain'}, {word:'gracious',hint:'formal'}, {word:'charming',hint:'warm'}, {word:'agreeable',hint:'mild'} ],
  very: [ {word:'remarkably',hint:'elevated'}, {word:'intensely',hint:'strong'}, {word:'profoundly',hint:'deep'} ],
  angry: [ {word:'furious',hint:'intense'}, {word:'livid',hint:'visible'}, {word:'seething',hint:'contained'}, {word:'irate',hint:'formal'} ],
  scared: [ {word:'terrified',hint:'intense'}, {word:'uneasy',hint:'mild'}, {word:'petrified',hint:'frozen'}, {word:'apprehensive',hint:'formal'} ],
  dark: [ {word:'murky',hint:'unclear'}, {word:'shadowed',hint:'visual'}, {word:'pitch-black',hint:'absolute'}, {word:'dim',hint:'soft'} ],
  cold: [ {word:'frigid',hint:'extreme'}, {word:'icy',hint:'sharp'}, {word:'biting',hint:'wind'}, {word:'chill',hint:'literary'} ],
  thing: [ {word:'object',hint:'neutral'}, {word:'detail',hint:'specific'}, {word:'matter',hint:'abstract'} ],
  got: [ {word:'received',hint:'formal'}, {word:'gained',hint:'neutral'}, {word:'seized',hint:'forceful'}, {word:'earned',hint:'merit'} ],
};

/** Weak/vague verbs the heuristic flags for strengthening. */
const WEAK_VERBS = ['was', 'were', 'is', 'are', 'went', 'got', 'made', 'did', 'had', 'put', 'moved', 'looked', 'walked'];
/** Filler words the "concise" heuristic flags. */
const FILLER = ['very', 'really', 'quite', 'just', 'actually', 'simply', 'basically', 'literally', 'somewhat', 'rather', 'that', 'in order to', 'a lot of'];
/** Abstract words a "precise" heuristic flags. */
const VAGUE = ['thing', 'things', 'stuff', 'nice', 'good', 'bad', 'a lot', 'something', 'someone', 'somewhere'];

/**
 * Deterministic synonym lookup: consult the built-in thesaurus (case/plural/
 * capitalisation aware). Never throws; returns [] when the word is unknown.
 * @param {string} word
 * @returns {{ word:string, hint:string }[]}
 */
export function deterministicSynonyms(word) {
  const raw = String(word || '').trim();
  if (!raw) return [];
  const lc = raw.toLowerCase().replace(/^[-'’]+|[-'’]+$/g, '');
  let entry = THESAURUS[lc];
  // crude de-pluralisation / de-tensing so "walked"→walk etc. still hit.
  if (!entry && lc.endsWith('s')) entry = THESAURUS[lc.slice(0, -1)];
  if (!entry) return [];
  const capitalized = /^[A-Z]/.test(raw);
  return entry.slice(0, MAX_SYNONYMS).map((s) => ({
    word: capitalized ? s.word.charAt(0).toUpperCase() + s.word.slice(1) : s.word,
    hint: s.hint,
  }));
}

/**
 * Deterministic writing-device suggestions from mechanical heuristics. Always
 * returns an array; may be empty when the passage is clean (which is itself a
 * useful signal). Never throws.
 * @param {string} passage
 * @returns {{ kind:string, icon:string, label:string, note:string, rewrite:string }[]}
 */
export function deterministicDevices(passage) {
  const text = String(passage || '').trim();
  if (!text) return [];
  const out = [];
  const lower = text.toLowerCase();
  const push = (kind, note, rewrite = '') => {
    if (out.length >= MAX_DEVICES) return;
    const meta = deviceMeta(kind);
    out.push({ kind, icon: meta.icon, label: meta.label, note, rewrite });
  };

  // Weak verbs / "to be" + adjective constructions.
  const weakHit = WEAK_VERBS.find((v) => new RegExp(`\\b${v}\\b`).test(lower));
  if (weakHit) push('verb', `“${weakHit}” is doing a lot of work — a more specific verb would show the action instead of stating it.`);

  // Filler words.
  const fillerHits = FILLER.filter((f) => new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower));
  if (fillerHits.length) push('concise', `Trimming filler (${fillerHits.slice(0, 3).map((f) => `“${f}”`).join(', ')}) tightens the line.`);

  // Vague / abstract words.
  const vagueHit = VAGUE.find((v) => new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower));
  if (vagueHit) push('precise', `“${vagueHit}” is abstract — naming the concrete thing makes the image land.`);

  // Rhythm: very long single sentence, or several same-length sentences.
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const longest = sentences.reduce((m, s) => Math.max(m, s.split(/\s+/).length), 0);
  if (longest >= 28) push('rhythm', 'This sentence runs long — a short follow-up sentence would give it punch and control the pace.');
  else if (sentences.length >= 3 && new Set(sentences.map((s) => s.split(/\s+/).length)).size === 1) {
    push('rhythm', 'Several sentences share the same length — vary them to avoid a monotonous rhythm.');
  }

  // Sensory: no obvious sense words → nudge toward concrete detail.
  if (!/\b(saw|heard|felt|smell|scent|taste|cold|warm|bright|loud|soft|rough|sharp)\w*\b/.test(lower) && text.split(/\s+/).length >= 8) {
    push('sensory', 'Grounding the moment in one concrete sense (a sound, a smell, a texture) would pull the reader in.');
  }

  return out;
}

// ─── Live network calls (BYO key) ────────────────────────────────────────────

/** Low-level: call the configured provider with a system+user prompt. */
async function callProvider(system, user, timeoutMs = 15000) {
  const { provider, apiKey, model } = getAISettings();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: cfg.headers(apiKey),
      body: JSON.stringify(cfg.buildBody(model || cfg.defaultModel, system, user)),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return cfg.extractText(json);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Public entry: get synonyms for a word. Always resolves to a usable result.
 * Uses the model when a key is set (falling back to the on-device thesaurus on
 * any failure or empty result), otherwise resolves on-device.
 *
 * @param {string} word
 * @param {string} [context]  the sentence the word appears in
 * @returns {Promise<{ word:string, synonyms:{word:string,hint:string}[], usedAI:boolean }>}
 */
export async function getSynonyms(word, context = '') {
  const clean = String(word || '').trim();
  const offline = () => ({ word: clean, synonyms: deterministicSynonyms(clean), usedAI: false });
  if (!clean || !isAIEnabled()) return offline();
  try {
    const text = await callProvider(SYNONYM_SYSTEM_PROMPT, buildSynonymPrompt(clean, context));
    const synonyms = parseSynonyms(text, clean);
    if (!synonyms.length) return offline();
    return { word: clean, synonyms, usedAI: true };
  } catch (err) {
    console.warn('[LoreForge] Synonym lookup failed, using on-device thesaurus:', err.message);
    return offline();
  }
}

/**
 * Public entry: get writing-device suggestions for a passage. Always resolves to
 * a usable result (possibly an empty list, which means "this reads cleanly").
 *
 * @param {string} passage
 * @returns {Promise<{ suggestions:{kind:string,icon:string,label:string,note:string,rewrite:string}[], usedAI:boolean }>}
 */
export async function getWritingDevices(passage) {
  const clean = String(passage || '').trim();
  const offline = () => ({ suggestions: deterministicDevices(clean), usedAI: false });
  if (!clean || !isAIEnabled()) return offline();
  try {
    const text = await callProvider(DEVICE_SYSTEM_PROMPT, buildDevicePrompt(clean));
    const suggestions = parseDevices(text);
    if (!suggestions.length) return offline();
    return { suggestions, usedAI: true };
  } catch (err) {
    console.warn('[LoreForge] Device analysis failed, using on-device heuristics:', err.message);
    return offline();
  }
}
