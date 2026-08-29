/**
 * LoreForge Planner - Word-Count & POV Analytics (#21)
 *
 * A read-only analysis view. Two tabs:
 *   • Word Count — prose volume by manuscript step and narrative phase, with a
 *     phase distribution bar (inline SVG — no chart library).
 *   • POV Balance — per-character lead/present scene counts across the strategic
 *     board, flagging silent protagonists and never-used pieces.
 */

import { h } from '../core/renderer.js';
import { loadData } from '../core/persist.js';
import { list, Collections } from '../core/repo.js';
import { formatNumber } from '../core/format.js';
import { wordCountReport, povReport } from '../core/pov-analytics.js';

// Truby structure metadata (kept in sync with manuscript-planner's step/phase
// definitions — only the fields this view needs).
const TRUBY_STEPS = [
  { num: 1, title: 'Self-Revelation, Need & Desire' }, { num: 2, title: 'Ghost & Story World' },
  { num: 3, title: 'Weakness & Need' }, { num: 4, title: 'Inciting Event' }, { num: 5, title: 'Desire' },
  { num: 6, title: 'Allies' }, { num: 7, title: 'Opponent / Mystery' }, { num: 8, title: 'Fake-Ally Opponent' },
  { num: 9, title: 'First Revelation & Decision' }, { num: 10, title: 'Plan' }, { num: 11, title: "Opponent's Plan" },
  { num: 12, title: 'Drive' }, { num: 13, title: 'Attack by Ally' }, { num: 14, title: 'Apparent Defeat' },
  { num: 15, title: 'Second Revelation & Decision' }, { num: 16, title: 'Audience Revelation' },
  { num: 17, title: 'Third Revelation & Decision' }, { num: 18, title: 'Gate, Gauntlet, Visit to Death' },
  { num: 19, title: 'Battle' }, { num: 20, title: 'Self-Revelation' }, { num: 21, title: 'Moral Decision' },
  { num: 22, title: 'New Equilibrium' },
];

const PHASES = [
  { name: 'Setup', color: '#6366f1', steps: [1, 2, 3, 4, 5] },
  { name: 'Development', color: '#06b6d4', steps: [6, 7, 8, 9, 10, 11] },
  { name: 'Intensification', color: '#f97316', steps: [12, 13, 14, 15, 16] },
  { name: 'Climax', color: '#dc2626', steps: [17, 18, 19] },
  { name: 'Resolution', color: '#22c55e', steps: [20, 21, 22] },
];

let activeTab = 'words';

export function renderPovAnalytics(container) {
  const root = h('div', { style: { padding: '20px', height: '100%', overflowY: 'auto' } });
  rebuild(root);
  container.appendChild(root);
}

