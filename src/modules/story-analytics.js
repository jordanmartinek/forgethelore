/**
 * LoreForge Planner - Story Analytics (Temporal Views)
 *
 * Three views over the story's timeline, all driven by the whole-world temporal
 * engine (core/timeline-state.js) and dependency-free SVG charts (core/charts.js):
 *   - World Time-Scrubber (#1): drag a slider to replay faction power, piece
 *     momentum, and relationship values at any scene.
 *   - Faction Power (#4): stacked-area chart of faction dominance over scenes.
 *   - Tension & Pacing (#3): per-scene dramatic-tension bars with flat-stretch
 *     warnings, so authors can see pacing dips at a glance.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import {
  orderedScenes, worldStateAtScene, factionPowerSeries, tensionSeries, flatStretches,
  liveScenes, livePieces, liveFactions,
} from '../core/timeline-state.js';
import { stackedAreaChart, barChart, chartLegend, CHART_PALETTE } from '../core/charts.js';
import { RELATIONSHIP_DIMENSIONS } from '../core/progression.js';

let activeTab = 'scrubber';
let scrubIndex = null; // null => default to last scene

export function renderStoryAnalytics(container) {
  const scenes = orderedScenes(liveScenes());

  const wrap = h('div', { style: { width: '100%', height: '100%', overflowY: 'auto', padding: 'var(--space-xl)' } });

  wrap.appendChild(h('div', { style: { marginBottom: '16px' } },
    h('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, '📈 Story Analytics'),
    h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, 'Replay and analyze how your world evolves across scenes.'),
  ));

  if (scenes.length === 0) {
    wrap.appendChild(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state__icon' }, '📈'),
      h('div', { class: 'empty-state__title' }, 'No scenes yet'),
      h('div', { class: 'empty-state__description' }, 'Add scenes on the Strategic Board (with participants and power shifts) to unlock the time-scrubber, faction power chart, and tension graph.'),
    ));
    container.appendChild(wrap);
    return;
  }

  // Tabs
  const tabs = [
    { id: 'scrubber', label: '⏱️ Time Scrubber' },
    { id: 'power', label: '⚖️ Faction Power' },
    { id: 'tension', label: '🎢 Tension & Pacing' },
  ];
  wrap.appendChild(h('div', { class: 'lf-tabs', role: 'tablist', style: { display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)' } },
    ...tabs.map((t) => h('button', {
      class: `btn btn--ghost btn--sm ${t.id === activeTab ? 'btn--active' : ''}`,
      role: 'tab',
      'aria-selected': t.id === activeTab ? 'true' : 'false',
      style: { borderBottom: t.id === activeTab ? '2px solid var(--accent-primary)' : '2px solid transparent', borderRadius: '0', color: t.id === activeTab ? 'var(--text-primary)' : 'var(--text-muted)' },
      onclick: () => { activeTab = t.id; rerender(container); },
    }, t.label)),
  ));

  const body = h('div', { class: 'lf-analytics-body' });
  if (activeTab === 'scrubber') renderScrubber(body, scenes);
  else if (activeTab === 'power') renderPowerChart(body, scenes);
  else renderTension(body, scenes);
  wrap.appendChild(body);

  container.appendChild(wrap);
}

function rerender(container) {
  renderPreservingScroll(container, () => { container.innerHTML = ''; renderStoryAnalytics(container); });
}

// ─── #1 World Time-Scrubber ──────────────────────────────────────────────────

function renderScrubber(body, scenes) {
  const idx = scrubIndex == null ? scenes.length - 1 : Math.min(scrubIndex, scenes.length - 1);

  const caption = h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' } });
  const panels = h('div', { id: 'scrub-panels', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } });

  // The slider is built ONCE and never rebuilt on input — only the caption and
  // panels update — so dragging (mouse or keyboard) is never interrupted.
  const slider = h('input', {
    type: 'range', min: '0', max: String(scenes.length - 1), value: String(idx), step: '1',
    style: { width: '100%' }, 'aria-label': 'Scrub to scene',
    oninput: (e) => { scrubIndex = Number(e.target.value); paintScrub(caption, panels, scenes, scrubIndex); },
  });

  body.appendChild(caption);
  body.appendChild(slider);
  body.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '16px' } },
    h('span', {}, `Scene ${scenes[0].order ?? 1}`),
    h('span', {}, `Scene ${scenes[scenes.length - 1].order ?? scenes.length}`),
  ));
  body.appendChild(panels);

  paintScrub(caption, panels, scenes, idx);
}

/** Update just the caption + panels for a scene index (no slider rebuild). */
function paintScrub(caption, panels, scenes, idx) {
  const i = Math.max(0, Math.min(idx, scenes.length - 1));
  const scene = scenes[i];
  const world = worldStateAtScene(scene.id);
  const factionById = new Map(world.factions.map((f) => [f.id, f]));
  caption.textContent = `Scene ${scene.order ?? i + 1}: ${scene.title || 'Untitled'}`;
  panels.innerHTML = '';
  fillScrubPanels(panels, world, factionById);
}

