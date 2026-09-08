/**
 * LoreForge Planner - Session Through-Line Synthesis
 *
 * Turns a raw history of writing sessions (free-form prose + timestamps) into a
 * cohesive overview of plot and characters — a "through-line" that ties the
 * sessions together. Originally built for timed writing sprints
 * (modules/writing-sprint.js, `writingSprints`), it is now generic so other
 * prose-history modules — e.g. freeform brainstorming (modules/brainstorm.js,
 * `brainstormSessions`) — can reuse the same engines by supplying a small
 * adapter (see `buildCorpus` options).
 *
 * Two engines, mirroring the app's offline-first AI philosophy (see core/ai.js):
 *   - Deterministic (always available, no key, no network): analyzes the prose
 *     locally — recurring named entities as likely characters, a chronological
 *     session timeline, goal progress, and recurring motifs — and assembles a
 *     structured overview.
 *   - AI-backed (optional, bring-your-own-key): sends a compact digest of the
 *     corpus to the user's configured provider and asks for a narrative
 *     through-line. On any error / no key, it silently falls back to the
 *     deterministic overview so the feature never breaks.
 *
 * The public entry point `getThroughLine()` always returns an immediately-usable
 * deterministic overview and, when AI is enabled, enriches it with a model-
 * written narrative.
 */

import { getAISettings } from './ai-settings.js';
import { PROVIDERS } from './ai.js';

// ─── Corpus assembly ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} Sprint
 * @property {string} id
 * @property {number} duration       minutes
 * @property {Array<{text:string, completed:boolean}>} goals
 * @property {string} content        the prose written in the session
 * @property {number} startedAt      epoch ms
 * @property {number} [endedAt]      epoch ms
 * @property {string} status         'running' | 'paused' | 'completed'
 * @property {number} [wordsWritten]
 */

/** Whitespace word count (matches writing-sprint.js / format.js). */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} CorpusSession
 * @property {string} id
 * @property {number} index         1-based chronological position
 * @property {number} date          epoch ms (0 if unknown)
 * @property {number} words
 * @property {string} content       trimmed prose
 * @property {Array<{text:string, completed:boolean}>} goals
 * @property {number} durationMin
 * @property {string} [title]        optional human label (e.g. brainstorm title)
 * @property {Array<{type:string, name:string}>} taggedEntities  explicit tags, if any
 */

/**
 * Normalize one raw sprint record into the common corpus-session shape.
 * @param {Sprint} s
 */
function normalizeSprint(s) {
  return {
    id: s.id,
    date: s.startedAt || s.endedAt || 0,
    words: s.status === 'completed' && typeof s.wordsWritten === 'number'
      ? s.wordsWritten
      : countWords(s.content),
    content: String(s.content || '').trim(),
    goals: Array.isArray(s.goals) ? s.goals.map((g) => ({ text: String(g.text || ''), completed: !!g.completed })) : [],
    durationMin: s.duration || 0,
    title: '',
    taggedEntities: [],
  };
}

/**
 * Generic corpus builder. Reduce a raw item array into an ordered, cleaned
 * corpus for analysis: items with no prose are dropped, and the rest are sorted
 * oldest-first so the timeline reads as a chronological through-line.
 *
 * @param {Array<object>} items
 * @param {object} [opts]
 * @param {(item:object) => (CorpusSession|null)} [opts.normalize] Adapter that
 *        maps a raw record to the common session shape (minus `index`). Defaults
 *        to the writing-sprint adapter.
 * @returns {{ sessions: CorpusSession[], totalWords:number, spanDays:number }}
 */
