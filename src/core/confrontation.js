/**
 * LoreForge Planner - Confrontation Resolver (#28)
 *
 * Resolves any CONTEST where two or more sides fight over a STAKE — not just a
 * military battle. A stake can be a throne (political), a trial (knowledge +
 * political), a market war (economic), a siege (military), a public debate, a
 * heist, a duel of wits, etc. The author picks the contestants (board pieces
 * and/or whole factions), the stake, and which of the four resource axes matter
 * (with weights); the resolver computes each side's effective strength, a
 * probability of victory, a sampled outcome, and the resulting power shift that
 * can be fed back onto the Strategic Board as a scene.
 *
 * Pure and deterministic given an injected RNG, so it is fully unit-testable
 * with no DOM/network.
 */

export const RESOURCE_AXES = ['political', 'military', 'economic', 'knowledge'];

/**
 * Preset stake types with sensible default axis weights. Authors can override.
 * Weights are relative; they're normalized internally.
 */
export const STAKE_PRESETS = {
  battle:    { label: 'Battle / Siege',      icon: '⚔️', weights: { military: 3, political: 1, economic: 1, knowledge: 1 } },
  throne:    { label: 'Political Struggle',  icon: '👑', weights: { political: 3, economic: 1, military: 1, knowledge: 1 } },
  trial:     { label: 'Trial / Judgment',    icon: '⚖️', weights: { knowledge: 2, political: 2, economic: 1, military: 0.5 } },
  market:    { label: 'Economic / Trade War',icon: '💰', weights: { economic: 3, political: 1, knowledge: 1, military: 0.5 } },
  intrigue:  { label: 'Intrigue / Secrets',  icon: '🕵️', weights: { knowledge: 3, political: 1.5, economic: 1, military: 0.5 } },
  debate:    { label: 'Debate / Persuasion', icon: '🗣️', weights: { political: 2, knowledge: 2, economic: 0.5, military: 0.2 } },
  heist:     { label: 'Heist / Infiltration',icon: '🗝️', weights: { knowledge: 2.5, economic: 1.5, military: 1, political: 0.5 } },
  custom:    { label: 'Custom',              icon: '🎯', weights: { political: 1, military: 1, economic: 1, knowledge: 1 } },
};

/**
 * A contestant is a side in the confrontation with an aggregated resource
 * profile. Build one from board pieces via `sideFromPieces`.
 * @typedef {Object} Side
 * @property {string} id
 * @property {string} name
 * @property {string} [factionId]
 * @property {Record<string, number>} resources  political/military/economic/knowledge
 * @property {number} [modifier]  flat situational bonus/penalty to effective strength (%)
 */

/**
 * Aggregate a set of board pieces into a single Side (summed resources).
 * @param {{id:string,name:string}} meta
 * @param {Array<{resources?:object}>} pieces
 * @returns {Side}
 */
export function sideFromPieces(meta, pieces) {
  const resources = { political: 0, military: 0, economic: 0, knowledge: 0 };
  for (const p of pieces) {
    for (const axis of RESOURCE_AXES) resources[axis] += Number(p.resources?.[axis] || 0);
  }
  return { id: meta.id, name: meta.name, factionId: meta.factionId, resources, modifier: 0 };
}