function fillScrubPanels(panels, world, factionById) {
  // Faction power bars at this scene.
  const powerEntries = Object.entries(world.power).sort((a, b) => b[1] - a[1]);
  const maxPower = Math.max(1, ...powerEntries.map(([, v]) => v));
  panels.appendChild(h('div', { class: 'intel-section' },
    h('div', { class: 'intel-section__title' }, '⚖️ Faction Power'),
    ...powerEntries.map(([fid, val]) => {
      const f = factionById.get(fid);
      const pct = Math.round((val / maxPower) * 100);
      return h('div', { style: { marginBottom: '8px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' } },
          h('span', { style: { color: 'var(--text-secondary)' } }, f ? f.name : fid),
          h('span', { style: { fontWeight: '700', color: 'var(--text-primary)' } }, String(val)),
        ),
        h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${pct}%`, background: (f && f.color) || CHART_PALETTE[0] } })),
      );
    }),
  ));

  // Piece momentum at this scene.
  panels.appendChild(h('div', { class: 'intel-section' },
    h('div', { class: 'intel-section__title' }, '🎭 Characters'),
    ...world.pieceStates.map(({ piece, state }) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' } },
      h('span', {}, state.momentum === 'rising' ? '📈' : state.momentum === 'falling' ? '📉' : '➡️'),
      h('span', { style: { flex: '1', color: 'var(--text-secondary)' } }, piece.name),
      h('span', { style: { color: 'var(--text-muted)', fontSize: '11px' } }, `${Object.values(state.resources || {}).reduce((s, v) => s + (Number(v) || 0), 0)} pts`),
    )),
  ));

  // Relationship values at this scene (top by intensity).
  const rels = world.relStates
    .map((rs) => ({ ...rs, intensity: Object.values(rs.dims || {}).reduce((s, v) => s + Math.abs(Number(v) || 0), 0) }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 8);
  const pieceName = new Map(world.pieces.map((p) => [p.id, p.name]));
  if (rels.length) {
    panels.appendChild(h('div', { class: 'intel-section', style: { gridColumn: '1 / -1' } },
      h('div', { class: 'intel-section__title' }, '💫 Relationships at this moment'),
      ...rels.map((rs) => {
        const a = pieceName.get(rs.rel.sourceId) || rs.rel.sourceId;
        const b = pieceName.get(rs.rel.targetId) || rs.rel.targetId;
        const top = Object.entries(rs.dims || {}).sort((x, y) => (y[1] || 0) - (x[1] || 0)).slice(0, 3);
        return h('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' } },
          h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' } }, `${a} ↔ ${b}`),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            ...top.map(([dim, val]) => {
              const meta = RELATIONSHIP_DIMENSIONS[dim];
              return h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: (meta ? meta.color : '#6366f1') + '22', color: meta ? meta.color : 'var(--text-secondary)' } },
                `${meta ? meta.icon : ''} ${dim} ${val}`);
            }),
          ),
        );
      }),
    ));
  }
}

// ─── #4 Faction Power Chart ──────────────────────────────────────────────────

function renderPowerChart(body, scenes) {
  const { labels, series } = factionPowerSeries(liveScenes(), livePieces(), liveFactions());
  if (series.length === 0) {
    body.appendChild(emptyNote('Add factions and board pieces to chart power over time.'));
    return;
  }
  body.appendChild(h('div', { class: 'intel-section' },
    h('div', { class: 'intel-section__title' }, '⚖️ Faction Power Over Time'),
    h('p', { style: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'Each band is a faction\'s total resource power, stacked. Watch who rises and falls across the story.'),
    stackedAreaChart({ labels, series }),
    chartLegend(series),
  ));
}

// ─── #3 Tension & Pacing ─────────────────────────────────────────────────────

function renderTension(body, scenes) {
  const { scores } = tensionSeries(liveScenes());
  const labels = scenes.map((s) => `S${s.order ?? ''}`);
  const flats = flatStretches(scores, 30, 3);

  const colors = scores.map((v) => v >= 70 ? '#ef4444' : v >= 40 ? '#f59e0b' : '#64748b');

  body.appendChild(h('div', { class: 'intel-section' },
    h('div', { class: 'intel-section__title' }, '🎢 Dramatic Tension by Scene'),
    h('p', { style: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' } }, 'Derived from power swings, participant count, and conflict type per scene. Click a bar to jump to that scene on the Strategic Board.'),
    barChart({
      labels, values: scores, colors,
      // Jump to the board with the clicked scene pre-selected.
      onBar: (i) => { const sc = scenes[i]; appStore.setState({ activeModule: 'conflict-board', selectedSceneId: sc ? sc.id : null }); },
    }),
  ));

  // Pacing warnings.
  const warnings = h('div', { class: 'intel-section' }, h('div', { class: 'intel-section__title' }, '⚠️ Pacing Notes'));
  if (flats.length === 0) {
    warnings.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--success)' } }, '✅ No prolonged low-tension stretches detected.'));
  } else {
    flats.forEach((f) => {
      const from = scenes[f.start], to = scenes[f.end];
      warnings.appendChild(h('div', { class: 'ai-suggestion' },
        h('span', { class: 'ai-suggestion__icon' }, '😴'), ' ',
        `Low tension across scenes ${from.order ?? f.start + 1}–${to.order ?? f.end + 1} (${f.end - f.start + 1} scenes). Consider raising stakes, adding a complication, or cutting a scene.`,
      ));
    });
  }
  // Peak + trough callouts.
  if (scores.length) {
    const peakIdx = scores.indexOf(Math.max(...scores));
    const troughIdx = scores.indexOf(Math.min(...scores));
    warnings.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' } },
      `Climax so far: Scene ${scenes[peakIdx].order ?? peakIdx + 1} — "${scenes[peakIdx].title || 'Untitled'}". `,
      `Quietest: Scene ${scenes[troughIdx].order ?? troughIdx + 1}.`,
    ));
  }
  body.appendChild(warnings);
}

function emptyNote(text) {
  return h('div', { style: { fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' } }, text);
}
