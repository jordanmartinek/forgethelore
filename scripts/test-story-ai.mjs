/**
 * Story-aware AI assistant tests.
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-story-ai.mjs
 *
 * Verifies the context builder reads the live stores, the deterministic
 * responder is genuinely useful (never empty), the reply parser is defensive,
 * and getStoryResponse resolves to a usable response with no AI key configured.
 */

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

// persist.js namespaces keys as `loreforge_{projectId}_{key}`; default proj is
// proj1 (no active project set), so seed with that prefix.
const P = 'loreforge_proj1_';
const put = (key, val) => globalThis.localStorage.setItem(P + key, JSON.stringify(val));

put('characters', [
  { id: 'c1', name: 'Mara Vega', role: 'Protagonist', faction: 'Free Colonies', goals: 'Find her brother', secrets: 'She caused the fire' },
  { id: 'c2', name: 'Elias', role: 'Mentor', faction: '' },
]);
put('locations', [
  { id: 'l1', name: 'Blackwater Lighthouse', type: 'Building', region: 'The Coast', description: 'A coastal watchtower built in 1842.' },
]);
put('factions', [{ id: 'f1', name: 'Free Colonies', goal: 'Independence' }]);
put('mysteries', [{ id: 'm1', title: 'The Missing Crown', question: 'Who took it?' }]);
put('pieces', [{ id: 'p1', name: 'Mara Vega', role: 'lead', faction: 'f1', momentum: 'rising', goal: 'find brother', hiddenGoal: 'atone' }]);
put('manuscriptScenes', {
  1: [{ id: 's1', title: 'The Storm', content: 'Mara walked toward Blackwater Lighthouse as the storm broke over the water.' }],
});

const A = await import('../src/core/story-ai.js');

// ── buildStoryContext reads the live stores ──────────────────────────────────
const ctx = A.buildStoryContext({ activeModule: 'manuscript' });
assert(ctx.activeModule === 'manuscript', 'context carries the active module');
assert(ctx.characters.length === 2 && ctx.characters[0].name === 'Mara Vega', 'context includes characters');
assert(ctx.characters[0].goal === 'Find her brother' && ctx.characters[0].secret === 'She caused the fire', 'character maps goals/secrets');
assert(ctx.locations.length === 1 && ctx.locations[0].name === 'Blackwater Lighthouse', 'context includes locations');
assert(ctx.factions.some((f) => f.name === 'Free Colonies'), 'context includes factions');
assert(ctx.mysteries.length === 1 && ctx.mysteries[0].title === 'The Missing Crown', 'context includes mysteries');
assert(ctx.manuscript.sceneCount === 1 && ctx.manuscript.totalWords > 0, 'context counts manuscript scenes + words');
assert(/Blackwater Lighthouse/.test(ctx.manuscript.recentSceneExcerpt), 'context includes recent scene excerpt');

// ── STORY_ACTIONS shape ──────────────────────────────────────────────────────
assert(Array.isArray(A.STORY_ACTIONS) && A.STORY_ACTIONS.length >= 5, 'STORY_ACTIONS defined');
assert(A.STORY_ACTIONS.some((a) => a.id === 'ask' && a.freeform), 'ask is a freeform action');
assert(A.STORY_ACTIONS.some((a) => a.id === 'continue'), 'continue action exists');

// ── deterministicStoryResponse: never empty, context-aware ───────────────────
const cont = A.deterministicStoryResponse('continue', '', ctx);
assert(cont.body && cont.body.length > 0, 'deterministic continue is non-empty');
assert(/Mara Vega|Blackwater/.test(cont.body), 'continue references real story entities');

const emptyCtx = A.deterministicStoryResponse('continue', '', { characters: [], boardActors: [], locations: [], factions: [], mysteries: [], manuscript: { sceneCount: 0, totalWords: 0 } });
assert(/no recent manuscript prose/i.test(emptyCtx.body), 'continue with no prose guides the writer');

const brainstorm = A.deterministicStoryResponse('brainstorm', '', ctx);
assert(brainstorm.body.split('\n').length >= 2, 'brainstorm returns multiple ideas');

const contradictions = A.deterministicStoryResponse('contradictions', '', ctx);
assert(contradictions.title && contradictions.body, 'contradictions returns a report');
assert(/Elias|faction/i.test(contradictions.body), 'contradictions flags the factionless character (Elias)');

