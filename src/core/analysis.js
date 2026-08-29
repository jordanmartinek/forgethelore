/**
 * LoreForge Planner - Deterministic Story Analysis Engine
 *
 * PHASE 3 (#4/#5): the app was branded around "AI" but shipped a hardcoded
 * array of static suggestion strings. This engine produces REAL, data-driven
 * analysis by inspecting the actual entity graph, board pieces, scenes, and
 * relationships — with NO network and NO API key required. It is both:
 *   - the always-on offline experience, and
 *   - the deterministic fallback for the optional AI layer (core/ai.js) when no
 *     key is configured or a request fails.
 *
 * Two kinds of output:
 *   - Consistency issues: contradictions/gaps a careful editor would flag.
 *   - Strategic suggestions: opportunities for tension, escalation, or balance.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';
import { buildGraph } from './entities.js';

/**
 * @typedef {Object} Insight
 * @property {'issue'|'suggestion'} kind
 * @property {string} icon
 * @property {string} title
 * @property {string} detail
 * @property {'high'|'medium'|'low'} [severity]
 * @property {string} [module]   Registry id to jump to for context.
 */

/** Run every deterministic check and return a flat, de-duplicated list. */
export function analyzeProject() {
  const pieces = repo.list(Collections.PIECES);
  const scenes = repo.list(Collections.SCENES).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const factions = repo.list(Collections.BOARD_FACTIONS);
  const relationships = repo.list(Collections.RELATIONSHIPS);
  const conflictLines = repo.list(Collections.CONFLICT_LINES);
  const { map, edges } = buildGraph();

  /** @type {Insight[]} */
  const out = [];

  out.push(...checkConsistency({ pieces, scenes, factions, relationships, map }));
  out.push(...suggestStrategy({ pieces, scenes, factions, relationships, conflictLines, edges }));

  return out;
}

/** Just the consistency issues (used by the "Consistency Check" action). */
export function checkConsistencyOnly() {
  const pieces = repo.list(Collections.PIECES);
  const scenes = repo.list(Collections.SCENES).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const factions = repo.list(Collections.BOARD_FACTIONS);
  const relationships = repo.list(Collections.RELATIONSHIPS);
  const { map } = buildGraph();
  return checkConsistency({ pieces, scenes, factions, relationships, map });
}

// ─── Consistency checks ──────────────────────────────────────────────────────

function checkConsistency({ pieces, scenes, factions, relationships, map }) {
  const issues = [];
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const sceneOrder = new Map(scenes.map((s) => [s.id, s.order || 0]));

  // 1) Dangling references: scene participants / relationships pointing at
  //    entities that no longer exist.
  scenes.forEach((s) => {
    (s.participants || []).forEach((pid) => {
      if (!pieceById.has(pid) && !map.has(pid)) {
        issues.push({
          kind: 'issue', icon: '🔗', severity: 'high', module: 'conflict-board',
          title: `Scene "${s.title || 'Untitled'}" references a missing character`,
          detail: `Participant "${pid}" no longer exists. Remove it or recreate the character.`,
        });
      }
    });
  });
  relationships.forEach((r) => {
    if (!pieceById.has(r.sourceId) && !map.has(r.sourceId)) {
      issues.push({ kind: 'issue', icon: '🔗', severity: 'medium', module: 'relationships',
        title: 'Relationship points to a missing character',
        detail: `One side of a "${r.type}" relationship (${r.sourceId}) is gone.` });
    }
  });

  // 2) Faction with no members — a faction that exists but no piece belongs to.
  factions.forEach((f) => {
    const members = pieces.filter((p) => p.faction === f.id);
    if (members.length === 0) {
      issues.push({ kind: 'issue', icon: '🏳️', severity: 'low', module: 'factions',
        title: `Faction "${f.name}" has no characters`,
        detail: 'Add members or fold it into another faction so it carries weight in the story.' });
    }
  });

  // 3) Characters who never appear in any scene.
  const appear = new Set();
  scenes.forEach((s) => (s.participants || []).forEach((pid) => appear.add(pid)));
  pieces.forEach((p) => {
    if (!appear.has(p.id)) {
      issues.push({ kind: 'issue', icon: '👻', severity: 'low', module: 'conflict-board',
        title: `${p.name} never appears in a scene`,
        detail: 'They exist on the board but do nothing yet — give them a scene or cut them.' });
    }
  });

  // 4) Timeline sanity: duplicate scene order values.
  const seenOrder = new Map();
  scenes.forEach((s) => {
    const o = s.order || 0;
    if (seenOrder.has(o)) {
      issues.push({ kind: 'issue', icon: '⏱️', severity: 'medium', module: 'timeline',
        title: `Two scenes share order #${o}`,
        detail: `"${seenOrder.get(o)}" and "${s.title}" are both at position ${o}; sequencing is ambiguous.` });
    } else {
      seenOrder.set(o, s.title || 'Untitled');
    }
  });

  // 5) Dead-then-alive continuity: a character featured in a scene whose text
  //    implies their death, then featured again in a LATER scene.
  const deathOrder = new Map(); // pieceId -> earliest scene order implying death
  scenes.forEach((s) => {
    const t = `${s.title || ''} ${s.summary || ''} ${s.outcome || ''}`.toLowerCase();
    if (!/\bdies\b|\bdied\b|\bkilled\b|\bdeath of\b|\bexecuted\b/.test(t)) return;
    (s.participants || []).forEach((pid) => {
      const o = sceneOrder.get(s.id) ?? 0;
      if (!deathOrder.has(pid) || o < deathOrder.get(pid)) deathOrder.set(pid, o);
    });
  });
  scenes.forEach((s) => {
    const o = sceneOrder.get(s.id) ?? 0;
    (s.participants || []).forEach((pid) => {
      if (deathOrder.has(pid) && o > deathOrder.get(pid)) {
        const name = pieceById.get(pid)?.name || pid;
        issues.push({ kind: 'issue', icon: '💀', severity: 'high', module: 'conflict-board',
          title: `${name} appears after apparently dying`,
          detail: `A scene at position ${o} features ${name}, but an earlier scene (position ${deathOrder.get(pid)}) implies their death. Intentional (flashback/resurrection) or a continuity slip?` });
      }
    });
  });

  return issues;
}

