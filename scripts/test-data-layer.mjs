/**
 * Functional tests for the Phase 2 data layer (repo, entities, search).
 * Zero dependencies — uses a localStorage stub and plain asserts.
 * Run: NODE_OPTIONS= node scripts/test-data-layer.mjs
 */

// ── localStorage stub (namespaced like the real app) ────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗', msg); }
}

// persist.js initializes its prefix from loreforge_activeProjectId at import.
store.set('loreforge_activeProjectId', 'projX');

const repo = await import('../src/core/repo.js');
const { Collections } = repo;
const entities = await import('../src/core/entities.js');
const { searchContent } = await import('../src/core/search.js');

// ── Seed a tiny world ────────────────────────────────────────────────────────
const PFX = 'loreforge_projX_';
store.set(PFX + Collections.BOARD_FACTIONS, JSON.stringify([
  { id: 'f1', name: 'The Dominion', color: '#ef4444' },
  { id: 'f2', name: 'Free Colonies', color: '#f59e0b' },
]));
store.set(PFX + Collections.PIECES, JSON.stringify([
  { id: 'p1', name: 'Aurelian', faction: 'f1' },
  { id: 'p2', name: 'Captain Sera', faction: 'f2' },
]));
store.set(PFX + Collections.CHARACTERS, JSON.stringify([
  { id: 'c1', name: 'Dr. Orin Voss', faction: 'Free Colonies', description: 'Void researcher' },
]));
store.set(PFX + Collections.SCENES, JSON.stringify([
  { id: 's1', title: 'The Conduit Discovery', summary: 'Scouts find the Void Conduit', participants: ['p1', 'p2'] },
]));
store.set(PFX + Collections.RELATIONSHIPS, JSON.stringify([
  { id: 'r1', sourceId: 'p2', targetId: 'p1', type: 'opposition' },
]));
store.set(PFX + Collections.CONFLICT_LINES, JSON.stringify([
  { from: 'p1', to: 'p2', type: 'opposition' },
]));

// ── repo basics ──────────────────────────────────────────────────────────────
assert(repo.list(Collections.PIECES).length === 2, 'repo.list reads pieces');
assert(repo.getById(Collections.PIECES, 'p1').name === 'Aurelian', 'repo.getById finds record');
repo.upsert(Collections.PIECES, { id: 'p1', momentum: 'rising' });
assert(repo.getById(Collections.PIECES, 'p1').momentum === 'rising', 'repo.upsert merges');
repo.upsert(Collections.PIECES, { id: 'p3', name: 'Senator Vex', faction: 'f1' });
assert(repo.list(Collections.PIECES).length === 3, 'repo.upsert appends new');
repo.remove(Collections.PIECES, 'p3');
assert(repo.list(Collections.PIECES).length === 2, 'repo.remove deletes');

// ── entity graph ─────────────────────────────────────────────────────────────
const { entities: ents, edges, map } = entities.buildGraph();
assert(map.has('f1') && map.has('p1') && map.has('c1') && map.has('s1'), 'entity map has factions, pieces, chars, scenes');
assert(map.get('p1').color === '#ef4444', 'piece inherits faction color');

// Name resolution: character.faction = "Free Colonies" -> f2
assert(entities.resolveIdByName(map, 'Free Colonies', 'faction') === 'f2', 'resolveIdByName maps name to faction id');

// Edges: progression rel, conflict line, membership, char->faction, scene features
const hasEdge = (s, t) => edges.some((e) => e.source === s && e.target === t);
assert(hasEdge('p2', 'p1'), 'progression relationship edge present');
assert(hasEdge('p1', 'f1'), 'piece member_of faction edge present');
assert(hasEdge('c1', 'f2'), 'name-based character->faction edge resolved to id');
assert(hasEdge('s1', 'p1') && hasEdge('s1', 'p2'), 'scene participant edges present');
// No dangling edges (every endpoint is a known entity).
assert(edges.every((e) => map.has(e.source) && map.has(e.target)), 'no dangling edges');

