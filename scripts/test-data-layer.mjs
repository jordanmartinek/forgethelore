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

console.log(`\n${failed === 0 ? '✅' : '❌'} data-layer tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