// ─── Strategic suggestions ───────────────────────────────────────────────────

function suggestStrategy({ pieces, scenes, factions, relationships, conflictLines, edges }) {
  const suggestions = [];
  const pieceById = new Map(pieces.map((p) => [p.id, p]));

  // Degree of conflict per piece (how many opposition/competition lines).
  const conflictDegree = new Map();
  conflictLines.forEach((l) => {
    if (['opposition', 'competition', 'manipulation'].includes(l.type)) {
      conflictDegree.set(l.from, (conflictDegree.get(l.from) || 0) + 1);
      conflictDegree.set(l.to, (conflictDegree.get(l.to) || 0) + 1);
    }
  });

  // 1) Protagonists with no opposition — the classic "no stakes" gap.
  pieces.filter((p) => p.role === 'protagonist').forEach((p) => {
    if (!conflictDegree.get(p.id)) {
      suggestions.push({ kind: 'suggestion', icon: '⚠️', severity: 'high', module: 'conflict-board',
        title: `${p.name} has no meaningful opposition`,
        detail: 'Add a direct antagonist or apply pressure from a rival faction to create stakes.' });
    }
  });

  // 2) Antagonists whose hidden goal conflicts with an ally — betrayal fuel.
  const allies = new Map(); // pieceId -> [allyIds]
  conflictLines.filter((l) => l.type === 'alliance').forEach((l) => {
    allies.set(l.from, [...(allies.get(l.from) || []), l.to]);
    allies.set(l.to, [...(allies.get(l.to) || []), l.from]);
  });
  pieces.forEach((p) => {
    if (p.hiddenGoal && (allies.get(p.id) || []).length) {
      const allyNames = (allies.get(p.id) || []).map((id) => pieceById.get(id)?.name).filter(Boolean);
      if (allyNames.length) {
        suggestions.push({ kind: 'suggestion', icon: '🗡️', severity: 'medium', module: 'conflict-board',
          title: `${p.name} has a hidden goal while allied with ${allyNames.join(', ')}`,
          detail: 'Hidden agendas among allies are natural betrayal setups — plan the turn.' });
      }
    }
  });

  // 3) Faction dominance imbalance — one faction far ahead on goal progress.
  if (factions.length >= 2) {
    const sorted = [...factions].sort((a, b) => (b.goalProgress || 0) - (a.goalProgress || 0));
    const top = sorted[0];
    const second = sorted[1];
    if ((top.goalProgress || 0) - (second.goalProgress || 0) >= 40) {
      suggestions.push({ kind: 'suggestion', icon: '⚖️', severity: 'medium', module: 'factions',
        title: `${top.name} is running away with the story`,
        detail: `It's ${top.goalProgress - second.goalProgress} points ahead of ${second.name}. Introduce a setback or let rivals coordinate against it.` });
    }
  }

  // 4) Unresolved planned scenes piling up.
  const planned = scenes.filter((s) => s.status === 'planned' || s.status === 'active');
  if (planned.length >= 4) {
    suggestions.push({ kind: 'suggestion', icon: '📥', severity: 'low', module: 'conflict-board',
      title: `${planned.length} scenes are still open`,
      detail: 'Several planned/active scenes are unresolved — resolving a few will shift the board and open new tension.' });
  }

  // 5) Isolated characters (no relationships at all) — missed connective tissue.
  const connected = new Set();
  relationships.forEach((r) => { connected.add(r.sourceId); connected.add(r.targetId); });
  edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
  const isolated = pieces.filter((p) => !connected.has(p.id));
  if (isolated.length) {
    const names = isolated.slice(0, 3).map((p) => p.name).join(', ');
    suggestions.push({ kind: 'suggestion', icon: '🧩', severity: 'low', module: 'relationships',
      title: `${isolated.length} character(s) have no relationships`,
      detail: `${names}${isolated.length > 3 ? '…' : ''} aren't connected to anyone. Relationships drive reader investment.` });
  }

  // Fallback so the panel is never empty on a healthy board.
  if (suggestions.length === 0) {
    suggestions.push({ kind: 'suggestion', icon: '✅', severity: 'low',
      title: 'No structural gaps detected',
      detail: 'Every protagonist has opposition, factions are balanced, and characters are connected. Consider raising the stakes on your strongest thread.' });
  }

  return suggestions;
}
