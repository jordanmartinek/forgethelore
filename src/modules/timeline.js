/**
 * LoreForge Planner - Timeline Planner (Gantt / Era View, #23)
 *
 * A multi-track Gantt timeline with:
 *   - real data where it exists: a "Scenes" track built from the Strategic
 *     Board's scenes (positioned by their order), plus persisted era/event
 *     tracks the user can edit.
 *   - FUNCTIONAL zoom (pixels-per-unit actually scales the canvas).
 *   - persistence via the repo (loreforge_{project}_timelineTracks).
 *
 * Falls back to demo era tracks only for the demo project so a fresh project
 * starts clean.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';
import { getActiveProjectId } from '../core/persist.js';
import { showModal, formField } from '../ui/modal.js';
import { orderedScenes } from '../core/timeline-state.js';

const DEMO_TRACKS = [
  { id: 't1', name: 'Historical Events', color: '#6366f1', events: [
    { id: 'e1', label: 'First Void Conduit Discovered', start: 10, duration: 5 },
    { id: 'e2', label: 'Dominion Founded', start: 25, duration: 8 },
    { id: 'e3', label: 'AI Awakening', start: 45, duration: 10 },
  ]},
  { id: 't2', name: 'Wars & Conflicts', color: '#ef4444', events: [
    { id: 'e4', label: 'First Contact War', start: 20, duration: 15 },
    { id: 'e5', label: 'Machine Rebellion', start: 50, duration: 12 },
    { id: 'e6', label: 'Swarm Invasion', start: 70, duration: 25 },
  ]},
  { id: 't3', name: 'Politics', color: '#f59e0b', events: [
    { id: 'e7', label: 'Colonial Independence', start: 30, duration: 10 },
    { id: 'e8', label: 'Dominion Expansion Act', start: 55, duration: 5 },
  ]},
  { id: 't4', name: 'Technology', color: '#22c55e', events: [
    { id: 'e10', label: 'FTL Drive Invented', start: 5, duration: 3 },
    { id: 'e11', label: 'Void Energy Harnessed', start: 35, duration: 8 },
  ]},
];

// User-editable era/event tracks (persisted). Scenes are a derived track.
let tracks = [];
function loadTracks() {
  const saved = repo.readObject('timelineTracks', null);
  if (Array.isArray(saved)) tracks = saved;
  else if (getActiveProjectId() === 'proj1') tracks = JSON.parse(JSON.stringify(DEMO_TRACKS));
  else tracks = [];
}
function saveTracks() { repo.write('timelineTracks', tracks); }

// Zoom = pixels per 1% of timeline width. Higher = more zoomed in.
const ZOOM_LEVELS = [
  { label: 'Fit', pxPerUnit: 6 },
  { label: '1×', pxPerUnit: 10 },
  { label: '2×', pxPerUnit: 20 },
  { label: '4×', pxPerUnit: 40 },
];
let zoomIdx = 1;
const LABEL_W = 150;

/** Build the derived "Scenes" track from the board's scenes. */
function sceneTrack() {
  const scenes = orderedScenes(repo.list(Collections.SCENES));
  if (scenes.length === 0) return null;
  const n = scenes.length;
  // Spread scenes evenly across 0..100 by their order.
  return {
    id: '__scenes', name: 'Scenes (Board)', color: '#8b5cf6', derived: true,
    events: scenes.map((s, i) => ({
      id: s.id, label: s.title || `Scene ${s.order ?? i + 1}`,
      start: Math.round((i / Math.max(1, n)) * 96),
      duration: Math.max(3, Math.round(96 / n)),
    })),
  };
}

export function renderTimeline(container) {
  loadTracks();
  const timeline = h('div', { class: 'timeline' },
    renderControls(container),
    renderCanvas(),
  );
  container.appendChild(timeline);
  updateSidebar();
}

function rerender(container) {
  renderPreservingScroll(container, () => { container.innerHTML = ''; renderTimeline(container); });
}

function allTracks() {
  const s = sceneTrack();
  return s ? [s, ...tracks] : [...tracks];
}

