/**
 * LoreForge Planner - Knowledge / Secrets Model (#5)
 *
 * Tracks WHO KNOWS WHAT and WHEN — the backbone of the knowledge/secrets matrix
 * and dramatic-irony detection. The app previously only had free-text `secrets`
 * on characters and a `truth` string on mysteries, with no structured model of
 * who is aware of a secret at a given point in the story.
 *
 * Data model (persisted via repo under Collections.KNOWLEDGE):
 *   KnowledgeItem {
 *     id, label,                     // e.g. "Aurelian's true agenda"
 *     source: 'mystery'|'custom',    // where it came from
 *     sourceId?,                     // linked mystery id, if any
 *     reader: boolean,               // does the AUDIENCE know it? (dramatic irony)
 *     readerScene?: sceneOrder,      // when the audience learns it (null = knows from start / never)
 *     knowers: [                     // per-character awareness
 *       { pieceId, sceneOrder, level } // level: 'knows'|'suspects'|'false'
 *     ]
 *   }
 *
 * `sceneOrder` is a scene's numeric order (not id) so the timeline math is
 * simple and stable even if a scene is renamed.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';
import { generateId } from './objects.js';

export const KNOWLEDGE_LEVELS = {
  knows: { label: 'Knows', icon: '🟢', color: '#22c55e' },
  suspects: { label: 'Suspects', icon: '🟡', color: '#f59e0b' },
  false: { label: 'False belief', icon: '🔴', color: '#ef4444' },
  unaware: { label: 'Unaware', icon: '⚪', color: '#64748b' },
};

/** Read all knowledge items. */
export function listKnowledge() {
  return repo.list(Collections.KNOWLEDGE);
}

export function saveKnowledge(items) {
  return repo.write(Collections.KNOWLEDGE, items);
}

/**
 * Seed knowledge items from mysteries that don't already have one. Each
 * mystery's `truth` becomes a knowledge item nobody knows yet — a starting
 * point the author refines. Non-destructive: never touches existing items.
 * @returns {Array} the (possibly extended) knowledge list
 */
export function seedFromMysteries() {
  const items = listKnowledge();
  const existingSourceIds = new Set(items.filter((i) => i.sourceId).map((i) => i.sourceId));
  const mysteries = repo.list(Collections.MYSTERIES);
  let added = 0;
  for (const m of mysteries) {
    if (existingSourceIds.has(m.id)) continue;
    items.push({
      id: generateId(),
      label: m.title || 'Untitled mystery',
      detail: m.truth || '',
      source: 'mystery',
      sourceId: m.id,
      reader: false,
      readerScene: null,
      knowers: [],
    });
    added++;
  }
  if (added > 0) saveKnowledge(items);
  return items;
}

/** Create a custom knowledge item. */
export function addKnowledgeItem({ label, detail = '', reader = false, readerScene = null }) {
  const items = listKnowledge();
  const item = { id: generateId(), label, detail, source: 'custom', reader, readerScene, knowers: [] };
  items.push(item);
  saveKnowledge(items);
  return item;
}

export function removeKnowledgeItem(id) {
  const items = listKnowledge().filter((i) => i.id !== id);
  saveKnowledge(items);
  return items;
}

/**
 * Set a character's knowledge level for an item (from a given scene onward).
 * level 'unaware' removes the entry.
 */
export function setKnower(itemId, pieceId, level, sceneOrder) {
  const items = listKnowledge();
  const item = items.find((i) => i.id === itemId);
  if (!item) return items;
  item.knowers = item.knowers.filter((k) => k.pieceId !== pieceId);
  if (level && level !== 'unaware') {
    item.knowers.push({ pieceId, level, sceneOrder: sceneOrder ?? 0 });
  }
  saveKnowledge(items);
  return items;
}

/** Set whether/when the AUDIENCE (reader) knows an item. */
export function setReaderKnowledge(itemId, reader, readerScene = null) {
  const items = listKnowledge();
  const item = items.find((i) => i.id === itemId);
  if (!item) return items;
  item.reader = !!reader;
  item.readerScene = reader ? readerScene : null;
  saveKnowledge(items);
  return items;
}

/**
 * A character's awareness level of an item AT a given scene order.
 * @returns {'knows'|'suspects'|'false'|'unaware'}
 */
export function levelAtScene(item, pieceId, sceneOrder) {
  const k = item.knowers.find((x) => x.pieceId === pieceId);
  if (!k) return 'unaware';
  if ((k.sceneOrder ?? 0) > sceneOrder) return 'unaware'; // doesn't know YET at this point
  return k.level;
}

/** Does the audience know this item at a given scene order? */
export function readerKnowsAtScene(item, sceneOrder) {
  if (!item.reader) return false;
  // readerScene == null means the reveal scene hasn't been set yet — we do NOT
  // assume "known from the start", because that would flag every unmapped
  // character in every scene as dramatic irony the moment the flag is toggled.
  // The author sets an explicit reveal scene (0 = from the very start).
  if (item.readerScene == null) return false;
  return item.readerScene <= sceneOrder;
}

/**
 * Detect DRAMATIC IRONY at a scene: the audience knows a secret, but a
 * character present in the scene does NOT (or believes something false).
 * Returns a list of { item, pieceId } irony instances.
 *
 * @param {object} scene   a scene { order, participants:[pieceId] }
 * @param {Array} items    knowledge items
 */
export function ironyInScene(scene, items) {
  const order = scene.order ?? 0;
  const out = [];
  for (const item of items) {
    if (!readerKnowsAtScene(item, order)) continue;
    for (const pieceId of scene.participants || []) {
      const lvl = levelAtScene(item, pieceId, order);
      if (lvl === 'unaware' || lvl === 'false') out.push({ item, pieceId, level: lvl });
    }
  }
  return out;
}

/**
 * Detect a CONTINUITY LEAK: a character acts on knowledge before the scene at
 * which they're recorded to have learned it. We approximate "acts on" as
 * "participates in a scene". Returns { item, pieceId, learnedAt, seenAt }.
 *
 * @param {Array} scenes ordered scenes
 * @param {Array} items  knowledge items
 */
/** Case-insensitive whole-phrase match with word boundaries around `needle`. */
function wordBoundaryMatch(haystack, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(haystack);
}

export function knowledgeLeaks(scenes, items) {
  const ordered = [...scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
  const leaks = [];
  for (const item of items) {
    for (const k of item.knowers) {
      if (k.level !== 'knows') continue;
      const learnedAt = k.sceneOrder ?? 0;
      // A scene BEFORE learnedAt that this character participates in AND whose
      // text references the item is a potential leak. We keep it conservative:
      // only flag if the scene summary/outcome mentions the item label.
      for (const s of ordered) {
        if ((s.order ?? 0) >= learnedAt) break;
        if (!(s.participants || []).includes(k.pieceId)) continue;
        const text = `${s.title || ''} ${s.summary || ''} ${s.outcome || ''}`.toLowerCase();
        const label = (item.label || '').toLowerCase().trim();
        // Word-boundary match on a sufficiently distinctive label, to avoid
        // false positives from short labels appearing inside unrelated words.
        if (label.length >= 4 && wordBoundaryMatch(text, label)) {
          leaks.push({ item, pieceId: k.pieceId, learnedAt, seenAt: s.order ?? 0, scene: s });
        }
      }
    }
  }
  return leaks;
}
