/**
 * LoreForge Planner - Writing Sprint Through-Line Synthesis
 *
 * Turns a raw history of timed writing sprints (free-form prose + goals +
 * timestamps, as stored by modules/writing-sprint.js under the `writingSprints`
 * key) into a cohesive overview of plot and characters — a "through-line" that
 * ties the sessions together.
 *
 * Two engines, mirroring the app's offline-first AI philosophy (see core/ai.js):
 *   - Deterministic (always available, no key, no network): analyzes the prose
 *     locally — recurring named entities as likely characters, a chronological
 *     session timeline, goal progress, and recurring motifs — and assembles a
 *     structured overview.
 *   - AI-backed (optional, bring-your-own-key): sends a compact digest of the
 *     sprint corpus to the user's configured provider and asks for a narrative
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
 * Reduce a raw sprint array into an ordered, cleaned corpus for analysis.
 * Sprints with no prose are dropped; the rest are sorted oldest-first so the
 * timeline reads as a chronological through-line.
 *
 * @param {Sprint[]} sprints
 * @returns {{ sessions: Array<{id,index,date,words,content,goals,durationMin}>, totalWords:number, spanDays:number }}
 */
export function buildSprintCorpus(sprints) {
  const withText = (Array.isArray(sprints) ? sprints : [])
    .filter((s) => s && typeof s.content === 'string' && s.content.trim().length > 0)
    .slice()
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  const sessions = withText.map((s, i) => ({
    id: s.id,
    index: i + 1,
    date: s.startedAt || s.endedAt || 0,
    words: s.status === 'completed' && typeof s.wordsWritten === 'number'
      ? s.wordsWritten
      : countWords(s.content),
    content: s.content.trim(),
    goals: Array.isArray(s.goals) ? s.goals.map((g) => ({ text: String(g.text || ''), completed: !!g.completed })) : [],
    durationMin: s.duration || 0,
  }));

  const totalWords = sessions.reduce((sum, s) => sum + (s.words || 0), 0);
  const first = sessions.length ? sessions[0].date : 0;
  const last = sessions.length ? sessions[sessions.length - 1].date : 0;
  const spanDays = first && last ? Math.max(1, Math.round((last - first) / DAY) + 1) : 0;

  return { sessions, totalWords, spanDays };
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
      const entry = map.get(name) || { mentions: 0, sessionSet: new Set(), first: s.index, last: s.index, midSentence: 0 };
      entry.mentions += 1;
      if (!sentenceInitial) entry.midSentence += 1;
      entry.sessionSet.add(s.index);
      entry.first = Math.min(entry.first, s.index);
      entry.last = Math.max(entry.last, s.index);
      map.set(name, entry);
    }
  });

  return Array.from(map.entries())
    .filter(([name, e]) => {
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
    }))
    // Rank by cross-session recurrence first, then raw mentions.
    .sort((a, b) => b.sessions - a.sessions || b.mentions - a.mentions);
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

/**
 * Build the deterministic through-line overview from a corpus.
 *
 * @param {Sprint[]} sprints
 * @returns {{
 *   empty: boolean,
 *   stats: { sessions:number, totalWords:number, spanDays:number },
 *   characters: ReturnType<typeof extractCharacters>,
 *   motifs: ReturnType<typeof extractMotifs>,
 *   timeline: Array<{index:number, date:number, words:number, beat:string, goals:string[]}>,
 *   goals: { total:number, completed:number },
 *   summary: string,
 *   source: 'deterministic'
 * }}
 */
