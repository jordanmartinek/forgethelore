/**
 * LoreForge Planner - Character trait catalog (core, DOM-free)
 *
 * The curated, grouped library of personality and appearance traits the
 * Character Builder lets you drag onto a character to brainstorm who they are
 * and what they look like. Modelled on `stamp-catalog.js`: pure data + a few
 * helpers, no DOM, fully unit-testable.
 *
 * Structure:
 *   TRAIT_SETS.personality = [{ category, items: [{ id, label }] }, …]
 *   TRAIT_SETS.appearance  = [{ category, items: [{ id, label }] }, …]
 *
 * A trait `id` is the stable, machine key (`personality.temperament.stoic`);
 * `label` is the human string shown on the chip. When a trait is dropped onto a
 * character it is stored as { id, catalogId, label, category, group } where
 * `group` is 'personality' | 'appearance' and `category` is the section label.
 */

/**
 * Build a group's items from a plain list of labels, deriving a stable id from
 * the group key + a slug of the label. Keeps the big catalog below terse.
 */
function group(category, keyPrefix, labels) {
  return {
    category,
    key: keyPrefix,
    items: labels.map((label) => ({
      id: `${keyPrefix}.${slug(label)}`,
      label,
    })),
  };
}

/** lowercase, alnum-and-dash slug for stable ids. */
function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Grouped catalog, split into the two brainstorming halves. */
export const TRAIT_SETS = {
  personality: [
    group('Temperament', 'personality.temperament', [
      'Hot-headed', 'Even-tempered', 'Anxious', 'Stoic', 'Sunny', 'Brooding',
      'Restless', 'Placid', 'Volatile', 'Melancholic', 'Cheerful', 'Irritable',
      'Serene', 'Excitable', 'Guarded', 'Impulsive', 'Cautious', 'Detached',
      'Passionate', 'Aloof', 'Nervous', 'Unflappable', 'Moody', 'Optimistic',
      'Pessimistic', 'Sardonic', 'Earnest', 'Playful', 'Solemn', 'Manic',
    ]),
    group('Values & Morality', 'personality.values', [
      'Honorable', 'Pragmatic', 'Idealistic', 'Zealous', 'Corruptible', 'Loyal',
      'Treacherous', 'Merciful', 'Ruthless', 'Just', 'Vengeful', 'Compassionate',
      'Selfish', 'Selfless', 'Principled', 'Opportunistic', 'Devout', 'Cynical',
      'Honest', 'Deceitful', 'Forgiving', 'Unforgiving', 'Dutiful', 'Rebellious',
      'Greedy', 'Generous', 'Egalitarian', 'Elitist', 'Nihilistic', 'Chivalrous',
    ]),
    group('Intellect & Mind', 'personality.intellect', [
      'Brilliant', 'Cunning', 'Naive', 'Curious', 'Absent-minded', 'Analytical',
      'Intuitive', 'Scholarly', 'Street-smart', 'Inventive', 'Logical', 'Dreamy',
      'Perceptive', 'Oblivious', 'Wise', 'Foolhardy', 'Calculating', 'Imaginative',
      'Methodical', 'Scatterbrained', 'Shrewd', 'Gullible', 'Visionary', 'Pedantic',
    ]),
    group('Social Style', 'personality.social', [
      'Charismatic', 'Shy', 'Domineering', 'Diplomatic', 'Abrasive', 'Warm',
      'Cold', 'Flirtatious', 'Reserved', 'Gregarious', 'Manipulative', 'Sincere',
      'Condescending', 'Humble', 'Boastful', 'Awkward', 'Magnetic', 'Standoffish',
      'Nurturing', 'Aloof', 'Confrontational', 'Peacemaking', 'Gossipy', 'Private',
    ]),
    group('Speech & Voice', 'personality.speech', [
      'Blunt', 'Silver-tongued', 'Stutters', 'Soft-spoken', 'Loud', 'Formal',
      'Sarcastic', 'Poetic', 'Terse', 'Rambling', 'Deadpan', 'Melodic voice',
      'Gravelly voice', 'Accented', 'Quotes proverbs', 'Uses slang', 'Whispers',
      'Booming laugh', 'Speaks in riddles', 'Mumbles', 'Precise diction', 'Verbose',
    ]),
    group('Quirks & Habits', 'personality.quirks', [
      'Bites nails', 'Never sits still', 'Collects trinkets', 'Talks to self',
      'Hums constantly', 'Always hungry', 'Insomniac', 'Superstitious', 'Neat freak',
      'Chronically late', 'Compulsively honest', 'Keeps a journal', 'Names objects',
      'Fidgets', 'Chews on things', 'Doodles', 'Counts things', 'Avoids eye contact',
      'Overly formal bows', 'Cracks knuckles', 'Talks with hands', 'Hoards food',
    ]),
    group('Fears & Flaws', 'personality.flaws', [
      'Fear of abandonment', 'Arrogant', 'Addicted', 'Cowardly', 'Paranoid',
      'Jealous', 'Impatient', 'Reckless', 'Insecure', 'Stubborn', 'Vain',
      'Fear of failure', 'Fear of intimacy', 'Claustrophobic', 'Fear of heights',
      'Wrathful', 'Gluttonous', 'Prideful', 'Self-destructive', 'Distrustful',
      'Perfectionist', 'Commitment-phobic', 'Guilt-ridden', 'Fear of the dark',
      'Prone to obsession', 'Easily manipulated', 'Holds grudges', 'Fatalistic',
    ]),
    group('Strengths & Virtues', 'personality.strengths', [
      'Brave', 'Resilient', 'Disciplined', 'Empathetic', 'Resourceful', 'Patient',
      'Determined', 'Adaptable', 'Level-headed', 'Protective', 'Tenacious',
      'Open-minded', 'Trustworthy', 'Hard-working', 'Quick-witted', 'Steadfast',
      'Charitable', 'Even-handed', 'Self-aware', 'Encouraging', 'Decisive', 'Gracious',
    ]),
    group('Drives & Goals', 'personality.drives', [
      'Seeks power', 'Seeks redemption', 'Seeks knowledge', 'Seeks revenge',
      'Seeks belonging', 'Seeks freedom', 'Seeks wealth', 'Seeks glory',
      'Protects family', 'Wants to be loved', 'Wants to prove worth', 'Chasing a legacy',
      'Running from the past', 'Duty above all', 'Survival at any cost', 'Seeks justice',
      'Seeks peace', 'Craves adventure', 'Wants control', 'Longs for home',
    ]),
  ],
  appearance: [
    group('Age', 'appearance.age', [
      'Child', 'Adolescent', 'Youthful', 'Young adult', 'Middle-aged', 'Mature',
      'Elderly', 'Ancient', 'Ageless', 'Prematurely aged', 'Baby-faced', 'Weathered by age',
    ]),
    group('Build & Height', 'appearance.build', [
      'Towering', 'Tall', 'Average height', 'Short', 'Diminutive', 'Lanky',
      'Wiry', 'Athletic', 'Muscular', 'Stocky', 'Broad-shouldered', 'Slender',
      'Willowy', 'Heavyset', 'Portly', 'Gaunt', 'Petite', 'Imposing', 'Frail', 'Compact',
    ]),
    group('Face & Features', 'appearance.face', [
      'Angular face', 'Round face', 'Square jaw', 'Soft features', 'Sharp cheekbones',
      'Weathered face', 'Youthful face', 'Freckled', 'Dimpled smile', 'Crooked nose',
      'Aquiline nose', 'Button nose', 'Full lips', 'Thin lips', 'Strong brow',
      'Delicate features', 'Chiseled jaw', 'Gap-toothed grin', 'High forehead', 'Cleft chin',
    ]),
    group('Eyes', 'appearance.eyes', [
      'Piercing gaze', 'Warm eyes', 'Cold eyes', 'Heavy-lidded', 'Wide-eyed',
      'Deep-set eyes', 'Bright eyes', 'Tired eyes', 'Almond-shaped eyes', 'Hooded eyes',
      'Mismatched eyes', 'Amber eyes', 'Emerald eyes', 'Grey eyes', 'Violet eyes',
      'Silver eyes', 'Dark eyes', 'Ice-blue eyes', 'Golden eyes', 'Glowing eyes',
    ]),
    group('Hair', 'appearance.hair', [
      'Long flowing hair', 'Close-cropped hair', 'Shaved head', 'Curly hair',
      'Wavy hair', 'Straight hair', 'Braided hair', 'Wild unruly hair', 'Silver hair',
      'Jet-black hair', 'Fiery red hair', 'Golden blonde hair', 'Salt-and-pepper hair',
      'Dreadlocks', 'Topknot', 'Undercut', 'Widow’s peak', 'Balding', 'Windswept hair',
      'Neatly styled hair', 'Streak of white', 'Dyed an unusual color',
    ]),
    group('Facial Hair', 'appearance.facial-hair', [
      'Clean-shaven', 'Stubble', 'Neat beard', 'Bushy beard', 'Long braided beard',
      'Goatee', 'Handlebar moustache', 'Thin moustache', 'Mutton chops', 'Wispy beard',
    ]),
    group('Skin & Complexion', 'appearance.skin', [
      'Fair skin', 'Olive skin', 'Bronzed skin', 'Dark skin', 'Ruddy complexion',
      'Pale complexion', 'Sun-weathered skin', 'Smooth skin', 'Freckled skin',
      'Scarred skin', 'Ashen', 'Radiant complexion', 'Rough calloused skin', 'Tattooed skin',
    ]),
    group('Distinguishing Marks', 'appearance.marks', [
      'Facial scar', 'Battle scars', 'Full-sleeve tattoo', 'Tribal tattoos',
      'Birthmark', 'Missing an eye', 'Eyepatch', 'Missing a finger', 'Burn scars',
      'Brand mark', 'Piercings', 'Prosthetic limb', 'Limp', 'Vitiligo', 'Freckle constellation',
      'Ritual markings', 'Old dueling scar', 'Bite mark', 'Faded tattoo', 'Distinctive mole',
    ]),
    group('Attire & Style', 'appearance.attire', [
      'Regal robes', 'Worn leather armor', 'Battered traveler’s cloak', 'Fine tailored suit',
      'Ragged clothes', 'Ceremonial garb', 'Practical work clothes', 'Ornate jewelry',
      'Utilitarian gear', 'All in black', 'Bright flamboyant colors', 'Hooded cloak',
      'Military uniform', 'Peasant garb', 'Merchant’s finery', 'Scholar’s robes',
      'Scavenged patchwork', 'Immaculately dressed', 'Deliberately plain', 'Foreign fashions',
    ]),
    group('Bearing & Presence', 'appearance.bearing', [
      'Regal posture', 'Slouched', 'Coiled and alert', 'Graceful movement', 'Heavy footed',
      'Restless energy', 'Commanding presence', 'Unassuming', 'Predatory stillness',
      'Nervous fidgeting', 'Fluid and catlike', 'Stiff and formal', 'Weary bearing',
      'Radiates confidence', 'Shrinks from attention', 'Quiet intensity', 'Larger than life',
    ]),
    group('Voice & Sound', 'appearance.voice', [
      'Deep resonant voice', 'High reedy voice', 'Raspy voice', 'Honeyed voice',
      'Sharp clipped tones', 'Warm timbre', 'Cold flat voice', 'Musical laugh',
      'Perpetual whisper', 'Thunderous shout', 'Cracks when nervous', 'Purring drawl',
    ]),
  ],
};

