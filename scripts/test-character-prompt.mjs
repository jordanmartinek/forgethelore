/**
 * Functional tests for character AI-prompt assembly (core/character-prompt.js).
 * Zero dependencies — plain asserts. Run: NODE_OPTIONS= node scripts/test-character-prompt.mjs
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗', msg); }
}

const cp = await import('../src/core/character-prompt.js');

const char = {
  id: 'c1',
  name: 'Kaela Voss',
  role: 'Rogue Captain',
  faction: 'Free Colonies',
  description: 'A defector hiding a dangerous secret.',
  traitTags: [
    { id: 'personality.temperament.brooding', label: 'Brooding', category: 'Temperament', group: 'personality' },
    { id: 'personality.flaws.holds-grudges', label: 'Holds grudges', category: 'Fears & Flaws', group: 'personality' },
    { id: 'personality.speech.sarcastic', label: 'Sarcastic', category: 'Speech & Voice', group: 'personality' },
    { id: 'appearance.build.athletic', label: 'Athletic', category: 'Build & Height', group: 'appearance' },
    { id: 'appearance.eyes.silver-eyes', label: 'Silver eyes', category: 'Eyes', group: 'appearance' },
    { id: 'appearance.hair.silver-hair', label: 'Silver hair', category: 'Hair', group: 'appearance' },
    { id: 'appearance.marks.facial-scar', label: 'Facial scar', category: 'Distinguishing Marks', group: 'appearance' },
  ],
};

// ── Writing prompt ───────────────────────────────────────────────────────────
const w = cp.buildWritingPrompt(char);
assert(typeof w === 'string' && w.length > 50, 'writing prompt is a non-trivial string');
assert(w.includes('Kaela Voss'), 'writing prompt names the character');
assert(w.includes('Rogue Captain') && w.includes('Free Colonies'), 'writing prompt includes role + faction');
assert(w.includes('A defector hiding a dangerous secret.'), 'writing prompt includes the description context');
assert(w.includes('Personality:') && w.includes('Appearance:'), 'writing prompt has both sections');
assert(w.includes('Brooding') && w.includes('Silver eyes'), 'writing prompt lists dropped traits');
assert(/Temperament:/.test(w), 'writing prompt groups personality traits by category');
assert(/motivation/i.test(w), 'writing prompt asks the AI to develop motivation');
assert(!/\n{3,}/.test(w), 'writing prompt has no triple-blank-line gaps');

// ── Image prompt ─────────────────────────────────────────────────────────────
const img = cp.buildImagePrompt(char);
assert(typeof img === 'string' && img.includes(','), 'image prompt is comma-separated');
assert(img.startsWith('character portrait of a rogue captain'), 'image prompt opens with a subject from role');
assert(/silver eyes/.test(img) && /silver hair/.test(img) && /facial scar/.test(img), 'image prompt leads with appearance traits');
assert(/concept art/.test(img) && /dramatic lighting/.test(img), 'image prompt includes a quality/style tail');
// Appearance should dominate; only a few personality descriptors leak in as mood.
const moodHits = ['brooding', 'holds grudges', 'sarcastic'].filter((m) => img.includes(m));
assert(moodHits.length <= 3, 'image prompt only borrows a few personality descriptors for mood');

// ── buildPrompts convenience ─────────────────────────────────────────────────
const both = cp.buildPrompts(char);
assert(both.writing === w && both.image === img, 'buildPrompts returns both styles consistently');

// ── Robustness: empty / missing data ─────────────────────────────────────────
const bare = cp.buildPrompts({ id: 'x' });
assert(typeof bare.writing === 'string' && bare.writing.length > 0, 'writing prompt survives a bare character');
assert(bare.writing.includes('this character'), 'bare character falls back to a generic name');
assert(typeof bare.image === 'string' && bare.image.includes('detailed character portrait'), 'image prompt survives no role/traits');
const noTags = cp.buildWritingPrompt({ name: 'Solo', role: 'Wanderer' });
assert(noTags.includes('Solo') && !/Personality:/.test(noTags), 'no traits ⇒ no empty Personality section');

// De-dupe: repeated trait labels should not repeat in the output.
const dupChar = { name: 'Dup', traitTags: [
  { label: 'Brave', category: 'Strengths', group: 'personality' },
  { label: 'Brave', category: 'Strengths', group: 'personality' },
] };
const dupW = cp.buildWritingPrompt(dupChar);
assert((dupW.match(/Brave/g) || []).length === 1, 'duplicate trait labels are de-duped in the writing prompt');

console.log(`\n${failed === 0 ? '✅' : '❌'} character-prompt tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