export function synthesizeThroughLine(sprints) {
  const corpus = buildSprintCorpus(sprints);
  const { sessions, totalWords, spanDays } = corpus;

  if (!sessions.length) {
    return {
      empty: true,
      stats: { sessions: 0, totalWords: 0, spanDays: 0 },
      characters: [], motifs: [], timeline: [],
      goals: { total: 0, completed: 0 },
      summary: 'No writing sprints with saved prose yet. Complete a sprint with some writing, then generate an overview to weave your sessions into a through-line.',
      source: 'deterministic',
    };
  }

  const characters = extractCharacters(sessions);
  const motifs = extractMotifs(sessions, characters);

  const timeline = sessions.map((s) => ({
    index: s.index,
    date: s.date,
    words: s.words,
    beat: openingBeat(s.content),
    goals: s.goals.map((g) => g.text).filter(Boolean),
  }));

  const allGoals = sessions.flatMap((s) => s.goals);
  const goals = { total: allGoals.length, completed: allGoals.filter((g) => g.completed).length };

  const summary = buildDeterministicSummary({ sessions, totalWords, spanDays, characters, motifs, goals });

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

function buildDeterministicSummary({ sessions, totalWords, spanDays, characters, motifs, goals }) {
  const parts = [];

  const spanText = spanDays > 1 ? ` across roughly ${spanDays} days` : '';
  parts.push(`Over ${sessions.length} writing sprint${sessions.length === 1 ? '' : 's'}${spanText}, you've written about ${totalWords.toLocaleString()} words.`);

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

/**
 * Build a compact digest of the sprint corpus for the model. We include trimmed
 * prose excerpts (bounded by AI_CHAR_BUDGET) plus per-session metadata so the
 * model can reason about chronology and the deterministic signals we already
 * extracted.
 */
export function buildSynthesisPrompt(sprints) {
  const { sessions, totalWords, spanDays } = buildSprintCorpus(sprints);
  const characters = extractCharacters(sessions).slice(0, 12);
  const motifs = extractMotifs(sessions, characters).slice(0, 12);

  // Distribute the character budget across sessions so early and late sessions
  // are both represented rather than the whole budget going to session 1.
  const perSession = sessions.length ? Math.max(400, Math.floor(AI_CHAR_BUDGET / sessions.length)) : AI_CHAR_BUDGET;
  const excerpts = sessions.map((s) => ({
    session: s.index,
    words: s.words,
    goals: s.goals.map((g) => `${g.completed ? '[done] ' : ''}${g.text}`).filter((t) => t.trim()),
    text: s.content.length > perSession ? `${s.content.slice(0, perSession)}…` : s.content,
  }));

  return JSON.stringify({
    totalSessions: sessions.length,
    totalWords,
    spanDays,
    likelyCharacters: characters.map((c) => c.name),
    recurringMotifs: motifs.map((m) => m.word),
    sessions: excerpts,
  });
}

export const SYNTHESIS_SYSTEM_PROMPT =
  'You are a developmental fiction editor. You are given a JSON digest of a writer\'s timed writing sprints: chronological prose excerpts plus per-session goals and pre-extracted candidate character names and motifs. ' +
  'Weave the fragmented sessions into ONE cohesive through-line. Identify the emerging plot spine, the principal characters and their apparent arcs, unifying themes, and the gaps or loose threads a writer should resolve to make the sessions cohere. ' +
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
async function requestAISynthesis(sprints) {
  const { provider, apiKey, model } = getAISettings();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: cfg.headers(apiKey),
      body: JSON.stringify(cfg.buildBody(model || cfg.defaultModel, SYNTHESIS_SYSTEM_PROMPT, buildSynthesisPrompt(sprints))),
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
 * @param {Sprint[]} sprints
 * @returns {Promise<ReturnType<typeof synthesizeThroughLine> & { usedAI:boolean, ai: (null | ReturnType<typeof parseSynthesis>) }>}
 */
export async function getThroughLine(sprints) {
  const deterministic = synthesizeThroughLine(sprints);

  if (deterministic.empty || !isAIEnabled()) {
    return { ...deterministic, usedAI: false, ai: null };
  }

  try {
    const ai = await requestAISynthesis(sprints);
    if (!ai) return { ...deterministic, usedAI: false, ai: null };
    return { ...deterministic, usedAI: true, ai };
  } catch (err) {
    console.warn('[LoreForge] AI synthesis failed, using deterministic overview:', err.message);
    return { ...deterministic, usedAI: false, ai: null };
  }
}
