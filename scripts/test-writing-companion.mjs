/**
 * Writing Companion tests (real-time synonyms + writing devices).
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-writing-companion.mjs
 *
 * Verifies word extraction from a caret/selection, sentence windowing, the
 * defensive reply parsers, the on-device thesaurus + heuristic engines (always
 * useful, never crash), and that getSynonyms/getWritingDevices resolve to a
 * usable, non-AI result when no key is configured.
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

const W = await import('../src/core/writing-companion.js');

// ── wordAt: caret inside a word ──────────────────────────────────────────────
const text = 'The quick brown fox jumped over the lazy dog.';
const mid = W.wordAt(text, 6); // inside "quick"
assert(mid && mid.word === 'quick', 'wordAt finds the word under the caret');
assert(text.slice(mid.start, mid.end) === 'quick', 'wordAt returns correct bounds');
assert(typeof mid.context === 'string' && mid.context.includes('quick'), 'wordAt returns surrounding context');

// caret just past the end of a word nudges left onto it
const past = W.wordAt(text, 9); // right after "quick"
assert(past && past.word === 'quick', 'wordAt nudges left when caret sits just past a word');

// caret on whitespace with no adjacent word char → null
assert(W.wordAt('a   b', 2) === null, 'wordAt returns null on bare whitespace');
assert(W.wordAt('', 0) === null, 'wordAt returns null on empty text');

// explicit single-word selection is honoured
const sel = W.wordAt(text, 16, 19); // "fox"
assert(sel && sel.word === 'fox', 'wordAt honours a single-word selection');

// multi-word selection is not treated as a single word (falls back to caret)
const multi = W.wordAt(text, 4, 15); // "quick brown"
assert(multi && multi.word === 'quick', 'wordAt falls back to caret word for a multi-word selection');

// ── sentenceAround ───────────────────────────────────────────────────────────
const para = 'She ran. The door slammed shut behind her, loud and final. Then silence.';
const s = W.sentenceAround(para, 30); // inside the middle sentence
assert(/door slammed shut/.test(s), 'sentenceAround extracts the sentence around the caret');
assert(!/She ran/.test(s), 'sentenceAround does not bleed into the previous sentence');
assert(W.sentenceAround('', 0) === '', 'sentenceAround empty text -> empty string');
assert(W.sentenceAround(para).length > 0, 'sentenceAround with no offset returns a (capped) tail');

// ── parseSynonyms: defensive ─────────────────────────────────────────────────
assert(W.parseSynonyms(null).length === 0, 'parseSynonyms null -> []');
const sy = W.parseSynonyms('{"synonyms":[{"word":"strode","hint":"purposeful"},{"word":"walked"}]}', 'walked');
assert(sy.length === 1 && sy[0].word === 'strode' && sy[0].hint === 'purposeful', 'parseSynonyms parses objects and drops the original word');
const syArr = W.parseSynonyms('["big","huge","big","vast"]', 'tiny');
assert(syArr.length === 3, 'parseSynonyms accepts a bare string array and de-dupes');
const syFenced = W.parseSynonyms('Here you go:\n```json\n{"synonyms":["swift","rapid"]}\n```', 'slow');
assert(syFenced.length === 2 && syFenced[0].word === 'swift', 'parseSynonyms extracts JSON from fenced/prose reply');
assert(W.parseSynonyms('not json at all').length === 0, 'parseSynonyms junk -> []');

// cap at MAX_SYNONYMS
const many = W.parseSynonyms(JSON.stringify({ synonyms: Array.from({ length: 20 }, (_, i) => `w${i}`) }), 'x');
assert(many.length === W.MAX_SYNONYMS, 'parseSynonyms caps at MAX_SYNONYMS');

// ── parseDevices: defensive ──────────────────────────────────────────────────
assert(W.parseDevices(null).length === 0, 'parseDevices null -> []');
const dv = W.parseDevices('{"suggestions":[{"kind":"verb","note":"swap was","rewrite":"she bolted"},{"kind":"bogus","note":"x"}]}');
assert(dv.length === 2, 'parseDevices keeps well-formed suggestions');
assert(dv[0].kind === 'verb' && dv[0].icon && dv[0].label === 'Stronger verb', 'parseDevices attaches icon + label from DEVICE_KINDS');
assert(dv[1].kind === 'precise', 'parseDevices coerces an unknown kind to a safe default');
assert(W.parseDevices('{"suggestions":[{}]}').length === 0, 'parseDevices drops empty suggestions');

// ── deterministicSynonyms: on-device thesaurus ───────────────────────────────
assert(W.deterministicSynonyms('said').some((x) => x.word === 'murmured'), 'thesaurus knows "said"');
assert(W.deterministicSynonyms('Walked')[0].word[0] === 'S', 'thesaurus preserves capitalisation (Walked -> Strode)');
assert(W.deterministicSynonyms('things').length > 0, 'thesaurus de-pluralises (things -> thing)');
assert(W.deterministicSynonyms('xyzzy').length === 0, 'thesaurus returns [] for unknown words');
assert(W.deterministicSynonyms('').length === 0, 'thesaurus returns [] for empty input');

// ── deterministicDevices: heuristics, never crash, context-aware ─────────────
const weak = W.deterministicDevices('She was very happy and it was a nice thing.');
assert(weak.length > 0, 'devices flag something in a weak sentence');
assert(weak.some((d) => d.kind === 'verb'), 'devices flag a weak verb ("was")');
assert(weak.some((d) => d.kind === 'concise'), 'devices flag filler ("very")');
assert(weak.some((d) => d.kind === 'precise'), 'devices flag a vague word ("thing"/"nice")');

const longSentence = 'He walked ' + 'and walked '.repeat(10) + 'until the road finally ended somewhere far beyond the hills.';
assert(W.deterministicDevices(longSentence).some((d) => d.kind === 'rhythm'), 'devices flag an over-long sentence (rhythm)');

assert(W.deterministicDevices('').length === 0, 'devices on empty passage -> []');
assert(Array.isArray(W.deterministicDevices('The cold wind bit sharp against her face.')), 'devices always return an array');

// ── getSynonyms / getWritingDevices offline (no key) ─────────────────────────
assert(W.isAIEnabled() === false, 'no AI key configured in test');
const gs = await W.getSynonyms('big', 'It was a big house.');
assert(gs.usedAI === false && gs.word === 'big' && gs.synonyms.length > 0, 'getSynonyms offline resolves via thesaurus, marked not-AI');
const gsUnknown = await W.getSynonyms('xyzzy');
assert(gsUnknown.usedAI === false && gsUnknown.synonyms.length === 0, 'getSynonyms offline tolerates unknown words');

const gd = await W.getWritingDevices('She was very sad about the thing.');
assert(gd.usedAI === false && gd.suggestions.length > 0, 'getWritingDevices offline resolves via heuristics, marked not-AI');
const gdClean = await W.getWritingDevices('');
assert(gdClean.usedAI === false && gdClean.suggestions.length === 0, 'getWritingDevices empty passage -> no suggestions');

// ── Prompt builders carry the expected shape ─────────────────────────────────
const synPrompt = JSON.parse(W.buildSynonymPrompt('walked', 'She walked home.'));
assert(synPrompt.word === 'walked' && synPrompt.sentence === 'She walked home.', 'buildSynonymPrompt shape');
const devPrompt = JSON.parse(W.buildDevicePrompt('The rain fell.'));
assert(devPrompt.passage === 'The rain fell.', 'buildDevicePrompt shape');

console.log(`\n${failed === 0 ? '✅' : '❌'} writing-companion tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