export function buildCorpus(items, { normalize = normalizeSprint } = {}) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((it) => {
      try { return normalize(it); } catch (_) { return null; }
    })
    .filter((s) => s && typeof s.content === 'string' && s.content.trim().length > 0)
    .sort((a, b) => (a.date || 0) - (b.date || 0));

  const sessions = normalized.map((s, i) => ({
    id: s.id,
    index: i + 1,
    date: s.date || 0,
    words: typeof s.words === 'number' ? s.words : countWords(s.content),
    content: s.content.trim(),
    goals: Array.isArray(s.goals) ? s.goals : [],
    durationMin: s.durationMin || 0,
    title: s.title || '',
    taggedEntities: Array.isArray(s.taggedEntities) ? s.taggedEntities : [],
  }));

  const totalWords = sessions.reduce((sum, s) => sum + (s.words || 0), 0);
  const first = sessions.length ? sessions[0].date : 0;
  const last = sessions.length ? sessions[sessions.length - 1].date : 0;
  const spanDays = first && last ? Math.max(1, Math.round((last - first) / DAY) + 1) : 0;

  return { sessions, totalWords, spanDays };
}

/**
 * Reduce a raw sprint array into an ordered corpus (thin wrapper over
 * `buildCorpus` with the sprint adapter). Kept for API stability.
 * @param {Sprint[]} sprints
 */
export function buildSprintCorpus(sprints) {
  return buildCorpus(sprints, { normalize: normalizeSprint });
}

// Brainstorm inline tags: @Character #Location !Faction ~Mystery *Tech.
// Mirrors the line-leading tag grammar of modules/brainstorm.js's parseTags,
// but kept self-contained so this core module has no module dependency.
const BRAINSTORM_TAG_PATTERNS = [
  { regex: /^@(\w[\w\s]*)/, type: 'character' },
  { regex: /^#(\w[\w\s]*)/, type: 'location' },
  { regex: /^!(\w[\w\s]*)/, type: 'faction' },
  { regex: /^~(\w[\w\s]*)/, type: 'mystery' },
  { regex: /^\*(\w[\w\s]*)/, type: 'technology' },
];

/**
 * Parse the explicit tags a writer placed in brainstorm prose into a list of
 * `{ type, name }` entities. These are a much stronger signal than the
 * proper-noun heuristic, so we feed them into the synthesis as known entities.
 * @param {string} content
 * @returns {Array<{type:string, name:string}>}
 */
export function parseBrainstormTags(content) {
  const out = [];
  String(content || '').split('\n').forEach((line) => {
    const trimmed = line.trim();
    for (const p of BRAINSTORM_TAG_PATTERNS) {
      const m = trimmed.match(p.regex);
      if (m) { out.push({ type: p.type, name: m[1].trim() }); break; }
    }
  });
  return out;
}

/**
 * Normalize one raw brainstorm session ({ id, title, content, createdAt }) into
 * the common corpus-session shape, attaching any explicit inline tags.
 */
function normalizeBrainstorm(s) {
  return {
    id: s.id,
    date: s.createdAt || 0,
    words: countWords(s.content),
    content: String(s.content || '').trim(),
    goals: [], // brainstorm has no goal checklist
    durationMin: 0,
    title: String(s.title || '').trim(),
    taggedEntities: parseBrainstormTags(s.content),
  };
}

/**
 * Reduce a raw brainstorm-session array into an ordered corpus.
 * @param {Array<{id,title,content,createdAt}>} bsSessions
 */
export function buildBrainstormCorpus(bsSessions) {
  return buildCorpus(bsSessions, { normalize: normalizeBrainstorm });
}

// ─── Deterministic language analysis ─────────────────────────────────────────

// Common capitalized words that are NOT character names, so we don't mistake
// them for cast members. Kept intentionally small and generic.
const STOP_CAPS = new Set([
  'The', 'A', 'An', 'And', 'But', 'Or', 'So', 'For', 'Nor', 'Yet',
  'I', 'He', 'She', 'It', 'We', 'They', 'You', 'His', 'Her', 'Their', 'Its',
  'This', 'That', 'These', 'Those', 'There', 'Then', 'Here', 'When', 'Where',
  'What', 'Who', 'Why', 'How', 'If', 'As', 'At', 'On', 'In', 'Of', 'To', 'By',
  'With', 'From', 'Into', 'Once', 'After', 'Before', 'While', 'Because',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Mr', 'Mrs', 'Ms', 'Dr', 'Sir', 'Lady', 'Lord', 'King', 'Queen',
  'No', 'Yes', 'Not', 'Never', 'Nothing', 'Something', 'Everything',
]);

// Everyday words we don't want to surface as "recurring motifs".
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'but', 'or', 'so', 'for', 'nor', 'yet', 'of', 'to',
  'in', 'on', 'at', 'by', 'with', 'from', 'into', 'as', 'is', 'was', 'were',
  'are', 'be', 'been', 'being', 'am', 'do', 'did', 'does', 'have', 'has', 'had',
  'i', 'he', 'she', 'it', 'we', 'they', 'you', 'his', 'her', 'their', 'its',
  'my', 'your', 'our', 'me', 'him', 'them', 'us', 'this', 'that', 'these',
  'those', 'there', 'then', 'here', 'when', 'where', 'what', 'who', 'why',
  'how', 'if', 'not', 'no', 'yes', 'up', 'down', 'out', 'over', 'under', 'off',
  'again', 'once', 'said', 'says', 'like', 'just', 'now', 'back', 'would',
  'could', 'should', 'will', 'can', 'may', 'might', 'must', 'shall', 'about',
  'than', 'too', 'very', 'more', 'most', 'some', 'any', 'all', 'each', 'every',
  'one', 'two', 'get', 'got', 'go', 'went', 'came', 'come', 'know', 'knew',
  'see', 'saw', 'look', 'looked', 'made', 'make', 'her', 'him', 'them',
]);

