/**
 * LoreForge Planner - Word-Count & POV Analytics (#21)
 *
 * Pure, DOM-free analysis functions so they can be unit-tested in Node and
 * reused by the module view. Two independent questions are answered:
 *
 *   1. WORD COUNT — how much prose exists, broken down by Truby structural step
 *      and by narrative phase (Setup / Development / …). Source of truth is the
 *      manuscript planner's step-keyed scene object (Collections.MANUSCRIPT):
 *      `{ [stepNum]: [{ id, title, content, color }] }`.
 *
 *   2. POV BALANCE — which characters "carry" scenes, so an author can spot a
 *      protagonist who has gone silent for a stretch or a supposedly-central
 *      character who never appears. Source of truth is the strategic board's
 *      scenes (Collections.SCENES): each has `participants: [pieceId]` and an
 *      `order`. By convention the FIRST participant is treated as the POV/lead
 *      of that scene; the rest are "present". Both are surfaced.
 *
 * Everything is computed from plain data passed in by the caller, so the module
 * layer owns all storage/DOM concerns and these functions stay deterministic.
 */

import { countWords } from './format.js';

/**
 * Word counts grouped by manuscript step and phase.
 *
 * @param {Record<string|number, Array<{title?:string,content?:string}>>} sceneCards
 *   The manuscript step map. Keys are step numbers (as strings or numbers).
 * @param {Array<{name:string, steps:number[]}>} phases  Phase → step-number mapping.
 * @param {Array<{num:number, title:string}>} [steps]     Optional step metadata for labels.
 * @returns {{
 *   total: number,
 *   sceneCount: number,
 *   byStep: Array<{ num:number, title:string, words:number, cards:number }>,
 *   byPhase: Array<{ name:string, words:number, cards:number, pct:number }>,
 *   longest: { num:number, title:string, words:number }|null,
 * }}
 */
export function wordCountReport(sceneCards, phases = [], steps = []) {
  const cards = sceneCards && typeof sceneCards === 'object' ? sceneCards : {};
  const titleByNum = new Map((steps || []).map((s) => [Number(s.num), s.title]));

  const byStep = [];
  let total = 0;
  let sceneCount = 0;

  // Iterate every step key present in the map (numeric order).
  const stepKeys = Object.keys(cards)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const num of stepKeys) {
    const list = Array.isArray(cards[num]) ? cards[num] : [];
    let words = 0;
    for (const card of list) {
      words += countWords(card && card.title ? card.title : '');
      words += countWords(card && card.content ? card.content : '');
    }
    total += words;
    sceneCount += list.length;
    byStep.push({ num, title: titleByNum.get(num) || `Step ${num}`, words, cards: list.length });
  }

  // Aggregate into phases (a phase's words = sum of its member steps).
  const wordsByNum = new Map(byStep.map((s) => [s.num, s.words]));
  const cardsByNum = new Map(byStep.map((s) => [s.num, s.cards]));
  const byPhase = (phases || []).map((p) => {
    let words = 0;
    let cardsN = 0;
    for (const n of p.steps || []) {
      words += wordsByNum.get(n) || 0;
      cardsN += cardsByNum.get(n) || 0;
    }
    return { name: p.name, words, cards: cardsN, pct: 0 };
  });
  for (const p of byPhase) p.pct = total > 0 ? Math.round((p.words / total) * 100) : 0;

  let longest = null;
  for (const s of byStep) {
    if (!longest || s.words > longest.words) longest = { num: s.num, title: s.title, words: s.words };
  }
  if (longest && longest.words === 0) longest = null;

  return { total, sceneCount, byStep, byPhase, longest };
}

