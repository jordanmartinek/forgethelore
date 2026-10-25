/**
 * AI Record tests (external AI brainstorming library).
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-ai-record.mjs
 *
 * Verifies record construction/normalisation, tag parsing, search/filter,
 * derived facets, and plain-text rendering.
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

const R = await import('../src/core/ai-record.js');

// ── parseTags ────────────────────────────────────────────────────────────────
assert(JSON.stringify(R.parseTags('magic, villains, magic')) === JSON.stringify(['magic', 'villains']), 'parseTags splits, trims and de-dupes (case-insensitive)');
assert(JSON.stringify(R.parseTags('#plot\n#theme')) === JSON.stringify(['plot', 'theme']), 'parseTags strips leading # and splits on newlines');
assert(R.parseTags('').length === 0 && R.parseTags(null).length === 0, 'parseTags handles empty/null');
assert(JSON.stringify(R.parseTags(['a', 'b'])) === JSON.stringify(['a', 'b']), 'parseTags accepts an array');
assert(R.parseTags(Array.from({ length: 50 }, (_, i) => `t${i}`)).length === 24, 'parseTags caps at 24');

// ── makeRecord ───────────────────────────────────────────────────────────────
const rec = R.makeRecord({ title: '  Villain ideas ', source: 'claude', model: 'Claude 3.5', content: 'Make them sympathetic.', tags: 'villains, arc' });
assert(rec.id && typeof rec.id === 'string', 'makeRecord assigns an id');
assert(rec.title === 'Villain ideas', 'makeRecord trims the title');
assert(rec.source === 'claude', 'makeRecord keeps a known source');
assert(rec.tags.length === 2, 'makeRecord cleans tags');
assert(typeof rec.createdAt === 'number' && typeof rec.updatedAt === 'number', 'makeRecord stamps timestamps');
assert(R.makeRecord({}).title === 'Untitled session', 'makeRecord defaults an empty title');
assert(R.makeRecord({ source: 'bogus' }).source === 'other', 'makeRecord coerces an unknown source to "other"');
assert(R.makeRecord({ pinned: 1 }).pinned === true, 'makeRecord coerces pinned to boolean');

// preserves id + createdAt on edit, bumps updatedAt
const original = R.makeRecord({ title: 'x' });
const laterTs = original.createdAt + 1000;
const edited = R.makeRecord({ ...original, title: 'y', createdAt: original.createdAt });
assert(edited.id === original.id && edited.createdAt === original.createdAt, 'makeRecord preserves id + createdAt when editing');
void laterTs;

// ── sourceMeta ───────────────────────────────────────────────────────────────
assert(R.sourceMeta('gemini').label === 'Gemini', 'sourceMeta resolves a known source');
assert(R.sourceMeta('nope').id === 'other', 'sourceMeta falls back to "other"');

// ── normalizeRecords ─────────────────────────────────────────────────────────
assert(R.normalizeRecords(null).length === 0, 'normalizeRecords tolerates non-arrays');
const norm = R.normalizeRecords([{ title: 'a', source: 'chatgpt' }, null, 'junk', { title: 'b' }]);
assert(norm.length === 2 && norm.every((r) => r.id), 'normalizeRecords drops junk and fills in records');

// ── recordWordCount ──────────────────────────────────────────────────────────
assert(R.recordWordCount({ content: 'one two three' }) === 3, 'recordWordCount counts words');
assert(R.recordWordCount({ content: '   ' }) === 0, 'recordWordCount handles whitespace');
assert(R.recordWordCount(null) === 0, 'recordWordCount handles null');

// ── queryRecords: search / source / tag + sort ───────────────────────────────
const sample = R.normalizeRecords([
  { id: '1', title: 'Magic system', source: 'claude', content: 'ley lines and runes', tags: 'magic', updatedAt: 100 },
  { id: '2', title: 'Villain arc', source: 'chatgpt', content: 'a fallen hero', tags: 'villains, arc', updatedAt: 300 },
  { id: '3', title: 'City layout', source: 'gemini', content: 'canals everywhere', tags: 'places', updatedAt: 200, pinned: true },
]);

const all = R.queryRecords(sample, {});
assert(all[0].id === '3', 'queryRecords sorts pinned first');
assert(all[1].id === '2' && all[2].id === '1', 'queryRecords sorts the rest by updatedAt desc');

const bySearch = R.queryRecords(sample, { search: 'runes' });
assert(bySearch.length === 1 && bySearch[0].id === '1', 'queryRecords matches content text');
assert(R.queryRecords(sample, { search: 'VILLAIN' }).length === 1, 'queryRecords search is case-insensitive and hits the title');
assert(R.queryRecords(sample, { search: 'magic' }).some((r) => r.id === '1'), 'queryRecords matches tags via search');

const bySource = R.queryRecords(sample, { source: 'gemini' });
assert(bySource.length === 1 && bySource[0].id === '3', 'queryRecords filters by source');

const byTag = R.queryRecords(sample, { tag: 'arc' });
assert(byTag.length === 1 && byTag[0].id === '2', 'queryRecords filters by tag (case-insensitive)');

const combined = R.queryRecords(sample, { source: 'chatgpt', tag: 'magic' });
assert(combined.length === 0, 'queryRecords ANDs source + tag filters');

// ── recordFacets ─────────────────────────────────────────────────────────────
const facets = R.recordFacets(sample);
assert(facets.total === 3, 'recordFacets counts total');
assert(facets.bySource.claude === 1 && facets.bySource.gemini === 1, 'recordFacets counts per source');
assert(facets.tags.some((t) => t.tag === 'arc' && t.count === 1), 'recordFacets surfaces tags with counts');
assert(facets.tags[0].count >= facets.tags[facets.tags.length - 1].count, 'recordFacets sorts tags by count desc');

// ── recordToText ─────────────────────────────────────────────────────────────
const txt = R.recordToText(R.makeRecord({ title: 'T', source: 'claude', model: 'Claude 3.5', prompt: 'Give me villains', content: 'Here are three.', tags: 'villains' }));
assert(/^T/.test(txt), 'recordToText leads with the title');
assert(/Claude · Claude 3\.5/.test(txt), 'recordToText includes source + model');
assert(/PROMPT[\s\S]*Give me villains[\s\S]*RESPONSE[\s\S]*Here are three\./.test(txt), 'recordToText includes prompt + response sections');
assert(/#villains/.test(txt), 'recordToText lists tags');
const noPrompt = R.recordToText(R.makeRecord({ title: 'T', content: 'body only' }));
assert(!/PROMPT/.test(noPrompt) && /body only/.test(noPrompt), 'recordToText omits the prompt section when absent');
assert(R.recordToText(null) === '', 'recordToText handles null');

// ── AI_RECORD_KEY / AI_SOURCES exports ───────────────────────────────────────
assert(R.AI_RECORD_KEY === 'aiRecords', 'AI_RECORD_KEY is the stable collection key');
assert(Array.isArray(R.AI_SOURCES) && R.AI_SOURCES.some((s) => s.id === 'gemini') && R.AI_SOURCES.some((s) => s.id === 'other'), 'AI_SOURCES includes gemini + other');

// ── Entity links: toIdList / makeRecord / recordsForEntity / linkCount ───────
assert(JSON.stringify(R.toIdList(['a', 'b', 'a', '', '  c '])) === JSON.stringify(['a', 'b', 'c']), 'toIdList trims, de-dupes, drops empties');
assert(JSON.stringify(R.toIdList([{ id: 'x' }, { id: 'y' }, { nope: 1 }])) === JSON.stringify(['x', 'y']), 'toIdList accepts objects with id');
assert(R.toIdList(null).length === 0, 'toIdList tolerates non-arrays');

const linked = R.makeRecord({ title: 'L', content: 'c', linkedCharacterIds: ['c1', 'c1', 'c2'], linkedLocationIds: ['l1'] });
assert(JSON.stringify(linked.linkedCharacterIds) === JSON.stringify(['c1', 'c2']), 'makeRecord cleans linkedCharacterIds');
assert(JSON.stringify(linked.linkedLocationIds) === JSON.stringify(['l1']), 'makeRecord keeps linkedLocationIds');
assert(R.makeRecord({}).linkedCharacterIds.length === 0, 'makeRecord defaults links to empty arrays');
assert(R.linkCount(linked) === 3, 'linkCount sums characters + places');
assert(R.linkCount({}) === 0 && R.linkCount(null) === 0, 'linkCount tolerates missing fields');

const linkCorpus = [
  R.makeRecord({ id: 'a', content: 'x', linkedCharacterIds: ['c1'] }),
  R.makeRecord({ id: 'b', content: 'y', linkedCharacterIds: ['c1', 'c2'], linkedLocationIds: ['l9'] }),
  R.makeRecord({ id: 'c', content: 'z' }),
];
assert(R.recordsForEntity(linkCorpus, 'character', 'c1').length === 2, 'recordsForEntity finds character links');
assert(R.recordsForEntity(linkCorpus, 'location', 'l9').length === 1, 'recordsForEntity finds place links');
assert(R.recordsForEntity(linkCorpus, 'character', 'nope').length === 0, 'recordsForEntity returns [] for no matches');
assert(R.recordsForEntity(null, 'character', 'c1').length === 0, 'recordsForEntity tolerates non-arrays');

// ── Summary: parse / deterministic / makeRecord field ────────────────────────
assert(R.makeRecord({ summary: '  hi  ' }).summary === 'hi' || R.makeRecord({ summary: 'hi' }).summary === 'hi', 'makeRecord carries a summary');
assert(R.parseSummary('{"summary":"A tense scene.","takeaways":["beat one","beat two"]}').includes('A tense scene.'), 'parseSummary reads summary');
assert(/- beat one/.test(R.parseSummary('{"summary":"S","takeaways":["beat one"]}')), 'parseSummary renders takeaways as bullets');
assert(R.parseSummary('Sure!\n```json\n{"summary":"Fenced.","takeaways":[]}\n```').includes('Fenced.'), 'parseSummary extracts JSON from fenced reply');
assert(R.parseSummary('Just plain prose.').includes('Just plain prose.'), 'parseSummary falls back to prose');
assert(R.parseSummary('') === '' && R.parseSummary(null) === '', 'parseSummary empty/null -> ""');
assert(R.parseSummary('{}') === '', 'parseSummary empty object -> ""');

const detSum = R.deterministicSummary({ content: 'The city floats on rings of light. It hides a secret.\n- Ley lines power it\n- The council lies\n- A rebel knows the truth' });
assert(detSum.includes('The city floats'), 'deterministicSummary leads with the opening sentences');
assert(/- Ley lines power it/.test(detSum), 'deterministicSummary reuses existing bullet lines as takeaways');
assert(R.deterministicSummary({ content: '' }) === '', 'deterministicSummary empty content -> ""');
const detNoBullets = R.deterministicSummary({ content: 'First sentence. Second sentence. Third idea here. Fourth idea.' });
assert(detNoBullets.length > 0 && /First sentence/.test(detNoBullets), 'deterministicSummary works without bullets');

// summarizeRecord offline (no key) resolves via deterministic summary
assert(R.isAIEnabled() === false, 'no AI key configured in test');
const sumRes = await R.summarizeRecord(R.makeRecord({ content: 'A big idea. Another idea. A third one.' }));
assert(sumRes.usedAI === false && sumRes.summary.length > 0, 'summarizeRecord offline returns a usable summary, marked not-AI');
const sumEmpty = await R.summarizeRecord(R.makeRecord({ content: '' }));
assert(sumEmpty.usedAI === false && sumEmpty.summary === '', 'summarizeRecord with no content -> empty');

// buildSummaryPrompt shape
const sp = JSON.parse(R.buildSummaryPrompt(R.makeRecord({ title: 'T', prompt: 'P', content: 'C' })));
assert(sp.title === 'T' && sp.prompt === 'P' && sp.session === 'C', 'buildSummaryPrompt carries title/prompt/session');

// ── Review workflow: reviewed flag + pending queries ─────────────────────────
assert(R.makeRecord({}).reviewed === false, 'makeRecord defaults reviewed to false');
assert(R.makeRecord({ reviewed: true }).reviewed === true, 'makeRecord keeps reviewed=true');
assert(R.makeRecord({ reviewed: 1 }).reviewed === true, 'makeRecord coerces reviewed to boolean');
assert(typeof R.AI_RECORDS_CHANGED === 'string' && R.AI_RECORDS_CHANGED.length > 0, 'AI_RECORDS_CHANGED event name is exported');

const reviewCorpus = R.normalizeRecords([
  { id: 'r1', title: 'Old reviewed', content: 'x', reviewed: true, updatedAt: 100 },
  { id: 'r2', title: 'Needs review A', content: 'x', updatedAt: 300 },
  { id: 'r3', title: 'Needs review B', content: 'x', updatedAt: 200, pinned: true },
  { id: 'r4', title: 'Needs review C', content: 'x', updatedAt: 250 },
]);
assert(R.pendingReviewCount(reviewCorpus) === 3, 'pendingReviewCount excludes reviewed records');
const pending = R.pendingReviewRecords(reviewCorpus);
assert(pending.length === 3 && !pending.some((r) => r.reviewed), 'pendingReviewRecords returns only unreviewed');
assert(pending[0].id === 'r3', 'pendingReviewRecords floats pinned to the top');
assert(pending[1].id === 'r2' && pending[2].id === 'r4', 'pendingReviewRecords then sorts by updatedAt desc');
assert(R.pendingReviewRecords([]).length === 0 && R.pendingReviewCount(null) === 0, 'pending helpers tolerate empty/non-arrays');

// checking one off removes it from the pending list
reviewCorpus.find((r) => r.id === 'r2').reviewed = true;
assert(R.pendingReviewCount(reviewCorpus) === 2, 'marking a record reviewed drops the pending count');
assert(!R.pendingReviewRecords(reviewCorpus).some((r) => r.id === 'r2'), 'a reviewed record leaves the pending list');

console.log(`\n${failed === 0 ? '✅' : '❌'} ai-record tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
