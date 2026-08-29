/**
 * LoreForge Planner - Interactive World Map (#22)
 *
 * Renders locations as pins on a canvas (inline SVG — no chart library), colored
 * by controlling faction, and animates territory control over time using a
 * scrubber driven by the board scenes' powerShifts. Dragging a pin persists a
 * custom { mapX, mapY } so authors can lay out their world; positions are
 * otherwise derived deterministically from each location's id.
 */

import { h, createSVGElement } from '../core/renderer.js';
import { list, upsert, Collections } from '../core/repo.js';
import { placePins, territoryOverTime } from '../core/map-model.js';

const W = 900;
const H = 520;

let timeIndex = null; // null = latest

export function renderWorldMap(container) {
  const root = h('div', { style: { padding: '16px', height: '100%', overflowY: 'auto' } });
  rebuild(root);
  container.appendChild(root);
}

function rebuild(root) {
  root.innerHTML = '';

  const locations = list(Collections.LOCATIONS);
  const factions = list(Collections.BOARD_FACTIONS);
  const scenes = list(Collections.SCENES);

  const timeline = territoryOverTime(scenes, factions);
  if (timeIndex === null || timeIndex > timeline.steps.length - 1) timeIndex = timeline.steps.length - 1;
  const step = timeline.steps[timeIndex] || timeline.steps[timeline.steps.length - 1] || { share: {}, title: '', order: 0 };

  root.appendChild(
    h('div', { style: { marginBottom: '12px' } },
      h('h1', { style: { fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' } }, '🗺️ Interactive Map'),
      h('p', { style: { fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' } },
        'Locations pinned by controlling faction. Drag a pin to reposition it. Scrub the timeline to watch territory shift.'),
    ),
  );

  if (locations.length === 0) {
    root.appendChild(emptyState());
    return;
  }

  root.appendChild(buildMapSvg(locations, factions, root));

  // Territory control bar for the selected point in time.
  if (timeline.factions.length && scenes.length) {
    root.appendChild(controlSection(timeline, step));
    root.appendChild(scrubber(timeline, root));
  }

  root.appendChild(legend(factions));
}

// ─── SVG map ─────────────────────────────────────────────────────────────────

function buildMapSvg(locations, factions, root) {
  const pins = placePins(locations, factions);
  const svg = createSVGElement('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    style: 'background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:12px;display:block;',
    preserveAspectRatio: 'xMidYMid meet',
  });

  // Faint grid so the space reads as a map.
  for (let gx = 1; gx < 10; gx++) {
    svg.appendChild(createSVGElement('line', { x1: (gx / 10) * W, y1: 0, x2: (gx / 10) * W, y2: H, stroke: 'var(--border-subtle)', 'stroke-width': 1 }));
  }
  for (let gy = 1; gy < 6; gy++) {
    svg.appendChild(createSVGElement('line', { x1: 0, y1: (gy / 6) * H, x2: W, y2: (gy / 6) * H, stroke: 'var(--border-subtle)', 'stroke-width': 1 }));
  }

  // Territory "auras": a soft convex-ish hull approximation drawn as translucent
  // circles behind each faction's pins conveys rough control zones cheaply.
  const byFaction = new Map();
  pins.forEach((p) => {
    if (!p.factionId) return;
    if (!byFaction.has(p.factionId)) byFaction.set(p.factionId, { color: p.color, pts: [] });
    byFaction.get(p.factionId).pts.push(p);
  });
  byFaction.forEach(({ color, pts }) => {
    pts.forEach((p) => {
      svg.appendChild(createSVGElement('circle', {
        cx: p.x * W, cy: p.y * H, r: 46, fill: color, opacity: 0.10,
      }));
    });
  });

  // Pins (draggable).
  pins.forEach((p) => {
    const g = createSVGElement('g', { style: 'cursor:grab;' });
    const cx = p.x * W;
    const cy = p.y * H;
    const dot = createSVGElement('circle', { cx, cy, r: 8, fill: p.color, stroke: 'var(--bg-primary)', 'stroke-width': 2 });
    const label = createSVGElement('text', {
      x: cx + 12, y: cy + 4, fill: 'var(--text-secondary)', 'font-size': 12, 'font-family': 'var(--font-ui)',
    });
    label.textContent = p.name;
    g.appendChild(dot);
    g.appendChild(label);
    attachDrag(g, dot, label, svg, p, root);
    svg.appendChild(g);
  });

  const wrap = h('div', { style: { marginBottom: '14px' } });
  wrap.appendChild(svg);
  return wrap;
}

/** Pointer-drag a pin and persist its normalized position on release. */
function attachDrag(g, dot, label, svg, pin, root) {
  let dragging = false;

  const toNorm = (evt) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (evt.clientX - rect.left) / rect.width;
    const y = (evt.clientY - rect.top) / rect.height;
    return { x: Math.max(0.02, Math.min(0.98, x)), y: Math.max(0.02, Math.min(0.98, y)) };
  };

  const onMove = (evt) => {
    if (!dragging) return;
    const n = toNorm(evt);
    if (!n) return;
    dot.setAttribute('cx', n.x * W);
    dot.setAttribute('cy', n.y * H);
    label.setAttribute('x', n.x * W + 12);
    label.setAttribute('y', n.y * H + 4);
    pin._nx = n.x;
    pin._ny = n.y;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    g.style.cursor = 'grab';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (Number.isFinite(pin._nx) && Number.isFinite(pin._ny)) {
      // Persist the manual placement so it survives reloads and re-renders.
      upsert(Collections.LOCATIONS, { id: pin.id, mapX: pin._nx, mapY: pin._ny });
    }
  };

  g.addEventListener('pointerdown', (evt) => {
    dragging = true;
    g.style.cursor = 'grabbing';
    evt.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// ─── Territory control over time ─────────────────────────────────────────────

function controlSection(timeline, step) {
  const rows = timeline.factions
    .map((f) => ({ ...f, pct: step.share[f.id] || 0 }))
    .sort((a, b) => b.pct - a.pct);

  return h('div', { style: { background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px', marginBottom: '10px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } },
      h('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }, title: 'Relative share of faction power, folded from scene power shifts — not literal map area.' }, 'Relative power share'),
      h('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, step.order === 0 ? 'At start' : `After: ${step.title}`),
    ),
    // Stacked control bar.
    h('div', { style: { display: 'flex', height: '22px', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' } },
      ...rows.filter((r) => r.pct > 0).map((r) =>
        h('div', { title: `${r.name}: ${r.pct}%`, style: { width: `${r.pct}%`, background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: '600' } }, r.pct > 8 ? `${r.pct}%` : ''),
      ),
    ),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } },
      ...rows.map((r) => h('span', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' } },
        h('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: r.color } }),
        `${r.name} ${r.pct}%`)),
    ),
  );
}

function scrubber(timeline, root) {
  const maxIdx = timeline.steps.length - 1;
  const wrap = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' } });
  const slider = h('input', {
    type: 'range', min: '0', max: String(maxIdx), value: String(timeIndex), step: '1',
    style: { flex: '1' },
    oninput: (e) => { timeIndex = parseInt(e.target.value, 10); rebuild(root); },
  });
  const cur = timeline.steps[timeIndex] || {};
  // Index 0 is the synthetic "Start" state (before any scene resolves).
  const posLabel = timeIndex === 0 ? 'Start' : `Scene ${timeIndex}/${maxIdx}`;
  wrap.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--text-muted)', width: '70px' } }, posLabel));
  wrap.appendChild(slider);
  wrap.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, cur.title || ''));
  return wrap;
}

function legend(factions) {
  const items = factions.filter((f) => f && f.id);
  return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' } },
    ...items.map((f) => h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
      h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: f.color || '#6366f1' } }),
      f.name)),
    h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
      h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: '#6b5c48' } }),
      'Neutral / unaligned'),
  );
}

function emptyState() {
  return h('div', { style: { textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' } },
    h('div', { style: { fontSize: '40px', marginBottom: '12px', opacity: '0.5' } }, '🗺️'),
    h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' } }, 'No locations yet'),
    h('div', { style: { fontSize: '13px' } }, 'Add locations in the Locations module to place them on the map.'),
  );
}