/**
 * Extract likely character names: capitalized tokens (not sentence-initial-only
 * stopwords) that recur across the corpus. Frequency across DISTINCT sessions is
 * a stronger signal than raw count, so we track both.
 *
 * @param {ReturnType<typeof buildSprintCorpus>['sessions']} sessions
 * @returns {Array<{name:string, mentions:number, sessions:number, firstSession:number, lastSession:number}>}
 */
export function extractCharacters(sessions) {
  const map = new Map(); // name -> { mentions, sessionSet:Set, first, last }
  // Count how often each candidate ALSO appears lowercased anywhere in the
  // corpus. A genuine name ("Kaelen") almost never appears lowercased, whereas
  // a common noun that only got capitalized because it opened a sentence
  // ("Smoke", "Betrayal") recurs in lowercase too — the strongest signal for
  // rejecting sentence-initial false positives.
  const lowerCounts = new Map();
  sessions.forEach((s) => {
    // Match words that are ALREADY lowercase in the source (do NOT lowercase the
    // text first — that would fold the capitalized name occurrences in too).
    (s.content.match(/\b[a-z][a-z'’-]+/g) || []).forEach((w) => {
      const word = w.replace(/['’-]+$/, '');
      lowerCounts.set(word, (lowerCounts.get(word) || 0) + 1);
    });
  });

  sessions.forEach((s) => {
    // Capture each capitalized token WITH the character just before it, so we
    // can tell sentence-initial occurrences (start of string, or after . ! ? :
    // ; " ( — / newline) from mid-sentence ones. A word that appears mid-
    // sentence is far more likely to be a real proper noun.
    const re = /(^|[\s"'“‘(\-—/]*)([A-Z][a-zA-Z'’-]+)/g;
    let m;
    while ((m = re.exec(s.content)) !== null) {
      const name = m[2].replace(/['’-]+$/, '');
      if (name.length < 3) continue;
      if (STOP_CAPS.has(name)) continue;
      // Determine whether this occurrence is sentence-initial: at string start
      // or immediately preceded (ignoring quotes/brackets/whitespace) by a
      // sentence terminator.
      const before = s.content.slice(0, m.index).replace(/[\s"'“‘(\-—/]+$/, '');
      const sentenceInitial = before === '' || /[.!?;:]$/.test(before);
      const entry = map.get(name) || { mentions: 0, sessionSet: new Set(), first: s.index, last: s.index, midSentence: 0, tagged: false };
      entry.mentions += 1;
      if (!sentenceInitial) entry.midSentence += 1;
      entry.sessionSet.add(s.index);
      entry.first = Math.min(entry.first, s.index);
      entry.last = Math.max(entry.last, s.index);
      map.set(name, entry);
    }
  });

  // Fold in EXPLICIT @character tags (brainstorm). A tag is an authoritative
  // signal — the writer literally labeled this name as a character — so a
  // tagged name always qualifies regardless of the proper-noun heuristics, and
  // counts as at least one mention in the session where it was tagged.
  sessions.forEach((s) => {
    (s.taggedEntities || []).forEach((t) => {
      if (!t || t.type !== 'character' || !t.name) return;
      const name = String(t.name).trim().split(/\s+/)[0]; // key on the first word
      if (name.length < 2) return;
      const entry = map.get(name) || { mentions: 0, sessionSet: new Set(), first: s.index, last: s.index, midSentence: 0, tagged: false };
      if (!entry.sessionSet.has(s.index)) entry.mentions += 1;
      entry.sessionSet.add(s.index);
      entry.first = Math.min(entry.first, s.index);
      entry.last = Math.max(entry.last, s.index);
      entry.tagged = true;
      map.set(name, entry);
    });
  });

  return Array.from(map.entries())
    .filter(([name, e]) => {
      // Explicitly tagged characters always qualify — the writer said so.
      if (e.tagged) return true;
      // A name mentioned only once total is likely noise, not a recurring character.
      if (e.mentions < 2) return false;
      // Reject candidates that appear lowercased about as often as capitalized:
      // that pattern marks a common word that merely started some sentences,
      // not a proper noun. Real names are overwhelmingly capitalized.
      const lower = lowerCounts.get(name.toLowerCase()) || 0;
      if (lower >= e.mentions) return false;
      // Reject candidates that ONLY ever appear at the start of a sentence —
      // that is the signature of a common word ("Smoke curled…", "Betrayal
      // was…") capitalized purely by position, not a proper noun. A real name
      // ("…suspected Kaelen") shows up mid-sentence at least once.
      if (e.midSentence === 0) return false;
      return true;
    })
    .map(([name, e]) => ({
      name,
      mentions: e.mentions,
      sessions: e.sessionSet.size,
      firstSession: e.first,
      lastSession: e.last,
      tagged: !!e.tagged,
    }))
    // Rank explicitly-tagged characters first, then by cross-session recurrence,
    // then by raw mentions.
    .sort((a, b) => (b.tagged - a.tagged) || (b.sessions - a.sessions) || (b.mentions - a.mentions));
}

/**
 * Recurring lowercased content words (motifs / themes) across the corpus,
 * excluding everyday stopwords and detected character names.
 */
export function extractMotifs(sessions, characters = []) {
  const nameSet = new Set(characters.map((c) => c.name.toLowerCase()));
  const counts = new Map();
  sessions.forEach((s) => {
    const words = (s.content.toLowerCase().match(/[a-z][a-z'’-]{3,}/g) || []);
    const seen = new Set();
    words.forEach((w) => {
      const word = w.replace(/['’-]+$/, '');
      if (word.length < 4) return;
      if (STOP_WORDS.has(word) || nameSet.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
      seen.add(word);
    });
  });
  return Array.from(counts.entries())
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

/** First sentence-ish fragment of a session, for a timeline beat label. */
function openingBeat(content, maxLen = 140) {
  const firstLine = content.split(/\n+/).find((l) => l.trim().length > 0) || content;
  const sentence = (firstLine.match(/^.*?[.!?](\s|$)/) || [firstLine])[0].trim();
  const beat = sentence || firstLine.trim();
  return beat.length > maxLen ? `${beat.slice(0, maxLen - 1).trimEnd()}…` : beat;
}

// Presets describing each source so summary/empty text reads naturally.
// `noun` is singular, `nouns` plural; `emptyHint` guides the user when there's
// nothing to analyze yet.
export const SOURCE_PRESETS = {
  sprint: {
    normalize: normalizeSprint,
    noun: 'writing sprint',
    nouns: 'writing sprints',
    emptyHint: 'No writing sprints with saved prose yet. Complete a sprint with some writing, then generate an overview to weave your sessions into a through-line.',
  },
  brainstorm: {
    normalize: normalizeBrainstorm,
    noun: 'brainstorm session',
    nouns: 'brainstorm sessions',
    emptyHint: 'No brainstorm sessions with notes yet. Jot down some ideas — and tag people with @Name — then generate an overview to weave your notes into a through-line.',
  },
};

/**
 * Build the deterministic through-line overview from a raw item history.
 *
 * @param {Array<object>} items  raw records (sprints or brainstorm sessions)
 * @param {object} [opts]
 * @param {'sprint'|'brainstorm'} [opts.source] Which preset to use (default 'sprint').
 * @returns {{
 *   empty: boolean,
 *   stats: { sessions:number, totalWords:number, spanDays:number },
 *   characters: ReturnType<typeof extractCharacters>,
 *   motifs: ReturnType<typeof extractMotifs>,
 *   timeline: Array<{index:number, date:number, words:number, beat:string, goals:string[], title:string}>,
 *   goals: { total:number, completed:number },
 *   summary: string,
 *   source: 'deterministic'
 * }}
 */
export function synthesizeThroughLine(items, opts = {}) {
  const preset = SOURCE_PRESETS[opts.source] || SOURCE_PRESETS.sprint;
  const corpus = buildCorpus(items, { normalize: preset.normalize });
  const { sessions, totalWords, spanDays } = corpus;

  if (!sessions.length) {
    return {
      empty: true,
      stats: { sessions: 0, totalWords: 0, spanDays: 0 },
      characters: [], motifs: [], timeline: [],
      goals: { total: 0, completed: 0 },
      summary: preset.emptyHint,
      source: 'deterministic',
    };
  }

  const characters = extractCharacters(sessions);
  const motifs = extractMotifs(sessions, characters);

  const timeline = sessions.map((s) => ({
    index: s.index,
    date: s.date,
    words: s.words,
    beat: s.title || openingBeat(s.content),
    goals: s.goals.map((g) => g.text).filter(Boolean),
    title: s.title || '',
  }));

  const allGoals = sessions.flatMap((s) => s.goals);
  const goals = { total: allGoals.length, completed: allGoals.filter((g) => g.completed).length };

  const summary = buildDeterministicSummary({ sessions, totalWords, spanDays, characters, motifs, goals, preset });

  return {
    empty: false,
    stats: { sessions: sessions.length, totalWords, spanDays },
    characters,
    motifs,
    timeline,
    goals,
    summary,
    source: 'deterministic',
  };
}

function buildDeterministicSummary({ sessions, totalWords, spanDays, characters, motifs, goals, preset }) {
  const parts = [];

  const spanText = spanDays > 1 ? ` across roughly ${spanDays} days` : '';
  const nounPlural = sessions.length === 1 ? preset.noun : preset.nouns;
  parts.push(`Over ${sessions.length} ${nounPlural}${spanText}, you've captured about ${totalWords.toLocaleString()} words.`);

  const leads = characters.slice(0, 3);
  if (leads.length) {
    const names = leads.map((c) => c.name);
    const cast = names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    parts.push(`Your through-line centers on ${cast}.`);

    const carrier = leads.find((c) => c.lastSession - c.firstSession >= Math.max(1, Math.floor(sessions.length / 2)));
    if (carrier) {
      parts.push(`${carrier.name} threads through the arc, appearing from session ${carrier.firstSession} to ${carrier.lastSession} — a natural spine to build the plot around.`);
    }
    const supporting = characters.slice(3, 6).map((c) => c.name);
    if (supporting.length) {
      parts.push(`Recurring supporting figures include ${supporting.join(', ')}.`);
    }
  } else {
    parts.push('No recurring named characters surfaced yet — the sessions may still be scene-setting or use pronouns/placeholders. Naming your cast will sharpen the through-line.');
  }

  if (motifs.length) {
    parts.push(`Recurring motifs that tie the sessions together: ${motifs.slice(0, 6).map((m) => m.word).join(', ')}.`);
  }

  if (goals.total) {
    parts.push(`Across your sprint goals, ${goals.completed} of ${goals.total} were marked complete.`);
  }

  parts.push('Read the timeline below as a chronological spine: each beat is where a session opened. Gaps between beats are where scenes or connective tissue may still be missing.');

  return parts.join(' ');
}

// ─── AI-backed synthesis (optional, bring-your-own-key) ──────────────────────

/** Is an AI provider configured with a key? (mirrors core/ai.js) */
export function isAIEnabled() {
  const s = getAISettings();
  return Boolean(s.provider && s.apiKey && PROVIDERS[s.provider]);
}

const AI_CHAR_BUDGET = 12000; // rough cap on prose we send, to bound token cost

/** Collapse tagged entities across the corpus into unique name lists by type. */
function collectTaggedEntities(sessions) {
  const byType = {};
  sessions.forEach((s) => {
    (s.taggedEntities || []).forEach((t) => {
      if (!t || !t.type || !t.name) return;
      (byType[t.type] = byType[t.type] || new Set()).add(t.name.trim());
    });
  });
  const out = {};
  Object.keys(byType).forEach((type) => { out[type] = Array.from(byType[type]); });
  return out;
}

/**
 * Build a compact digest of the corpus for the model. We include trimmed prose
 * excerpts (bounded by AI_CHAR_BUDGET) plus per-session metadata so the model
 * can reason about chronology and the deterministic signals we already
 * extracted (including any explicit tags the writer placed).
 *
 * @param {Array<object>} items
 * @param {object} [opts]
 * @param {'sprint'|'brainstorm'} [opts.source]
 */
export function buildSynthesisPrompt(items, opts = {}) {
  const preset = SOURCE_PRESETS[opts.source] || SOURCE_PRESETS.sprint;
  const { sessions, totalWords, spanDays } = buildCorpus(items, { normalize: preset.normalize });
  const characters = extractCharacters(sessions).slice(0, 12);
  const motifs = extractMotifs(sessions, characters).slice(0, 12);
  const tagged = collectTaggedEntities(sessions);

  // Distribute the character budget across sessions so early and late sessions
  // are both represented rather than the whole budget going to session 1.
  const perSession = sessions.length ? Math.max(400, Math.floor(AI_CHAR_BUDGET / sessions.length)) : AI_CHAR_BUDGET;
  const excerpts = sessions.map((s) => ({
    session: s.index,
    title: s.title || undefined,
    words: s.words,
    goals: s.goals.map((g) => `${g.completed ? '[done] ' : ''}${g.text}`).filter((t) => t.trim()),
    text: s.content.length > perSession ? `${s.content.slice(0, perSession)}…` : s.content,
  }));

  return JSON.stringify({
    sourceKind: preset.noun,
    totalSessions: sessions.length,
    totalWords,
    spanDays,
    likelyCharacters: characters.map((c) => c.name),
    recurringMotifs: motifs.map((m) => m.word),
    taggedEntities: Object.keys(tagged).length ? tagged : undefined,
    sessions: excerpts,
  });
}

export const SYNTHESIS_SYSTEM_PROMPT =
  'You are a developmental fiction editor. You are given a JSON digest of a writer\'s chronological writing sessions (the "sourceKind" field says whether these are timed writing sprints or freeform brainstorm notes): prose excerpts plus per-session goals/titles and pre-extracted candidate character names, motifs, and any explicit taggedEntities the writer marked. ' +
  'Weave the fragmented sessions into ONE cohesive through-line. Identify the emerging plot spine, the principal characters and their apparent arcs, unifying themes, and the gaps or loose threads a writer should resolve to make the material cohere. Prefer the explicit taggedEntities when present. ' +
  'Respond ONLY with JSON of the form {"narrative":"<2-4 paragraph prose overview tying the sessions together>","plotSpine":["<ordered beat>",...],"characters":[{"name":"<name>","role":"<short>","arc":"<one sentence>"}],"themes":["<theme>",...],"openThreads":["<loose end or gap>",...]}. ' +
  'Base every claim on the provided text. Do not invent named characters or events that are not supported by the excerpts.';

/**
 * Parse the model's JSON synthesis reply defensively (mirrors ai.js parsing).
 * @returns {null | { narrative:string, plotSpine:string[], characters:Array<{name,role,arc}>, themes:string[], openThreads:string[] }}
 */
export function parseSynthesis(text) {
  if (!text || typeof text !== 'string') return null;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { obj = JSON.parse(match[0]); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;

  const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
  const chars = Array.isArray(obj.characters)
    ? obj.characters
        .filter((c) => c && typeof c.name === 'string' && c.name.trim())
        .slice(0, 12)
        .map((c) => ({
          name: String(c.name).trim(),
          role: typeof c.role === 'string' ? c.role.trim() : '',
          arc: typeof c.arc === 'string' ? c.arc.trim() : '',
        }))
    : [];

  const narrative = typeof obj.narrative === 'string' ? obj.narrative.trim() : '';
  // A reply with no usable narrative and no structured content is not useful.
  if (!narrative && !chars.length && !strArr(obj.plotSpine).length) return null;

  return {
    narrative,
    plotSpine: strArr(obj.plotSpine).slice(0, 12),
    characters: chars,
    themes: strArr(obj.themes).slice(0, 12),
    openThreads: strArr(obj.openThreads).slice(0, 12),
  };
}

/** Low-level: call the configured provider and parse the synthesis. */
async function requestAISynthesis(items, opts = {}) {
  const { provider, apiKey, model } = getAISettings();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: cfg.headers(apiKey),
      body: JSON.stringify(cfg.buildBody(model || cfg.defaultModel, SYNTHESIS_SYSTEM_PROMPT, buildSynthesisPrompt(items, opts))),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = cfg.extractText(json);
    return parseSynthesis(text);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Public entry point. Always returns the deterministic overview; when AI is
 * enabled and succeeds, attaches an `ai` narrative section on top. Any
 * network/parse failure silently degrades to deterministic-only.
 *
 * @param {Array<object>} items  raw records (sprints or brainstorm sessions)
 * @param {object} [opts]
 * @param {'sprint'|'brainstorm'} [opts.source]
 * @returns {Promise<ReturnType<typeof synthesizeThroughLine> & { usedAI:boolean, ai: (null | ReturnType<typeof parseSynthesis>) }>}
 */
export async function getThroughLine(items, opts = {}) {
  const deterministic = synthesizeThroughLine(items, opts);

  if (deterministic.empty || !isAIEnabled()) {
    return { ...deterministic, usedAI: false, ai: null };
  }

  try {
    const ai = await requestAISynthesis(items, opts);
    if (!ai) return { ...deterministic, usedAI: false, ai: null };
    return { ...deterministic, usedAI: true, ai };
  } catch (err) {
    console.warn('[LoreForge] AI synthesis failed, using deterministic overview:', err.message);
    return { ...deterministic, usedAI: false, ai: null };
  }
}