const threads = A.deterministicStoryResponse('threads', '', ctx);
assert(/Missing Crown|hidden goal/i.test(threads.body), 'threads surfaces mysteries / hidden goals');

const develop = A.deterministicStoryResponse('develop', '', ctx);
assert(/Mara Vega/.test(develop.title + develop.body), 'develop targets a real character');

const ask = A.deterministicStoryResponse('ask', 'What is my story about?', ctx);
assert(ask.body && ask.body.length > 0, 'ask returns a non-empty answer');

// ── parseStoryReply: defensive ───────────────────────────────────────────────
assert(A.parseStoryReply(null) === null, 'parse null -> null');
assert(A.parseStoryReply('') === null, 'parse empty -> null');
const good = A.parseStoryReply('{"title":"Next beat","body":"- One\\n- Two"}');
assert(good && good.title === 'Next beat' && /One/.test(good.body), 'parses well-formed JSON');
const fenced = A.parseStoryReply('Sure!\n```json\n{"title":"T","body":"B"}\n```');
assert(fenced && fenced.body === 'B', 'extracts JSON from fenced/prose reply');
const prose = A.parseStoryReply('Just some plain prose with no json.');
assert(prose && prose.body === 'Just some plain prose with no json.', 'non-JSON prose falls back to a body');
assert(A.parseStoryReply('{}') === null, 'empty object -> null');

// ── getStoryResponse offline (no key) resolves to a usable, non-AI response ──
assert(A.isAIEnabled() === false, 'no AI key configured in test');
const res = await A.getStoryResponse('brainstorm', '', { activeModule: 'manuscript' });
assert(res && res.usedAI === false, 'offline response is marked not-AI');
assert(res.body && res.body.length > 0, 'offline response has content');

// ── Selection actions (highlight → contextual AI) ────────────────────────────
assert(Array.isArray(A.SELECTION_ACTIONS) && A.SELECTION_ACTIONS.length >= 6, 'SELECTION_ACTIONS defined');
assert(A.selectionAction('continue-from').mode === 'insert', 'continue-from is an insert action');
assert(A.selectionAction('improve').mode === 'replace', 'improve is a replace action');
assert(A.selectionAction('nope') === null, 'unknown selection action -> null');

// buildSelectionPrompt carries action + passage + story
const selPrompt = JSON.parse(A.buildSelectionPrompt('improve', 'The rain fell.', { characters: [] }));
assert(selPrompt.action === 'improve' && selPrompt.passage === 'The rain fell.' && selPrompt.story, 'buildSelectionPrompt shape');

// parseSelectionReply: {"text":...}, bare JSON string, prose, fenced
assert(A.parseSelectionReply('{"text":"Better prose."}') === 'Better prose.', 'parses {text}');
assert(A.parseSelectionReply('"just a string"') === 'just a string', 'parses bare JSON string');
assert(A.parseSelectionReply('Plain prose reply.') === 'Plain prose reply.', 'falls back to raw prose');
assert(A.parseSelectionReply('```\nFenced prose\n```') === 'Fenced prose', 'strips code fences');
assert(A.parseSelectionReply('') === null && A.parseSelectionReply(null) === null, 'empty/null -> null');

// deterministicSelectionResponse: never crashes, returns a string + note
const shorten = A.deterministicSelectionResponse('shorten', 'He was really very tired and just wanted to simply rest.');
assert(typeof shorten.text === 'string' && shorten.text.length > 0, 'shorten returns text');
assert(!/\breally\b|\bvery\b|\bjust\b|\bsimply\b/i.test(shorten.text), 'shorten strips filler words');
const improve = A.deterministicSelectionResponse('improve', 'The  cat   sat .');
assert(improve.text === 'The cat sat.', 'improve cleans spacing/punctuation');
assert(A.deterministicSelectionResponse('improve', '   ').text === '', 'empty passage -> empty text');

// getSelectionResponse offline resolves with mode + usedAI=false
const selRes = await A.getSelectionResponse('improve', 'The rain fell hard.', {});
assert(selRes && selRes.usedAI === false && selRes.mode === 'replace', 'offline selection response marked not-AI, replace mode');
assert(typeof selRes.text === 'string', 'offline selection response has text');
const contFrom = await A.getSelectionResponse('continue-from', 'She opened the door.', {});
assert(contFrom.mode === 'insert', 'continue-from resolves as insert mode');

console.log(`\n${failed === 0 ? '✅' : '❌'} story-ai tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
