/**
 * LoreForge Planner - Character AI-prompt assembly (core, DOM-free)
 *
 * Turns a character record (its identity fields + the traits dragged onto it in
 * the Character Builder) into a detailed, copy-pasteable prompt for an AI of the
 * user's choice. Two styles are produced:
 *
 *   - 'writing'  : a natural-language brief for a text AI (ChatGPT/Claude/etc.)
 *                  to flesh out backstory, voice, and motivation.
 *   - 'image'    : a comma-separated visual descriptor for an image generator
 *                  (Midjourney/DALL·E/Stable Diffusion), built mostly from the
 *                  appearance traits.
 *
 * Pure string assembly, no DOM, no network — works fully offline and is unit
 * tested. Input `traitTags` is the array stored on a character:
 *   [{ id, label, category, group }] where group is 'personality'|'appearance'.
 */

/** Split trait tags into personality vs appearance buckets, grouped by category. */
function bucketTraits(traitTags) {
  const personality = new Map(); // category -> [labels]
  const appearance = new Map();
  (Array.isArray(traitTags) ? traitTags : []).forEach((t) => {
    if (!t || !t.label) return;
    const target = t.group === 'appearance' ? appearance : personality;
    const cat = t.category || 'Traits';
    if (!target.has(cat)) target.set(cat, []);
    target.get(cat).push(t.label);
  });
  return { personality, appearance };
}

/** Flatten a category->labels map into a single de-duped label list. */
function allLabels(map) {
  const seen = new Set();
  const out = [];
  for (const labels of map.values()) {
    for (const l of labels) {
      const key = l.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(l); }
    }
  }
  return out;
}

/** Join a list into an "a, b, and c" phrase. */
function humanList(items) {
  const arr = items.filter(Boolean);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

/** Build the descriptive "who they are" fields line from the record. */
function identityLine(char) {
  const name = (char && char.name && char.name.trim()) || 'this character';
  const bits = [];
  if (char && char.role) bits.push(String(char.role).trim());
  if (char && char.faction) bits.push(`of ${String(char.faction).trim()}`);
  const descriptor = bits.length ? ` — ${bits.join(' ')}` : '';
  return { name, descriptor };
}

/**
 * Compose the natural-language character-writing prompt.
 * @param {object} char character record (with optional traitTags)
 * @returns {string}
 */
export function buildWritingPrompt(char) {
  const c = char || {};
  const { personality, appearance } = bucketTraits(c.traitTags);
  const { name, descriptor } = identityLine(c);

  const lines = [];
  lines.push(`Create a rich, detailed character profile for ${name}${descriptor}.`);
  lines.push('');

  if (c.description && String(c.description).trim()) {
    lines.push(`Context: ${String(c.description).trim()}`);
    lines.push('');
  }

  if (personality.size) {
    lines.push('Personality:');
    for (const [cat, labels] of personality) {
      lines.push(`- ${cat}: ${humanList(dedupe(labels))}.`);
    }
    lines.push('');
  }

  if (appearance.size) {
    lines.push('Appearance:');
    for (const [cat, labels] of appearance) {
      lines.push(`- ${cat}: ${humanList(dedupe(labels))}.`);
    }
    lines.push('');
  }

  lines.push(
    'Using the traits above, write: (1) a vivid physical description, ' +
    '(2) their core personality, voice, and mannerisms, ' +
    '(3) their central motivation and the wound or belief driving it, ' +
    '(4) a short backstory that explains how they became this person, and ' +
    '(5) how they behave under pressure. Keep everything internally consistent ' +
    'with the traits listed.',
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Compose the comma-separated image-generation prompt. Leads with appearance
 * traits (what a picture can show) and adds a light personality "mood" tail.
 * @param {object} char
 * @returns {string}
 */
export function buildImagePrompt(char) {
  const c = char || {};
  const { personality, appearance } = bucketTraits(c.traitTags);

  const parts = [];
  // Subject noun from role, else a neutral "character portrait".
  const role = c.role && String(c.role).trim();
  parts.push(role ? `character portrait of a ${role.toLowerCase()}` : 'detailed character portrait');

  // Appearance is the visual meat of the prompt.
  const look = allLabels(appearance).map((l) => l.toLowerCase());
  parts.push(...look);

  // A couple of personality descriptors set the mood/expression.
  const mood = allLabels(personality).slice(0, 3).map((l) => l.toLowerCase());
  parts.push(...mood);

  // Quality/style tail that image models respond to.
  parts.push('highly detailed', 'dramatic lighting', 'concept art', 'digital painting');

  return dedupe(parts.filter(Boolean)).join(', ');
}

/** Case-insensitive de-dupe preserving first-seen order. */
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item).toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out;
}

/**
 * Convenience: build both prompt styles at once.
 * @param {object} char
 * @returns {{ writing: string, image: string }}
 */
export function buildPrompts(char) {
  return { writing: buildWritingPrompt(char), image: buildImagePrompt(char) };
}
