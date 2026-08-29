/**
 * Knowledge/secrets model tests (knowledge.js) — pure logic, no DOM/network.
 * Run: NODE_OPTIONS= node scripts/test-knowledge.mjs
 */

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
store.set('loreforge_activeProjectId', 'projK');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

const repo = await import('../src/core/repo.js');
const { Collections } = repo;
const K = await import('../src/core/knowledge.js');

// Seed a mystery so seedFromMysteries has something to import.
const PFX = 'loreforge_projK_';
store.set(PFX + Collections.MYSTERIES, JSON.stringify([
  { id: 'm1', title: 'Aurelian\'s true agenda', truth: 'He wants to merge with the Void' },
]));

// ── seedFromMysteries ────────────────────────────────────────────────────────
let items = K.seedFromMysteries();
assert(items.length === 1 && items[0].sourceId === 'm1', 'seedFromMysteries creates one item from the mystery');
// Idempotent — running again doesn't duplicate.
items = K.seedFromMysteries();
assert(items.length === 1, 'seedFromMysteries is idempotent (no duplicate)');

const itemId = items[0].id;

// ── knowers + levelAtScene ───────────────────────────────────────────────────
// Sera learns the truth at scene 4; suspects nothing before.
K.setKnower(itemId, 'pSera', 'knows', 4);
let item = K.listKnowledge()[0];
assert(K.levelAtScene(item, 'pSera', 3) === 'unaware', 'before learning scene -> unaware');
assert(K.levelAtScene(item, 'pSera', 4) === 'knows', 'at/after learning scene -> knows');
assert(K.levelAtScene(item, 'pOther', 4) === 'unaware', 'a character with no entry -> unaware');

// false belief
K.setKnower(itemId, 'pDupe', 'false', 1);
item = K.listKnowledge()[0];
assert(K.levelAtScene(item, 'pDupe', 2) === 'false', 'false-belief level tracked');

// unaware removes the entry
K.setKnower(itemId, 'pDupe', 'unaware', 1);
item = K.listKnowledge()[0];
assert(item.knowers.every((k) => k.pieceId !== 'pDupe'), 'setting unaware removes the knower');

// ── reader knowledge + dramatic irony ───────────────────────────────────────
// A reader flag with NO reveal scene must NOT count as known (avoids irony flood).
K.setReaderKnowledge(itemId, true, null);
item = K.listKnowledge()[0];
assert(K.readerKnowsAtScene(item, 99) === false, 'reader=true but no reveal scene -> not known (no irony flood)');

// Audience learns the secret at scene 2.
K.setReaderKnowledge(itemId, true, 2);
item = K.listKnowledge()[0];
assert(K.readerKnowsAtScene(item, 1) === false, 'reader does not know before reveal');
assert(K.readerKnowsAtScene(item, 2) === true, 'reader knows at reveal scene');

// Scene 3: audience knows, Sera (learns at 4) does NOT -> dramatic irony.
const scene3 = { order: 3, participants: ['pSera'] };
const irony = K.ironyInScene(scene3, K.listKnowledge());
assert(irony.length === 1 && irony[0].pieceId === 'pSera', 'dramatic irony detected: reader knows, present character does not');

// Scene 5: Sera now knows (learned at 4) -> no irony for her.
const scene5 = { order: 5, participants: ['pSera'] };
assert(K.ironyInScene(scene5, K.listKnowledge()).length === 0, 'no irony once the character has learned it');

// ── continuity leak ──────────────────────────────────────────────────────────
// Sera learns at scene 4, but scene 2 (which she's in) references the secret -> leak.
const scenes = [
  { id: 's1', order: 1, participants: [], summary: 'Nothing happens' },
  { id: 's2', order: 2, participants: ['pSera'], summary: "Sera acts on Aurelian's true agenda somehow" },
  { id: 's4', order: 4, participants: ['pSera'], summary: 'Sera finally learns the truth' },
];
const leaks = K.knowledgeLeaks(scenes, K.listKnowledge());
assert(leaks.length === 1 && leaks[0].seenAt === 2 && leaks[0].learnedAt === 4, 'continuity leak: character references secret before learning it');

console.log(`\n${failed === 0 ? '✅' : '❌'} knowledge model tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