function rebuild(root) {
  root.innerHTML = '';
  root.appendChild(
    h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' } },
      h('div', {},
        h('h1', { style: { fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' } }, '📊 Word & POV Analytics'),
        h('p', { style: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' } }, 'Prose volume by structure, and who carries your scenes.'),
      ),
      h('div', { style: { display: 'flex', gap: '6px' } },
        tabBtn('words', '📝 Word Count', root),
        tabBtn('pov', '🎭 POV Balance', root),
      ),
    ),
  );
  if (activeTab === 'words') renderWordTab(root);
  else renderPovTab(root);
}

function tabBtn(id, label, root) {
  const active = activeTab === id;
  return h('button', {
    class: 'btn btn--sm',
    style: {
      background: active ? 'var(--bg-active)' : 'transparent',
      border: active ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
    },
    onclick: () => { activeTab = id; rebuild(root); },
  }, label);
}

// ─── Word Count tab ──────────────────────────────────────────────────────────

function renderWordTab(root) {
  const sceneCards = loadData('manuscriptScenes', {}) || {};
  const report = wordCountReport(sceneCards, PHASES, TRUBY_STEPS);

  if (report.total === 0) {
    root.appendChild(emptyState('No manuscript prose yet', 'Add scene cards in the Manuscript module to see word-count analytics here.'));
    return;
  }

  // Summary stat cards.
  root.appendChild(
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' } },
      statCard('📝', formatNumber(report.total), 'Total words'),
      statCard('🎬', String(report.sceneCount), 'Scene cards'),
      statCard('📈', report.longest ? formatNumber(report.longest.words) : '—', report.longest ? `Longest: ${report.longest.title}` : 'Longest scene'),
      statCard('⚖️', `${report.byPhase.reduce((m, p) => Math.max(m, p.pct), 0)}%`, 'Heaviest phase share'),
    ),
  );

  // Phase distribution bar (stacked, inline SVG).
  root.appendChild(sectionTitle('Distribution across phases'));
  root.appendChild(phaseBar(report.byPhase));

  // Per-phase word breakdown with step detail.
  root.appendChild(sectionTitle('By phase & step'));
  const maxStepWords = Math.max(1, ...report.byStep.map((s) => s.words));
  const stepWordMap = new Map(report.byStep.map((s) => [s.num, s]));

  for (const phase of PHASES) {
    const phaseReport = report.byPhase.find((p) => p.name === phase.name);
    root.appendChild(
      h('div', { style: { marginBottom: '14px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
          h('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: phase.color } }),
          h('span', { style: { fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' } }, phase.name),
          h('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, `${formatNumber(phaseReport ? phaseReport.words : 0)} words · ${phaseReport ? phaseReport.pct : 0}%`),
        ),
        ...phase.steps.map((num) => {
          const s = stepWordMap.get(num) || { num, title: (TRUBY_STEPS.find((t) => t.num === num) || {}).title || `Step ${num}`, words: 0, cards: 0 };
          const pct = Math.round((s.words / maxStepWords) * 100);
          return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', fontSize: '12px' } },
            h('span', { style: { width: '180px', color: s.words ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${num}. ${s.title}`),
            h('div', { style: { flex: '1', height: '8px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' } },
              h('div', { style: { width: `${pct}%`, height: '100%', background: phase.color, borderRadius: '4px' } }),
            ),
            h('span', { style: { width: '70px', textAlign: 'right', color: 'var(--text-muted)' } }, `${formatNumber(s.words)}`),
          );
        }),
      ),
    );
  }
}

function phaseBar(byPhase) {
  const total = byPhase.reduce((n, p) => n + p.words, 0) || 1;
  const wrap = h('div', { style: { display: 'flex', height: '28px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-subtle)', marginBottom: '18px' } });
  const colorByName = new Map(PHASES.map((p) => [p.name, p.color]));
  byPhase.forEach((p) => {
    if (p.words <= 0) return;
    const pct = (p.words / total) * 100;
    wrap.appendChild(
      h('div', {
        title: `${p.name}: ${p.pct}%`,
        style: { width: `${pct}%`, background: colorByName.get(p.name) || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: '600', overflow: 'hidden' },
      }, pct > 8 ? `${p.pct}%` : ''),
    );
  });
  return wrap;
}

// ─── POV Balance tab ─────────────────────────────────────────────────────────

function renderPovTab(root) {
  const scenes = list(Collections.SCENES);
  const pieces = list(Collections.PIECES);
  const factions = list(Collections.BOARD_FACTIONS);
  const report = povReport(scenes, pieces, factions);

  if (report.totalScenes === 0) {
    root.appendChild(emptyState('No scenes on the board yet', 'Add scenes with participants on the Strategic Board to analyze POV balance.'));
    return;
  }

  root.appendChild(
    h('p', { style: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' } },
      `Across ${report.totalScenes} scene${report.totalScenes === 1 ? '' : 's'}. The first participant of each scene is treated as its POV/lead.`),
  );

  // Warnings.
  if (report.silentProtagonists.length) {
    root.appendChild(warnBox('⚠️ Protagonist goes quiet',
      report.silentProtagonists.map((p) => `${p.name} disappears for up to ${p.maxGap} scenes`).join('; ')));
  }
  if (report.unusedPieces.length) {
    root.appendChild(warnBox('👻 Never appears in a scene',
      report.unusedPieces.map((p) => p.name).join(', ')));
  }

  const maxAppear = Math.max(1, ...report.rows.map((r) => r.appearances));

  root.appendChild(sectionTitle('Scene appearances (lead vs. present)'));
  root.appendChild(
    h('div', {},
      ...report.rows.map((r) => {
        const leadW = (r.lead / maxAppear) * 100;
        const presentW = (r.present / maxAppear) * 100;
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
          h('div', { style: { width: '150px', minWidth: '150px' } },
            h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
            h('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, r.role),
          ),
          h('div', { style: { flex: '1', display: 'flex', height: '16px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' } },
            h('div', { title: `${r.lead} lead`, style: { width: `${leadW}%`, background: r.color, height: '100%' } }),
            h('div', { title: `${r.present} present`, style: { width: `${presentW}%`, background: r.color, opacity: '0.4', height: '100%' } }),
          ),
          h('span', { style: { width: '110px', textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' } },
            `${r.lead} lead · ${r.present} present`),
        );
      }),
    ),
  );

  root.appendChild(
    h('div', { style: { display: 'flex', gap: '16px', marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' } },
      legendDot('var(--accent-primary)', 1, 'Lead (POV)'),
      legendDot('var(--accent-primary)', 0.4, 'Present'),
    ),
  );
}

function legendDot(color, opacity, label) {
  return h('span', { style: { display: 'flex', alignItems: 'center', gap: '5px' } },
    h('span', { style: { width: '12px', height: '12px', borderRadius: '3px', background: color, opacity: String(opacity) } }),
    label);
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function statCard(icon, value, label) {
  return h('div', { style: { background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' } },
    h('div', { style: { fontSize: '20px', marginBottom: '4px' } }, icon),
    h('div', { style: { fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' } }, value),
    h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
  );
}

function sectionTitle(text) {
  return h('h2', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '18px 0 10px' } }, text);
}

function warnBox(title, detail) {
  return h('div', { style: { background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderLeft: '3px solid var(--warning)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' } },
    h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, title),
    h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' } }, detail),
  );
}

function emptyState(title, description) {
  return h('div', { style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' } },
    h('div', { style: { fontSize: '40px', marginBottom: '12px', opacity: '0.5' } }, '📊'),
    h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' } }, title),
    h('div', { style: { fontSize: '13px' } }, description),
  );
}
