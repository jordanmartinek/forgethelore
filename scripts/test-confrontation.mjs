/**
 * Confrontation resolver + procedural world generator tests.
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-confrontation.mjs
 */

// templates.js reads localStorage at import indirectly (persist not imported by
// templates, but generateWorld uses only Math/objects). Provide a stub anyway.
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

const C = await import('../src/core/confrontation.js');
const T = await import('../src/core/templates.js');

// ── sideFromPieces sums resources ────────────────────────────────────────────
const side = C.sideFromPieces({ id: 'A', name: 'Side A', factionId: 'fA' }, [
  { resources: { political: 10, military: 20, economic: 30, knowledge: 40 } },
  { resources: { political: 5, military: 5, economic: 5, knowledge: 5 } },
]);
assert(side.resources.military === 25 && side.resources.knowledge === 45, 'sideFromPieces sums member resources');

// ── normalizeWeights sums to 1 ───────────────────────────────────────────────
const nw = C.normalizeWeights({ military: 3, political: 1, economic: 0, knowledge: 0 });
assert(Math.abs((nw.military + nw.political + nw.economic + nw.knowledge) - 1) < 1e-9, 'normalized weights sum to 1');
assert(nw.military === 0.75 && nw.political === 0.25, 'weights normalized proportionally');

// ── effectiveStrength: a military-heavy side dominates under military weights ─
const bruiser = { id: 'b', name: 'Bruiser', factionId: 'f1', resources: { political: 10, military: 90, economic: 10, knowledge: 10 }, modifier: 0 };
const schemer = { id: 's', name: 'Schemer', factionId: 'f2', resources: { political: 90, military: 10, economic: 10, knowledge: 90 }, modifier: 0 };
const milWeights = C.normalizeWeights(C.STAKE_PRESETS.battle.weights);
assert(C.effectiveStrength(bruiser, milWeights) > C.effectiveStrength(schemer, milWeights), 'under battle weights, the military side is stronger');
const intWeights = C.normalizeWeights(C.STAKE_PRESETS.intrigue.weights);
assert(C.effectiveStrength(schemer, intWeights) > C.effectiveStrength(bruiser, intWeights), 'under intrigue weights, the knowledge/political side is stronger');

// ── modifier applies ─────────────────────────────────────────────────────────
const boosted = { ...bruiser, modifier: 50 };
assert(C.effectiveStrength(boosted, milWeights) > C.effectiveStrength(bruiser, milWeights), 'positive modifier increases strength');

// ── winProbabilities sum to 1 and favor the stronger side ────────────────────
const probs = C.winProbabilities([bruiser, schemer], milWeights, 1);
assert(Math.abs(probs[0] + probs[1] - 1) < 1e-9, 'win probabilities sum to 1');
assert(probs[0] > probs[1], 'stronger side has higher win probability');

// ── decisiveness sharpens the distribution ───────────────────────────────────
const sharp = C.winProbabilities([bruiser, schemer], milWeights, 3);
assert(sharp[0] > probs[0], 'higher decisiveness increases the favorite\'s probability');

// ── resolveConfrontation: injected RNG picks a deterministic winner ──────────
// rng returns 0 -> falls in the first cumulative bucket (the favorite here).
let r = C.resolveConfrontation({ sides: [bruiser, schemer], weights: C.STAKE_PRESETS.battle.weights, rng: () => 0 });
assert(r.winner.id === 'b', 'rng=0 selects the first cumulative bucket (favorite bruiser)');
assert(r.powerShift.f1 > 0 && r.powerShift.f2 < 0, 'winner faction gains, loser faction loses power');
assert(r.upset === false, 'favorite winning is not an upset');

// rng ~1 -> falls into the last bucket (underdog) -> upset.
r = C.resolveConfrontation({ sides: [bruiser, schemer], weights: C.STAKE_PRESETS.battle.weights, rng: () => 0.999999 });
assert(r.winner.id === 's', 'rng≈1 selects the underdog');
assert(r.upset === true, 'underdog winning is flagged as an upset');

// factionless winner -> no power shift at all (no fail-open drain of losers)
const noFactionWinner = { id: 'nf', name: 'Rogue', resources: { political: 99, military: 99, economic: 99, knowledge: 99 } }; // strongest, no factionId
r = C.resolveConfrontation({ sides: [noFactionWinner, schemer], weights: C.STAKE_PRESETS.custom.weights, rng: () => 0 });
assert(r.winner.id === 'nf', 'factionless side can win');
assert(Object.keys(r.powerShift).length === 0, 'factionless winner produces NO power shift (losers are not drained)');

// requires >= 2 sides
let threw = false;
try { C.resolveConfrontation({ sides: [bruiser], weights: {}, rng: () => 0 }); } catch (_) { threw = true; }
assert(threw, 'resolveConfrontation throws with fewer than 2 sides');

// three-way contest: probabilities still sum to 1, a winner is chosen
r = C.resolveConfrontation({ sides: [bruiser, schemer, { id: 'c', name: 'Third', factionId: 'f3', resources: { political: 50, military: 50, economic: 50, knowledge: 50 } }], weights: C.STAKE_PRESETS.custom.weights, rng: () => 0.5 });
assert(r.probabilities.length === 3 && r.winner, 'three-way contest resolves to one winner');

// ── procedural world generation ──────────────────────────────────────────────
const w = T.generateWorld({ factions: 3, charsPerFaction: 2, seed: 42 });
assert(w.factions.length === 3, 'generateWorld makes the requested number of factions');
assert(w.pieces.length === 6, 'generateWorld makes charsPerFaction * factions characters');
assert(w.pieces.every((p) => w.factions.some((f) => f.id === p.faction)), 'every character belongs to a generated faction');
assert(w.conflictLines.length >= 3, 'generateWorld connects factions with conflict lines');
assert(w.conflictLines.every((l) => w.pieces.some((p) => p.id === l.from) && w.pieces.some((p) => p.id === l.to)), 'conflict lines reference generated pieces');
assert(w.mysteries.length >= 1, 'generateWorld seeds a central mystery');
assert(w.scenes.length >= 1 && w.scenes[0].powerShift, 'generateWorld seeds an opening scene with a power shift');

// reproducible with a seed
const w2 = T.generateWorld({ factions: 3, charsPerFaction: 2, seed: 42 });
assert(JSON.stringify(w.factions.map((f) => f.name)) === JSON.stringify(w2.factions.map((f) => f.name)), 'same seed -> same faction names (reproducible)');

// factions clamped to sane range
assert(T.generateWorld({ factions: 99, seed: 1 }).factions.length <= 6, 'faction count is clamped to a max');

console.log(`\n${failed === 0 ? '✅' : '❌'} confrontation + world-gen tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