// ── search ───────────────────────────────────────────────────────────────────
const hits = searchContent('aurelian');
assert(hits.length >= 1 && hits[0].title === 'Aurelian', 'search finds a board piece by name');
assert(hits[0].module === 'conflict-board', 'search hit routes to owning module');
const voss = searchContent('void researcher');
assert(voss.some((hMatch) => hMatch.title === 'Dr. Orin Voss'), 'search matches on description text');
assert(searchContent('a').length === 0, 'search ignores <2 char queries');

// ── analysis engine (deterministic AI fallback) ─────────────────────────────
const { analyzeProject, checkConsistencyOnly } = await import('../src/core/analysis.js');

// Add a protagonist with no opposition and an isolated character to trigger rules.
repo.upsert(Collections.PIECES, { id: 'p4', name: 'Lone Hero', faction: 'f2', role: 'protagonist' });
// A scene referencing a non-existent participant -> dangling reference issue.
repo.upsert(Collections.SCENES, { id: 's2', title: 'Ghost Meeting', order: 2, participants: ['p1', 'ghost99'] });

const insights = analyzeProject();
assert(Array.isArray(insights) && insights.length > 0, 'analyzeProject returns insights');
assert(insights.some((i) => i.kind === 'suggestion' && /no meaningful opposition/i.test(i.title)),
  'flags protagonist with no opposition');
const issues = checkConsistencyOnly();
assert(issues.some((i) => /missing character/i.test(i.title)),
  'flags scene referencing a missing character');
assert(insights.every((i) => i.kind === 'issue' || i.kind === 'suggestion'), 'insights are well-formed kinds');

// ── AI parse (defensive JSON extraction) ─────────────────────────────────────
const { parseInsights } = await import('../src/core/ai.js');
assert(parseInsights('{"insights":[{"kind":"issue","title":"X","detail":"Y","icon":"⚠️"}]}').length === 1,
  'parseInsights parses clean JSON');
assert(parseInsights('Here you go:\n```json\n{"insights":[{"kind":"suggestion","title":"Z"}]}\n```').length === 1,
  'parseInsights extracts JSON from surrounding prose/fences');
assert(parseInsights('not json at all').length === 0, 'parseInsights tolerates garbage');

// ── genre templates ─────────────────────────────────────────────────────────
const { TEMPLATES, applyTemplate } = await import('../src/core/templates.js');
assert(Object.keys(TEMPLATES).length >= 3, 'multiple genre templates exist');
applyTemplate('projTpl', 'fantasy');
const seededFactions = JSON.parse(store.get('loreforge_projTpl_factions') || '[]');
const seededPieces = JSON.parse(store.get('loreforge_projTpl_pieces') || '[]');
const seededLines = JSON.parse(store.get('loreforge_projTpl_conflictLines') || '[]');
assert(seededFactions.length >= 2 && seededPieces.length >= 2, 'applyTemplate(fantasy) seeds factions + pieces');
assert(seededPieces.every((p) => seededFactions.some((f) => f.id === p.faction)), 'template pieces reference real faction ids');
assert(seededLines.length >= 1, 'template seeds conflict lines so protagonists have opposition');
const proto = seededPieces.find((p) => p.role === 'protagonist');
assert(proto && seededLines.some((l) => (l.from === proto.id || l.to === proto.id) && l.type === 'opposition'),
  'seeded protagonist has an opposition conflict line');
assert(TEMPLATES.blank.build().factions.length === 0, 'blank template seeds nothing');

// ── AI settings round-trip ───────────────────────────────────────────────────
const { getAISettings, saveAISettings, clearAISettings } = await import('../src/core/ai-settings.js');
const { isAIEnabled } = await import('../src/core/ai.js');
assert(isAIEnabled() === false, 'AI disabled with no key');
saveAISettings({ provider: 'openai', apiKey: 'sk-test' });
assert(getAISettings().provider === 'openai' && isAIEnabled() === true, 'AI enabled after saving a key');
clearAISettings();
assert(isAIEnabled() === false, 'AI disabled after clearing key');

console.log(`\n${failed === 0 ? '✅' : '❌'} data-layer tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
