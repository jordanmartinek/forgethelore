/**
 * Functional tests for Phase E pure logic (#16 focus, #21 POV/word-count,
 * #22 map, #37 theming). Zero dependencies — plain asserts + a localStorage
 * stub for the theme module.
 * Run: NODE_OPTIONS= node scripts/test-writing-spatial.mjs
 */

// ── localStorage stub (theme.js reads/writes it) ────────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
// Minimal document stub so applyTheme() can toggle the attribute.
const rootAttrs = new Map();
globalThis.document = {
  documentElement: {
    setAttribute: (k, v) => rootAttrs.set(k, v),
    getAttribute: (k) => (rootAttrs.has(k) ? rootAttrs.get(k) : null),
    removeAttribute: (k) => rootAttrs.delete(k),
  },
};

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}
function approx(a, b, eps = 0.001) { return Math.abs(a - b) <= eps; }

// ── #37 Theming ──────────────────────────────────────────────────────────────
const theme = await import('../src/core/theme.js');
assert(theme.getTheme() === 'parchment', 'default theme is parchment');
theme.setTheme('midnight');
assert(theme.getTheme() === 'midnight', 'setTheme persists a valid theme');
assert(rootAttrs.get('data-theme') === 'midnight', 'applyTheme sets data-theme attribute');
theme.setTheme('parchment');
assert(rootAttrs.has('data-theme') === false, 'parchment clears the data-theme attribute (uses :root default)');
theme.setTheme('not-a-real-theme');
assert(theme.getTheme() === 'parchment', 'invalid theme falls back to parchment');
const before = theme.getTheme();
const next = theme.cycleTheme();
assert(next !== before && theme.THEMES.some((t) => t.id === next), 'cycleTheme advances to a valid, different theme');
theme.setTheme('parchment');

// ── #21 Word-count report ────────────────────────────────────────────────────
const { wordCountReport, povReport } = await import('../src/core/pov-analytics.js');

const PHASES = [
  { name: 'Setup', steps: [1, 2, 3, 4, 5] },
  { name: 'Development', steps: [6, 7, 8, 9, 10, 11] },
  { name: 'Climax', steps: [17, 18, 19] },
];
const STEPS = [{ num: 1, title: 'Opening' }, { num: 4, title: 'Inciting' }, { num: 19, title: 'Battle' }];
const sceneCards = {
  1: [{ id: 'a', title: 'Opening Image', content: 'one two three' }], // title(2)+content(3)=5
  4: [{ id: 'b', title: '', content: 'four five' }, { id: 'c', content: 'six' }], // 2 + 1 = 3
  19: [{ id: 'd', title: 'The Stand', content: 'a b c d e f g h i j' }], // 2 + 10 = 12
};
const wc = wordCountReport(sceneCards, PHASES, STEPS);
assert(wc.total === 20, `total words = 20 (got ${wc.total})`);
assert(wc.sceneCount === 4, 'counts all scene cards across steps');
assert(wc.byStep.find((s) => s.num === 1).words === 5, 'step 1 counts title + content words');
assert(wc.byStep.find((s) => s.num === 4).words === 3, 'step 4 sums multiple cards');
assert(wc.byStep.find((s) => s.num === 1).title === 'Opening', 'step titles resolved from metadata');
assert(wc.longest && wc.longest.num === 19 && wc.longest.words === 12, 'longest step identified');
const setup = wc.byPhase.find((p) => p.name === 'Setup');
const climax = wc.byPhase.find((p) => p.name === 'Climax');
assert(setup.words === 8 && climax.words === 12, 'phase aggregation sums member steps');
assert(setup.pct + wc.byPhase.find((p) => p.name === 'Development').pct + climax.pct === 100 || setup.pct === 40,
  'phase percentages computed against total');
const empty = wordCountReport({}, PHASES, STEPS);
assert(empty.total === 0 && empty.longest === null && empty.byPhase.every((p) => p.pct === 0), 'empty manuscript is handled');