/** Ordered top-level halves for stable iteration/UI. */
export const TRAIT_GROUPS = ['personality', 'appearance'];

/**
 * Flatten a half (or the whole catalog) into plain trait entries carrying their
 * group + category, ready to store or render.
 * @param {'personality'|'appearance'} [half] omit for both halves.
 * @returns {{id:string,label:string,category:string,group:string}[]}
 */
export function flattenTraits(half) {
  const halves = half ? [half] : TRAIT_GROUPS;
  const out = [];
  for (const g of halves) {
    for (const section of TRAIT_SETS[g] || []) {
      for (const item of section.items) {
        out.push({ id: item.id, label: item.label, category: section.category, group: g });
      }
    }
  }
  return out;
}

/** Total number of traits in the catalog (both halves). */
export function traitCount() {
  return flattenTraits().length;
}

/** Look up a single trait entry by its stable id. */
export function traitById(id) {
  return flattenTraits().find((t) => t.id === id) || null;
}

/**
 * Filter traits within a half by a free-text query against label + id.
 * Empty/whitespace query returns [] (callers show the grouped view instead).
 */
export function filterTraits(half, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return flattenTraits(half).filter(
    (t) => t.label.toLowerCase().includes(q) || t.id.replace(/[.\-]/g, ' ').includes(q),
  );
}

