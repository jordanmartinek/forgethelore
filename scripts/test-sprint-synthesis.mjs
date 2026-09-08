/**
 * Writing-sprint through-line synthesis tests.
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-sprint-synthesis.mjs
 */

// ai-settings.js / ai.js touch localStorage at import; stub it.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

const S = await import('../src/core/sprint-synthesis.js');
const AI = await import('../src/core/ai.js');

// ── Fixture: a small chronological sprint history ────────────────────────────
const day = 24 * 60 * 60 * 1000;
const base = Date.parse('2026-01-01T09:00:00Z');
const sprints = [
  {
    id: 's3', duration: 20, status: 'completed', wordsWritten: 40,
    startedAt: base + 4 * day, endedAt: base + 4 * day + 1200000,
    goals: [{ text: 'Resolve the standoff', completed: true }],
    content: 'Kaelen finally cornered Mira in the throne room. The crown lay shattered between them. Betrayal, again, hung in the silence as Mira reached for the crown.',
  },
  {
    id: 's1', duration: 15, status: 'completed', wordsWritten: 38,
    startedAt: base, endedAt: base + 900000,
    goals: [{ text: 'Open on the harbor', completed: true }, { text: 'Introduce Kaelen', completed: false }],
    content: 'Kaelen watched the harbor burn. Smoke curled over the water. She had warned the council about the crown, but no one listened to Kaelen.',
  },
  {
    id: 's2', duration: 25, status: 'completed', wordsWritten: 42,
    startedAt: base + 2 * day, endedAt: base + 2 * day + 1500000,
    goals: [{ text: 'Mira enters', completed: true }],
    content: 'Mira crossed the ruined bridge at dawn. The crown had been stolen, and Mira suspected Kaelen. Smoke still clung to the harbor. Betrayal was in the air.',
  },
  // No-prose sprint: must be dropped from the corpus.
  { id: 's0', duration: 10, status: 'completed', wordsWritten: 0, startedAt: base - day, endedAt: base - day + 1, goals: [], content: '   ' },
];

// ── buildSprintCorpus: drops empties, sorts oldest-first, sums words ─────────
const corpus = S.buildSprintCorpus(sprints);
assert(corpus.sessions.length === 3, 'corpus drops the prose-less sprint (3 of 4 kept)');
assert(corpus.sessions[0].id === 's1' && corpus.sessions[2].id === 's3', 'corpus is sorted oldest-first by startedAt');
assert(corpus.sessions[0].index === 1 && corpus.sessions[2].index === 3, 'sessions are re-indexed 1..n in chronological order');
assert(corpus.totalWords === 120, 'totalWords sums completed wordsWritten (40+38+42)');
assert(corpus.spanDays === 5, 'spanDays spans first->last inclusive (day 0..4 => 5)');

// countWords on non-strings
assert(S.countWords('') === 0 && S.countWords(null) === 0 && S.countWords('a  b\nc') === 3, 'countWords handles empties and whitespace');

// ── extractCharacters: recurring proper nouns, ranked by cross-session reach ─
const chars = S.extractCharacters(corpus.sessions);
const names = chars.map((c) => c.name);
assert(names.includes('Kaelen') && names.includes('Mira'), 'detects recurring names Kaelen and Mira');
assert(!names.includes('The') && !names.includes('Smoke') && !names.includes('Betrayal'), 'stopword-caps and single-context caps are not treated as characters');
const kaelen = chars.find((c) => c.name === 'Kaelen');
assert(kaelen.sessions === 3, 'Kaelen recurs across all 3 sessions');
assert(kaelen.firstSession === 1 && kaelen.lastSession === 3, 'Kaelen spans session 1..3 (carries the arc)');
assert(chars[0].name === 'Kaelen', 'characters ranked by cross-session recurrence (Kaelen first)');

// A name appearing only once total is filtered out.
const once = S.extractCharacters([{ index: 1, content: 'Zephyr appeared briefly and then vanished forever.', goals: [] }]);
assert(once.length === 0, 'a name mentioned only once is not surfaced as a character');

// ── extractMotifs: recurring content words, excluding names & stopwords ──────
const motifs = S.extractMotifs(corpus.sessions, chars).map((m) => m.word);
assert(motifs.includes('crown'), 'recurring motif "crown" is surfaced');
assert(!motifs.includes('kaelen') && !motifs.includes('mira'), 'character names are excluded from motifs');
assert(!motifs.includes('the') && !motifs.includes('with'), 'stopwords are excluded from motifs');

// ── synthesizeThroughLine: full deterministic overview ───────────────────────
const overview = S.synthesizeThroughLine(sprints);
assert(overview.empty === false, 'overview is not empty for a real history');
assert(overview.source === 'deterministic', 'deterministic engine tags its source');
assert(overview.stats.sessions === 3 && overview.stats.totalWords === 120, 'overview stats match corpus');
assert(overview.timeline.length === 3 && overview.timeline[0].beat.length > 0, 'timeline has a beat per session');
assert(overview.timeline[0].beat.startsWith('Kaelen watched the harbor burn'), 'first beat is the opening line of the earliest session');
assert(overview.goals.total === 4 && overview.goals.completed === 3, 'goal totals aggregate across sessions');
assert(/Kaelen/.test(overview.summary), 'summary names the lead character');
assert(overview.characters[0].name === 'Kaelen', 'overview surfaces ranked characters');

