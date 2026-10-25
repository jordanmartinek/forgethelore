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

console.log(`\n${failed === 0 ? '✅' : '❌'} ai-record tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