// ── #21 POV report ───────────────────────────────────────────────────────────
const pieces = [
  { id: 'p1', name: 'Hero', faction: 'f1', role: 'protagonist' },
  { id: 'p2', name: 'Rival', faction: 'f2', role: 'antagonist' },
  { id: 'p3', name: 'Ghost', faction: 'f1', role: 'ally' }, // never appears
  { id: 'p4', name: 'Deuteragonist', faction: 'f2', role: 'protagonist' }, // long absence
];
const factions = [{ id: 'f1', color: '#111' }, { id: 'f2', color: '#222' }];
// Sparse, non-contiguous orders on purpose: gaps must be counted in scene
// SEQUENCE position, not raw order value.
const scenes = [
  { id: 's1', order: 10, participants: ['p1', 'p2', 'p4'] }, // p1 lead, p2/p4 present
  { id: 's2', order: 20, participants: ['p2', 'p1'] },       // p2 lead, p1 present
  { id: 's3', order: 30, participants: ['p1'] },             // p1 lead
  { id: 's4', order: 40, participants: ['p1'] },             // p1 lead
  { id: 's5', order: 50, participants: ['p1', 'p4'] },       // p4 returns after 3 scenes away
];
const pov = povReport(scenes, pieces, factions);
assert(pov.totalScenes === 5, 'counts scenes with participants');
const heroRow = pov.rows.find((r) => r.id === 'p1');
assert(heroRow.lead === 4 && heroRow.present === 1, 'lead vs present tallied by participant position');
assert(heroRow.appearances === 5, 'appearances = lead + present');
assert(heroRow.color === '#111', 'row colored by faction');
// p1 appears in every scene -> sequence positions 0..4 -> maxGap = 1 despite orders jumping by 10.
assert(heroRow.maxGap === 1, `gap counted in scene positions, not order values (got ${heroRow.maxGap})`);
assert(heroRow.firstOrder === 10 && heroRow.lastOrder === 50, 'first/last order preserved for display');
// p4 appears at positions 0 and 4 -> maxGap = 4 (was away for 3 scenes).
const deuteRow = pov.rows.find((r) => r.id === 'p4');
assert(deuteRow.maxGap === 4, `deuteragonist gap = 4 scene positions (got ${deuteRow.maxGap})`);
assert(pov.rows[0].appearances >= pov.rows[pov.rows.length - 1].appearances, 'rows sorted by appearances desc');
assert(pov.silentProtagonists.some((p) => p.id === 'p4'), 'flags a protagonist with a long absence gap');
assert(!pov.silentProtagonists.some((p) => p.id === 'p1'), 'omnipresent protagonist is not flagged as silent');
assert(pov.unusedPieces.some((p) => p.id === 'p3'), 'flags a piece that never appears');
assert(!pov.unusedPieces.some((p) => p.id === 'p1'), 'appearing pieces are not flagged as unused');

// ── #22 Map model ─────────────────────────────────────────────────────────────
const { hashString, pinPosition, placePins, territoryOverTime } = await import('../src/core/map-model.js');
assert(hashString('abc') === hashString('abc'), 'hashString is deterministic');
assert(hashString('abc') !== hashString('abd'), 'hashString differentiates inputs');
const posA = pinPosition({ id: 'loc1' });
const posA2 = pinPosition({ id: 'loc1' });
assert(posA.x === posA2.x && posA.y === posA2.y, 'pin position is stable for the same id');
assert(posA.x >= 0 && posA.x <= 1 && posA.y >= 0 && posA.y <= 1, 'pin position is normalized 0..1');
const explicit = pinPosition({ id: 'loc1', mapX: 0.3, mapY: 0.7 });
assert(approx(explicit.x, 0.3) && approx(explicit.y, 0.7), 'explicit saved coordinates win over the hash');
assert(pinPosition({ id: 'loc1' }).x !== pinPosition({ id: 'zzz' }).x, 'different ids get different x');

const mapLocations = [
  { id: 'l1', name: 'Citadel', faction: 'The Dominion' },
  { id: 'l2', name: 'Neutral Rock', faction: 'Nobody' },
];
const mapFactions = [{ id: 'f1', name: 'The Dominion', color: '#red' }];
const pins = placePins(mapLocations, mapFactions);
assert(pins.length === 2, 'places a pin per location');
assert(pins[0].factionId === 'f1' && pins[0].color === '#red', 'pin resolves faction by name (case-insensitive)');
assert(pins[1].factionId === null, 'unmatched location is neutral');