// ── empty history ────────────────────────────────────────────────────────────
const empty = S.synthesizeThroughLine([]);
assert(empty.empty === true && empty.stats.sessions === 0, 'empty history reports empty');
assert(typeof empty.summary === 'string' && empty.summary.length > 0, 'empty history still gives guidance text');

// ── buildSynthesisPrompt: compact JSON digest, budget-bounded ────────────────
const promptStr = S.buildSynthesisPrompt(sprints);
const digest = JSON.parse(promptStr);
assert(digest.totalSessions === 3 && digest.totalWords === 120, 'prompt digest carries stats');
assert(Array.isArray(digest.sessions) && digest.sessions.length === 3, 'prompt digest includes one entry per session');
assert(digest.likelyCharacters.includes('Kaelen'), 'prompt digest passes pre-extracted characters to the model');
assert(digest.sessions[0].session === 1 && typeof digest.sessions[0].text === 'string', 'prompt sessions are indexed with text');

// Budget: a very long single session gets truncated with an ellipsis.
const longText = 'Word '.repeat(20000);
const bigPrompt = JSON.parse(S.buildSynthesisPrompt([{ id: 'x', duration: 60, status: 'completed', wordsWritten: 20000, startedAt: base, endedAt: base + 1, goals: [], content: longText }]));
assert(bigPrompt.sessions[0].text.endsWith('…'), 'over-budget prose is truncated with an ellipsis');
assert(bigPrompt.sessions[0].text.length < longText.length, 'truncated prose is shorter than the original');

// ── parseSynthesis: defensive parsing (mirrors ai.js) ────────────────────────
assert(S.parseSynthesis(null) === null, 'parseSynthesis(null) -> null');
assert(S.parseSynthesis('not json at all') === null, 'garbage -> null');
assert(S.parseSynthesis('{}') === null, 'empty object with no content -> null');

const good = S.parseSynthesis(JSON.stringify({
  narrative: 'Para one.\n\nPara two.',
  plotSpine: ['Harbor burns', 'Bridge crossing', 'Throne-room standoff', 42],
  characters: [{ name: 'Kaelen', role: 'protagonist', arc: 'From warner to avenger.' }, { bad: 'no name' }],
  themes: ['betrayal', 'power', 7],
  openThreads: ['Who stole the crown?'],
}));
assert(good && good.narrative.startsWith('Para one'), 'valid narrative parsed');
assert(good.plotSpine.length === 3, 'non-string plot beats are filtered out');
assert(good.characters.length === 1 && good.characters[0].name === 'Kaelen', 'characters without a name are dropped');
assert(good.themes.length === 2, 'non-string themes filtered');
assert(good.openThreads.length === 1, 'open threads parsed');

// Fenced / prose-wrapped JSON is still extracted.
const fenced = S.parseSynthesis('Here you go:\n```json\n{"narrative":"Hi","characters":[]}\n```\nHope that helps!');
assert(fenced && fenced.narrative === 'Hi', 'JSON embedded in prose/fences is extracted');

// ── Gemini provider registration (BYO-key) ───────────────────────────────────
assert(AI.PROVIDERS.gemini, 'gemini provider is registered');
assert(/generativelanguage\.googleapis\.com/.test(AI.PROVIDERS.gemini.url), 'gemini uses the Google generativelanguage endpoint');
assert(AI.PROVIDERS.gemini.url.endsWith('/chat/completions'), 'gemini uses the OpenAI-compatible chat/completions path');
const gHeaders = AI.PROVIDERS.gemini.headers('KEY123');
assert(gHeaders.Authorization === 'Bearer KEY123', 'gemini sends the key as a Bearer token');
const gBody = AI.PROVIDERS.gemini.buildBody('gemini-2.0-flash', 'sys', 'usr');
assert(gBody.model === 'gemini-2.0-flash' && gBody.messages.length === 2, 'gemini body is OpenAI-shaped');
assert(AI.PROVIDERS.gemini.extractText({ choices: [{ message: { content: 'ok' } }] }) === 'ok', 'gemini extractText reads OpenAI-shaped response');

// isAIEnabled reflects settings (no key => disabled).
assert(S.isAIEnabled() === false, 'isAIEnabled is false with no configured key');

// ── Brainstorm source path ───────────────────────────────────────────────────