/**
 * POV / appearance balance across board scenes.
 *
 * Convention: the FIRST participant of a scene is its POV/lead; every other
 * participant is "present". A character with zero lead scenes but many
 * appearances is a strong supporting character; a protagonist with a long gap
 * between lead scenes may signal a pacing problem.
 *
 * @param {Array<{id:string, order?:number, participants?:string[]}>} scenes
 * @param {Array<{id:string, name:string, faction?:string, role?:string}>} pieces
 * @param {Array<{id:string, color?:string}>} [factions]  For coloring by faction.
 * @returns {{
 *   totalScenes: number,
 *   rows: Array<{
 *     id:string, name:string, role:string, color:string,
 *     lead:number, present:number, appearances:number,
 *     leadPct:number, firstOrder:number|null, lastOrder:number|null, maxGap:number,
 *   }>,
 *   silentProtagonists: Array<{ id:string, name:string, maxGap:number }>,
 *   unusedPieces: Array<{ id:string, name:string }>,
 * }}
 */
export function povReport(scenes, pieces, factions = []) {
  const sceneList = (Array.isArray(scenes) ? scenes : [])
    .filter((s) => s && Array.isArray(s.participants))
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const totalScenes = sceneList.length;

  const factionColor = new Map((factions || []).map((f) => [f.id, f.color]));
  const pieceById = new Map((Array.isArray(pieces) ? pieces : []).map((p) => [p.id, p]));

  // Per-piece accumulators.
  const stats = new Map();
  const ensure = (id) => {
    if (!stats.has(id)) {
      const p = pieceById.get(id);
      stats.set(id, {
        id,
        name: p ? p.name : id,
        role: (p && p.role) || 'unknown',
        color: (p && factionColor.get(p.faction)) || '#6366f1',
        lead: 0,
        present: 0,
        orders: [],
        positions: [],
      });
    }
    return stats.get(id);
  };

  sceneList.forEach((scene, idx) => {
    // `order` is kept for first/last display; gaps are measured in the scene
    // SEQUENCE position (idx) so the units match the count-based threshold below
    // regardless of how sparse or non-contiguous the authored `order` values are.
    const order = Number.isFinite(scene.order) ? scene.order : idx + 1;
    const parts = scene.participants.filter((pid) => typeof pid === 'string');
    parts.forEach((pid, pIdx) => {
      const st = ensure(pid);
      if (pIdx === 0) st.lead += 1;
      else st.present += 1;
      st.orders.push(order);
      st.positions.push(idx);
    });
  });

  const rows = [...stats.values()].map((st) => {
    const appearances = st.lead + st.present;
    const orders = st.orders.slice().sort((a, b) => a - b);
    const positions = st.positions.slice().sort((a, b) => a - b);
    const firstOrder = orders.length ? orders[0] : null;
    const lastOrder = orders.length ? orders[orders.length - 1] : null;
    // Largest gap between consecutive appearances, counted in NUMBER OF SCENES
    // skipped between them (sequence-position units), so it is directly
    // comparable to a scene-count threshold.
    let maxGap = 0;
    for (let i = 1; i < positions.length; i++) maxGap = Math.max(maxGap, positions[i] - positions[i - 1]);
    return {
      id: st.id,
      name: st.name,
      role: st.role,
      color: st.color,
      lead: st.lead,
      present: st.present,
      appearances,
      leadPct: appearances > 0 ? Math.round((st.lead / appearances) * 100) : 0,
      firstOrder,
      lastOrder,
      maxGap,
    };
  });

  // Sort by appearances desc, then lead desc, for a stable, useful order.
  rows.sort((a, b) => b.appearances - a.appearances || b.lead - a.lead || a.name.localeCompare(b.name));

  // Protagonists who disappear for a long stretch (gap > ~1/3 of the story).
  const gapThreshold = Math.max(2, Math.ceil(totalScenes / 3));
  const silentProtagonists = rows
    .filter((r) => /protagonist|hero|lead/i.test(r.role) && r.maxGap >= gapThreshold)
    .map((r) => ({ id: r.id, name: r.name, maxGap: r.maxGap }));

  // Pieces that never appear in any scene (dead weight / to be introduced).
  const appearing = new Set(rows.map((r) => r.id));
  const unusedPieces = (Array.isArray(pieces) ? pieces : [])
    .filter((p) => p && p.id && !appearing.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  return { totalScenes, rows, silentProtagonists, unusedPieces };
}