/** Normalize a weights object so its values sum to 1 (ignoring non-positive). */
export function normalizeWeights(weights) {
  const entries = RESOURCE_AXES.map((a) => [a, Math.max(0, Number(weights?.[a] || 0))]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const out = {};
  for (const [a, v] of entries) out[a] = v / total;
  return out;
}

/**
 * Effective strength of a side = weighted sum of its resources, with its flat
 * modifier applied. Deterministic (no randomness).
 * @param {Side} side
 * @param {Record<string, number>} normWeights
 * @returns {number}
 */
export function effectiveStrength(side, normWeights) {
  let base = 0;
  for (const axis of RESOURCE_AXES) base += (Number(side.resources?.[axis] || 0)) * (normWeights[axis] || 0);
  const mod = 1 + (Number(side.modifier || 0) / 100);
  return Math.max(0, base * mod);
}

/**
 * Win probabilities for each side, softmaxed over effective strengths with a
 * `decisiveness` factor: higher decisiveness -> the stronger side wins more
 * reliably; lower -> more of a coin-flip (upset-friendly). Returns probabilities
 * that sum to 1, aligned with `sides` order.
 * @param {Side[]} sides
 * @param {Record<string, number>} normWeights
 * @param {number} [decisiveness]  0.2 (chaotic) .. 3 (deterministic); default 1
 * @returns {number[]}
 */
export function winProbabilities(sides, normWeights, decisiveness = 1) {
  const strengths = sides.map((s) => effectiveStrength(s, normWeights));
  const maxS = Math.max(1, ...strengths);
  // Scale to keep exponents sane, then softmax with the decisiveness temperature.
  const exps = strengths.map((v) => Math.exp((v / maxS) * decisiveness * 3));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/**
 * Resolve the confrontation: compute probabilities, sample a winner with the
 * injected RNG, and produce a narrative-ready result including a suggested
 * powerShift for the board (winner's faction gains, losers lose, scaled by how
 * decisive the victory was).
 *
 * @param {object} opts
 * @param {Side[]} opts.sides           at least 2
 * @param {object} opts.weights         axis weights (raw; will be normalized)
 * @param {number} [opts.decisiveness]
 * @param {number} [opts.shiftMagnitude] max power points swung (default 20)
 * @param {() => number} [opts.rng]     returns 0..1; defaults to Math.random
 * @returns {{
 *   winner: Side, probabilities: {sideId:string, name:string, p:number, strength:number}[],
 *   margin: number, upset: boolean, powerShift: Record<string, number>, summary: string
 * }}
 */
export function resolveConfrontation({ sides, weights, decisiveness = 1, shiftMagnitude = 20, rng = Math.random }) {
  if (!Array.isArray(sides) || sides.length < 2) {
    throw new Error('A confrontation needs at least two sides');
  }
  const norm = normalizeWeights(weights);
  const probs = winProbabilities(sides, norm, decisiveness);

  // Sample a winner from the probability distribution.
  const roll = Math.min(0.999999, Math.max(0, rng()));
  let acc = 0, winnerIdx = sides.length - 1;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (roll < acc) { winnerIdx = i; break; } }
  const winner = sides[winnerIdx];

  // Favorite = highest-probability side. An upset is when the winner wasn't it.
  const favIdx = probs.indexOf(Math.max(...probs));
  const upset = winnerIdx !== favIdx;

  // Margin = winner's prob minus the runner-up's (how decisive).
  const sorted = [...probs].sort((a, b) => b - a);
  const margin = Math.round(((sorted[0] - (sorted[1] || 0))) * 100);

  // Power shift: winner's faction gains, each losing faction loses a share.
  // If the WINNER has no faction (e.g. a custom character side), we don't drain
  // the losers either — otherwise total board power would decrease with nothing
  // gaining it (a fail-open asymmetry). No winning faction -> no shift at all.
  const powerShift = {};
  const winMag = Math.round(shiftMagnitude * (0.5 + probs[winnerIdx] / 2)); // decisive wins swing more
  if (winner.factionId) {
    powerShift[winner.factionId] = (powerShift[winner.factionId] || 0) + winMag;
    const losers = sides.filter((_, i) => i !== winnerIdx && sides[i].factionId && sides[i].factionId !== winner.factionId);
    const perLoser = losers.length ? Math.round(winMag / losers.length) : 0;
    for (const l of losers) powerShift[l.factionId] = (powerShift[l.factionId] || 0) - perLoser;
  }

  const probabilities = sides.map((s, i) => ({ sideId: s.id, name: s.name, p: probs[i], strength: effectiveStrength(s, norm) }));

  const summary = upset
    ? `Upset! ${winner.name} prevailed against the odds (${Math.round(probs[winnerIdx] * 100)}% chance).`
    : `${winner.name} won ${margin > 40 ? 'decisively' : margin > 15 ? 'clearly' : 'narrowly'} (${Math.round(probs[winnerIdx] * 100)}% favored).`;

  return { winner, probabilities, margin, upset, powerShift, summary };
}