// parseBrainstormTags: line-leading @/#/!/~/* tags -> {type,name}
const tags = S.parseBrainstormTags([
  '@Kaelen the exiled heir',
  'She wants the throne back.',
  '#Harbor District where it opens',
  '!Iron Circle the antagonist faction',
  '~The Missing Crown',
  '*Aetheric Engines',
  'plain line, no tag',
].join('\n'));
// The tag name greedily captures the rest of the line, matching the existing
// brainstorm.js parseTags grammar (so entities are named consistently with the
// app's push-to-modules feature).
assert(tags.length === 5, 'parseBrainstormTags finds all five tag types');
assert(tags[0].type === 'character' && tags[0].name === 'Kaelen the exiled heir', '@ -> character with full trailing text');
assert(tags.find((t) => t.type === 'location').name === 'Harbor District where it opens', '# -> location');
assert(tags.find((t) => t.type === 'faction').name === 'Iron Circle the antagonist faction', '! -> faction');
assert(tags.find((t) => t.type === 'mystery').name === 'The Missing Crown', '~ -> mystery');
assert(tags.find((t) => t.type === 'technology').name === 'Aetheric Engines', '* -> technology');

// buildBrainstormCorpus: schema {id,title,content,createdAt}, oldest-first
const bsBase = Date.parse('2026-02-01T09:00:00Z');
const bsSessions = [
  { id: 'b2', title: 'Midpoint ideas', content: '@Kaelen confronts the council. The crown is a lie. betrayal everywhere.', createdAt: bsBase + 2 * day },
  { id: 'b1', title: 'Opening', content: '@Kaelen escapes the harbor. The crown was stolen.\n#Harbor District burns as he flees.', createdAt: bsBase },
  { id: 'b0', title: 'Empty', content: '   ', createdAt: bsBase - day },
];
const bsCorpus = S.buildBrainstormCorpus(bsSessions);
assert(bsCorpus.sessions.length === 2, 'brainstorm corpus drops the empty session');
assert(bsCorpus.sessions[0].id === 'b1' && bsCorpus.sessions[1].id === 'b2', 'brainstorm corpus sorts oldest-first by createdAt');
assert(bsCorpus.sessions[0].title === 'Opening', 'brainstorm corpus carries the session title');
assert(bsCorpus.sessions[0].taggedEntities.some((t) => t.type === 'character' && /Kaelen/.test(t.name)), 'brainstorm corpus attaches parsed tags');

// extractCharacters folds explicit @character tags (tagged flag, ranked first).
const bsChars = S.extractCharacters(bsCorpus.sessions);
const kael = bsChars.find((c) => c.name === 'Kaelen');
assert(kael && kael.tagged === true, 'a @-tagged name is marked tagged=true');
assert(bsChars[0].tagged === true, 'tagged characters rank first');

// A tagged character qualifies even if it would fail the proper-noun heuristic
// (e.g. appears only once). "Solo" is tagged once and must still surface.
const soloCorpus = S.buildBrainstormCorpus([{ id: 'x', title: 't', content: '@Solo does a thing once.', createdAt: bsBase }]);
const soloChars = S.extractCharacters(soloCorpus.sessions);
assert(soloChars.some((c) => c.name === 'Solo' && c.tagged), 'a singly-tagged character still qualifies (explicit signal beats heuristics)');

// synthesizeThroughLine with the brainstorm preset
const bsOverview = S.synthesizeThroughLine(bsSessions, { source: 'brainstorm' });
assert(bsOverview.empty === false && bsOverview.stats.sessions === 2, 'brainstorm overview analyzes 2 sessions');
assert(/brainstorm session/.test(bsOverview.summary), 'brainstorm summary uses the brainstorm noun');
assert(bsOverview.timeline[0].beat === 'Opening', 'brainstorm timeline beat prefers the session title');
assert(bsOverview.characters.some((c) => c.name === 'Kaelen'), 'brainstorm overview surfaces the tagged lead');
assert(bsOverview.goals.total === 0, 'brainstorm has no goals');

// empty brainstorm history gives the brainstorm-specific hint
const bsEmpty = S.synthesizeThroughLine([], { source: 'brainstorm' });
assert(bsEmpty.empty === true && /brainstorm/.test(bsEmpty.summary), 'empty brainstorm history gives a brainstorm hint');

// buildSynthesisPrompt (brainstorm) includes taggedEntities and sourceKind
const bsPrompt = JSON.parse(S.buildSynthesisPrompt(bsSessions, { source: 'brainstorm' }));
assert(bsPrompt.sourceKind === 'brainstorm session', 'prompt digest tags the source kind');
assert(bsPrompt.taggedEntities && bsPrompt.taggedEntities.character, 'prompt digest carries tagged entities');
assert(bsPrompt.taggedEntities.location && bsPrompt.taggedEntities.location.some((n) => /Harbor District/.test(n)), 'prompt digest carries tagged locations');
assert(bsPrompt.sessions[0].title === 'Opening', 'prompt digest carries session titles');

// The sprint path is unaffected by the generalization (default source).
const sprintPrompt = JSON.parse(S.buildSynthesisPrompt(sprints));
assert(sprintPrompt.sourceKind === 'writing sprint', 'default prompt source is writing sprint');
assert(sprintPrompt.totalSessions === 3, 'default (sprint) path still builds a 3-session digest');

console.log(`\n${failed === 0 ? '✅' : '❌'} sprint-synthesis tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