/**
 * Deterministic-ish random helper: pick `count` distinct traits from a specific
 * category (by its `key`, e.g. 'appearance.hair'), or from an entire half if a
 * half id ('personality'|'appearance') is passed.
 * @param {string} scope  a section key or a half id
 * @param {number} [count]
 * @param {() => number} [rng] injectable RNG for tests (defaults Math.random)
 */
export function randomTraits(scope, count = 1, rng = Math.random) {
  const pool = poolForScope(scope);
  if (pool.length === 0) return [];
  const n = Math.max(0, Math.min(count, pool.length));
  const copy = pool.slice();
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(rng() * copy.length) % copy.length;
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Roll a coherent spread of traits for ONE half of the catalog. This is the
 * single sampler both "randomize whole character" and "reroll this half" use, so
 * the two entry points can't drift into different distributions.
 *   - appearance: exactly one trait from each category (a complete look).
 *   - personality: ~one from each category (≥ `minPersonality`, sampled across
 *     categories rather than a flat draw so the mix feels varied).
 * @param {'personality'|'appearance'} half
 * @param {() => number} [rng]
 * @param {number} [minPersonality] floor for the personality half
 */
export function randomHalfTraits(half, rng = Math.random, minPersonality = 4) {
  const sections = TRAIT_SETS[half] || [];
  const out = [];
  if (half === 'appearance') {
    sections.forEach((section) => out.push(...randomTraits(section.key, 1, rng)));
    return out;
  }
  // Personality: a chance to draw from each category for spread…
  sections.forEach((section) => {
    if (rng() < 0.5) out.push(...randomTraits(section.key, 1, rng));
  });
  // …then top up to the floor without duplicates.
  while (out.length < minPersonality) {
    const picks = randomTraits(half, 1, rng);
    if (picks.length && !out.some((t) => t.id === picks[0].id)) out.push(picks[0]);
    else break;
  }
  return out;
}

/**
 * Roll a whole brainstormed character: a spread of personality traits plus one
 * pick from each appearance category, so you always get a coherent "look".
 * @param {() => number} [rng]
 */
export function randomCharacterTraits(rng = Math.random) {
  return [...randomHalfTraits('personality', rng), ...randomHalfTraits('appearance', rng)];
}

/** Resolve a scope string to its flat trait pool. */
function poolForScope(scope) {
  if (scope === 'personality' || scope === 'appearance') return flattenTraits(scope);
  // Otherwise treat it as a section key within either half.
  for (const half of TRAIT_GROUPS) {
    const section = (TRAIT_SETS[half] || []).find((s) => s.key === scope);
    if (section) {
      return section.items.map((it) => ({ id: it.id, label: it.label, category: section.category, group: half }));
    }
  }
  return [];
}

/** All section keys for a half (used by "reroll a category" UI). */
export function categoryKeys(half) {
  return (TRAIT_SETS[half] || []).map((s) => ({ key: s.key, category: s.category }));
}
