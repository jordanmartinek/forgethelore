/**
 * LoreForge Planner - Timeline Planner
 * Multi-layer interactive timeline
 */

import { h } from '../core/renderer.js';

const timelineTracks = [
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
    { id: 'e9', label: 'Senate Dissolution', start: 80, duration: 3 },
  ]},
  { id: 't4', name: 'Technology', color: '#22c55e', events: [
    { id: 'e10', label: 'FTL Drive Invented', start: 5, duration: 3 },
    { id: 'e11', label: 'Void Energy Harnessed', start: 35, duration: 8 },
    { id: 'e12', label: 'Synthetic Consciousness', start: 42, duration: 6 },
  ]},
  { id: 't5', name: 'Character Arcs', color: '#a855f7', events: [
    { id: 'e13', label: 'Aurelian Rises to Power', start: 40, duration: 15 },
    { id: 'e14', label: 'Sera Defects from Dominion', start: 60, duration: 5 },
    { id: 'e15', label: 'Dr. Voss Breakthrough', start: 75, duration: 8 },
  ]},
  { id: 't6', name: 'Mysteries', color: '#ec4899', events: [
    { id: 'e16', label: 'Conduit Origin Unknown', start: 10, duration: 85 },
    { id: 'e17', label: 'Colony Theta-9 Disappears', start: 55, duration: 20 },
    { id: 'e18', label: 'Aurelian Hidden Agenda', start: 40, duration: 50 },
  ]},
];

const zoomLevels = ['Century', 'Decade', 'Year', 'Month', 'Day'];
let currentZoom = 1;

export function renderTimeline(container) {
  const timeline = h('div', { class: 'timeline' },
    renderTimelineControls(),
    renderTimelineCanvas()
  );
  container.appendChild(timeline);
  updateTimelineSidebar();
}


function renderTimelineControls() {
  return h('div', { class: 'timeline__controls' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      h('span', { style: { fontSize: '13px', fontWeight: '600' } }, '⏳ Timeline'),
      h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `${timelineTracks.reduce((a, t) => a + t.events.length, 0)} events across ${timelineTracks.length} tracks`),
    ),
    h('div', { class: 'timeline__zoom-controls' },
      ...zoomLevels.map((level, i) => 
        h('button', { 
          class: `timeline__zoom-btn ${i === currentZoom ? 'timeline__zoom-btn--active' : ''}`,
          onclick: (e) => {
            currentZoom = i;
            document.querySelectorAll('.timeline__zoom-btn').forEach(b => b.classList.remove('timeline__zoom-btn--active'));
            e.target.classList.add('timeline__zoom-btn--active');
          }
        }, level)
      )
    ),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'btn btn--sm btn--ghost' }, '+ Add Event'),
      h('button', { class: 'btn btn--sm btn--ghost' }, '+ Add Track'),
    ),
  );
}

function renderTimelineCanvas() {
  const canvas = h('div', { class: 'timeline__canvas' });
  
  // Time markers (top ruler)
  const ruler = h('div', { style: { 
    position: 'sticky', top: '0', left: '0', right: '0', 
    height: '30px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)',
    display: 'flex', alignItems: 'flex-end', paddingLeft: '150px', zIndex: '3'
  }});
  
  for (let i = 0; i <= 10; i++) {
    ruler.appendChild(h('div', { style: { 
      position: 'absolute', left: `${150 + i * 100}px`, bottom: '4px',
      fontSize: '9px', color: 'var(--text-muted)', transform: 'translateX(-50%)'
    }}, `${i * 10}%`));
    ruler.appendChild(h('div', { style: { 
      position: 'absolute', left: `${150 + i * 100}px`, bottom: '0',
      width: '1px', height: '8px', background: 'var(--border-subtle)'
    }}));
  }
  
  canvas.appendChild(ruler);
  
  // Tracks
  timelineTracks.forEach(track => {
    const trackEl = h('div', { class: 'timeline__track' },
      h('div', { class: 'timeline__track-label' },
        h('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: track.color, marginRight: '6px' } }),
        track.name
      ),
    );
    
    // Events
    track.events.forEach(event => {
      trackEl.appendChild(h('div', { 
        class: 'timeline__event',
        style: { 
          left: `${150 + event.start * 10}px`, 
          width: `${event.duration * 10}px`,
          background: track.color,
        },
        title: event.label,
      }, event.label));
    });
    
    canvas.appendChild(trackEl);
  });
  
  // Playhead
  canvas.appendChild(h('div', { style: { 
    position: 'absolute', left: '650px', top: '0', bottom: '0',
    width: '2px', background: 'var(--accent-primary)', zIndex: '4',
    boxShadow: '0 0 8px rgba(99,102,241,0.5)',
  }}));
  
  return canvas;
}

function updateTimelineSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  
  timelineTracks.forEach(track => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, track.name));
    
    track.events.forEach(event => {
      sidebar.appendChild(
        h('div', { class: 'sidebar-item' },
          h('span', { class: 'sidebar-item__icon', style: { width: '8px', height: '8px', borderRadius: '50%', background: track.color } }),
          h('span', { class: 'sidebar-item__label' }, event.label),
        )
      );
    });
  });
}