function renderControls(container) {
  const total = allTracks().reduce((a, t) => a + t.events.length, 0);
  return h('div', { class: 'timeline__controls' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      h('span', { style: { fontSize: '13px', fontWeight: '600' } }, '⏳ Timeline'),
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${total} events across ${allTracks().length} tracks`),
    ),
    h('div', { class: 'timeline__zoom-controls' },
      ...ZOOM_LEVELS.map((z, i) =>
        h('button', {
          class: `timeline__zoom-btn ${i === zoomIdx ? 'timeline__zoom-btn--active' : ''}`,
          onclick: () => { zoomIdx = i; rerender(container); },
        }, z.label)
      )
    ),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'btn btn--sm btn--ghost', onclick: () => openTrackModal(container) }, '+ Add Track'),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: () => openEventModal(container) }, '+ Add Event'),
    ),
  );
}

function renderCanvas() {
  const px = ZOOM_LEVELS[zoomIdx].pxPerUnit;
  const contentW = LABEL_W + 100 * px;
  const canvas = h('div', { class: 'timeline__canvas', style: { minWidth: `${contentW}px` } });

  // Ruler
  const ruler = h('div', { style: {
    position: 'sticky', top: '0', height: '30px', background: 'var(--surface-1)',
    borderBottom: '1px solid var(--border-subtle)', paddingLeft: `${LABEL_W}px`, zIndex: '3',
  }});
  for (let i = 0; i <= 10; i++) {
    ruler.appendChild(h('div', { style: { position: 'absolute', left: `${LABEL_W + i * 10 * px}px`, bottom: '4px', fontSize: '9px', color: 'var(--text-muted)', transform: 'translateX(-50%)' } }, `${i * 10}%`));
    ruler.appendChild(h('div', { style: { position: 'absolute', left: `${LABEL_W + i * 10 * px}px`, bottom: '0', width: '1px', height: '8px', background: 'var(--border-subtle)' } }));
  }
  canvas.appendChild(ruler);

  allTracks().forEach((track) => {
    const trackEl = h('div', { class: 'timeline__track' },
      h('div', { class: 'timeline__track-label' },
        h('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: track.color, marginRight: '6px' } }),
        track.name,
      ),
    );
    track.events.forEach((event) => {
      const bar = h('div', {
        class: 'timeline__event',
        style: { left: `${LABEL_W + event.start * px}px`, width: `${Math.max(8, event.duration * px)}px`, background: track.color },
        title: `${event.label}${track.derived ? '' : ' (click to edit)'}`,
      }, event.label);
      if (!track.derived) bar.addEventListener('click', () => openEventModal(document.querySelector('.main-content'), track, event));
      trackEl.appendChild(bar);
    });
    canvas.appendChild(trackEl);
  });

  return canvas;
}

// ─── Editing ─────────────────────────────────────────────────────────────────

function openTrackModal(container) {
  const state = { name: '', color: '#6366f1' };
  const COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];
  const content = h('div', {},
    formField('Track name', h('input', { class: 'input', placeholder: 'e.g. Religious Events', oninput: (e) => state.name = e.target.value })),
    formField('Color', h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      ...COLORS.map((c) => h('button', { type: 'button', style: { width: '24px', height: '24px', borderRadius: '50%', background: c, border: c === state.color ? '2px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }, onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid var(--text-primary)'; } })),
    )),
  );
  showModal('Add Timeline Track', content, () => {
    if (!state.name.trim()) return;
    tracks.push({ id: `t_${Date.now()}`, name: state.name.trim(), color: state.color, events: [] });
    saveTracks();
    rerender(container);
  });
}

function openEventModal(container, existingTrack, existingEvent) {
  const editable = tracks.filter((t) => !t.derived);
  if (editable.length === 0) { openTrackModal(container); return; }
  const state = {
    trackId: existingTrack ? existingTrack.id : editable[0].id,
    label: existingEvent ? existingEvent.label : '',
    start: existingEvent ? existingEvent.start : 10,
    duration: existingEvent ? existingEvent.duration : 10,
  };
  const content = h('div', {},
    formField('Track', h('select', { class: 'input', onchange: (e) => state.trackId = e.target.value },
      ...editable.map((t) => h('option', { value: t.id, ...(t.id === state.trackId ? { selected: 'selected' } : {}) }, t.name)))),
    formField('Event label', h('input', { class: 'input', value: state.label, placeholder: 'e.g. The Great Schism', oninput: (e) => state.label = e.target.value })),
    formField('Start (0–100%)', h('input', { class: 'input', type: 'number', min: '0', max: '100', value: String(state.start), oninput: (e) => state.start = Number(e.target.value) })),
    formField('Duration (%)', h('input', { class: 'input', type: 'number', min: '1', max: '100', value: String(state.duration), oninput: (e) => state.duration = Number(e.target.value) })),
  );
  const onSave = () => {
    if (!state.label.trim()) return;
    const track = tracks.find((t) => t.id === state.trackId);
    if (!track) return;
    if (existingEvent) {
      Object.assign(existingEvent, { label: state.label.trim(), start: state.start, duration: state.duration });
      // If the track changed, move the event.
      if (existingTrack && existingTrack.id !== state.trackId) {
        existingTrack.events = existingTrack.events.filter((e) => e !== existingEvent);
        track.events.push(existingEvent);
      }
    } else {
      track.events.push({ id: `e_${Date.now()}`, label: state.label.trim(), start: state.start, duration: state.duration });
    }
    saveTracks();
    rerender(container);
  };
  showModal(existingEvent ? 'Edit Event' : 'Add Timeline Event', content, onSave);
}

function updateSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  allTracks().forEach((track) => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, track.name));
    track.events.forEach((event) => {
      sidebar.appendChild(h('div', { class: 'sidebar-item' },
        h('span', { class: 'sidebar-item__icon', style: { width: '8px', height: '8px', borderRadius: '50%', background: track.color } }),
        h('span', { class: 'sidebar-item__label' }, event.label),
      ));
    });
  });
}
