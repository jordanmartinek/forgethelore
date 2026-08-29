/**
 * Character voice (#9 deterministic fallback) + story bible (#7) tests.
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-interview-bible.mjs
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

const V = await import('../src/core/character-voice.js');
const B = await import('../src/core/story-bible.js');

// ── buildPersona normalizes overlapping fields ───────────────────────────────
const persona = V.buildPersona({
  name: 'Aurelian', role: 'Supreme Commander', faction: 'The Dominion',
  goal: 'Control all Conduits', hiddenGoal: 'Reshape humanity through the Void',
  fears: 'Being forgotten by history.', personality: 'Charismatic and ruthless. Speaks softly.',
  momentum: 'rising',
});
assert(persona.name === 'Aurelian' && persona.hiddenGoal.includes('Void'), 'buildPersona carries fields');

// ── system prompt includes persona + hidden-goal concealment instruction ─────
const sys = V.buildSystemPrompt(persona);
assert(sys.includes('Aurelian') && /HIDDEN/.test(sys) && /Reshape humanity/.test(sys), 'system prompt embeds persona incl. hidden agenda');
assert(/in character/i.test(sys), 'system prompt instructs staying in character');

// ── classifyQuestion ─────────────────────────────────────────────────────────
assert(V.classifyQuestion('Hello there') === 'greeting', 'greeting classified');
assert(V.classifyQuestion('What do you want?') === 'goal', 'goal classified');
assert(V.classifyQuestion('What are you afraid of?') === 'fear', 'fear classified');
assert(V.classifyQuestion('What are you hiding?') === 'secret', 'secret classified');
assert(V.classifyQuestion('What do you think of Sera?') === 'opinion', 'opinion classified');
// opinion must win over goal even when the sentence contains a goal keyword.
assert(V.classifyQuestion('What do you think of the plan?') === 'opinion', 'opinion beats goal when both keywords present');
assert(V.classifyQuestion('What terrifies you?') === 'fear', 'fear regex matches "terrifies" (boundary fix)');

// ── extractSubject ───────────────────────────────────────────────────────────
assert(V.extractSubject('What do you think of Aurelian?') === 'Aurelian', 'extractSubject pulls the name');
assert(V.extractSubject('How are you?') === '', 'extractSubject returns empty when no name');

// ── deterministicReply is in-character & grounded ────────────────────────────
const goalReply = V.deterministicReply(persona, 'What do you want?');
assert(goalReply.includes('Control all Conduits'), 'goal reply cites the stated goal');

const fearReply = V.deterministicReply(persona, 'What are you afraid of?');
assert(/forgotten/i.test(fearReply), 'fear reply cites the stated fear');

// Secret question must DEFLECT, never leak the hidden goal.
const secretReply = V.deterministicReply(persona, 'What are you hiding?');
assert(!/Reshape humanity/i.test(secretReply) && !/Void/i.test(secretReply), 'secret reply does NOT leak the hidden goal');

// A character with no secrets answers plainly (doesn't deflect).
const openPersona = V.buildPersona({ name: 'Koss', goal: 'Protect the borders' });
assert(!/better left unsaid/i.test(V.deterministicReply(openPersona, 'what are you hiding')), 'no-secret character does not deflect');

// Opinion with injected relationship context uses it.
const opinion = V.deterministicReply(persona, 'What do you think of Sera?', { relationshipsText: 'Sera? We are not on the same side.' });
assert(opinion.includes('not on the same side'), 'opinion reply uses injected relationship context');

// Greeting introduces the character.
assert(V.deterministicReply(persona, 'hello').includes('Aurelian'), 'greeting introduces by name');

// ── Story bible ──────────────────────────────────────────────────────────────
const model = B.buildBibleModel({
  project: { name: 'Void Dominion', description: 'A sci-fi saga.' },
  factions: [{ id: 'f1', name: 'The Dominion', color: '#ef4444', goal: 'Rule all' }],
  pieces: [{ id: 'p1', name: 'Aurelian', faction: 'f1', role: 'King', goal: 'Control all' }],
  characters: [{ id: 'c1', name: 'Aurelian', secrets: 'Wants to merge with the Void', personality: 'Ruthless.' }],
  scenes: [{ id: 's2', order: 2, title: 'The Betrayal', participants: ['p1'], summary: 'Vex turns.' }, { id: 's1', order: 1, title: 'The Discovery', participants: [] }],
  mysteries: [{ id: 'm1', title: 'The Conduit Origin', question: 'Who built them?', truth: 'An ancient race.' }],
  relationships: [{ id: 'r1', sourceId: 'p1', targetId: 'p1', type: 'opposition' }],
  locations: [], species: [], technologies: [],
});
const html = B.renderBibleHTML(model);

assert(html.startsWith('<!doctype html>'), 'bible is a full HTML document');
assert(html.includes('Void Dominion'), 'bible includes the project name');
assert(html.includes('The Dominion') && html.includes('Aurelian'), 'bible lists factions + characters');
// Scenes appear in ORDER (Discovery #1 before Betrayal #2).
assert(html.indexOf('The Discovery') < html.indexOf('The Betrayal'), 'bible timeline is ordered by scene order');
// Character sheet merges over the board piece (secrets from the character sheet present, spoiler-guarded).
assert(html.includes('merge with the Void') && html.includes('<details>'), 'secrets are included behind a spoiler <details>');
// Mystery truth is spoiler-guarded too.
assert(html.includes('An ancient race'), 'mystery truth included (behind spoiler)');
// HTML is escaped — inject a nasty name and ensure no raw <script>.
const evil = B.renderBibleHTML(B.buildBibleModel({ project: { name: '<script>alert(1)</script>' }, factions: [], pieces: [], characters: [], scenes: [], mysteries: [], relationships: [], locations: [], species: [], technologies: [] }));
assert(!evil.includes('<script>alert(1)</script>'), 'user content is HTML-escaped (no injection)');
assert(evil.includes('&lt;script&gt;'), 'dangerous input appears escaped');

console.log(`\n${failed === 0 ? '✅' : '❌'} interview + bible tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