const terrScenes = [
  { id: 't1', order: 1, title: 'Skirmish', powerShift: { f1: 10, f2: -10 } },
  { id: 't2', order: 2, title: 'Counter', powerShift: { f2: 30 } },
];
const terrFactions = [{ id: 'f1', name: 'A', color: '#a', goalProgress: 50 }, { id: 'f2', name: 'B', color: '#b', goalProgress: 50 }];
const terr = territoryOverTime(terrScenes, terrFactions);
assert(terr.steps.length === 3, 'timeline has a start step plus one per scene');
assert(terr.steps[0].order === 0 && terr.steps[0].title === 'Start', 'first step is the starting state');
assert(terr.steps[0].share.f1 === 50 && terr.steps[0].share.f2 === 50, 'start share reflects equal baselines');
// After scene 1: f1=60, f2=40 -> 60/40.
assert(terr.steps[1].share.f1 === 60 && terr.steps[1].share.f2 === 40, 'powerShift folds into control share');
// After scene 2: f1=60, f2=70 -> ~46/54.
assert(terr.steps[2].share.f1 + terr.steps[2].share.f2 === 100 || approx(terr.steps[2].share.f1, 46, 1),
  'shares stay normalized to ~100');
assert(terr.steps[2].share.f2 > terr.steps[2].share.f1, 'f2 overtakes f1 after its power surge');
// Unknown faction ids in a powerShift must not create phantom factions.
const terr2 = territoryOverTime([{ id: 'x', order: 1, powerShift: { ghost: 999 } }], terrFactions);
assert(terr2.factions.length === 2, 'unknown faction ids in powerShift are ignored');

// ── #16 Focus model ───────────────────────────────────────────────────────────
const { sessionStats, contextRail } = await import('../src/core/focus-model.js');
const s0 = sessionStats('one two', 'one two three four', 5, 0);
assert(s0.startWords === 2 && s0.currentWords === 4 && s0.added === 2, 'session tracks words added since start');
assert(s0.goalPct === 40 && s0.goalMet === false, 'goal percentage without meeting it');
const met = sessionStats('', 'a b c d e', 5, 0);
assert(met.goalMet === true && met.goalPct === 100, 'goal met caps at 100%');
const timed = sessionStats('', 'a b c d', 0, 1000, 1000 + 60000); // 4 words in 1 min
assert(timed.wpm === 4, `wpm computed from elapsed time (got ${timed.wpm})`);
const noTime = sessionStats('', 'a b', 0, 0);
assert(noTime.wpm === 0, 'no start time -> no wpm');
// Deletions never produce a negative "added".
assert(sessionStats('a b c', 'a', 0, 0).added === 0, 'added is clamped at 0 for deletions');

const railPieces = [
  { id: 'p1', name: 'Hero', faction: 'f1', goal: 'Win', role: 'protagonist' },
  { id: 'p2', name: 'Rival', faction: 'f2', goal: 'Rule', role: 'antagonist' },
  { id: 'p3', name: 'Guard', faction: 'f1', goal: '', role: 'ally' },
];
const railFactions = [{ id: 'f1', name: 'Order', color: '#1', goal: 'Peace' }, { id: 'f2', name: 'Chaos', color: '#2' }];
const railLocs = [{ id: 'L', name: 'Keep', faction: 'Order' }];
const rail = contextRail({ participants: ['p1', 'p2'], location: 'Keep' }, { pieces: railPieces, factions: railFactions, locations: railLocs });
assert(rail.characters.length >= 2, 'rail includes scene participants');
assert(rail.characters[0].id === 'p1' && rail.characters[0].reason === 'in this scene', 'participants ranked first, in order');
assert(rail.characters.some((c) => c.id === 'p3' && c.reason === 'holds this location'), 'same-location cast is added');
assert(rail.factions.some((f) => f.id === 'f1') && rail.factions.some((f) => f.id === 'f2'), 'factions of chosen cast are surfaced');
assert(rail.location && rail.location.name === 'Keep', 'scene location resolved');
const railLimited = contextRail({ participants: ['p1', 'p2'], location: '' }, { pieces: railPieces, factions: railFactions }, 1);
assert(railLimited.characters.length === 1, 'rail respects the character limit');
const railEmpty = contextRail({ participants: [], location: '' }, {});
assert(railEmpty.characters.length === 0 && railEmpty.factions.length === 0 && railEmpty.location === null, 'empty scene yields empty rail');

console.log(`\n${failed === 0 ? '✅' : '❌'} writing/spatial tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
