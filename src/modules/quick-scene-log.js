/**
 * LoreForge Planner - Quick Scene Log
 * A fast "I just wrote a scene" form.
 * Captures what happened, who was involved, who won/lost,
 * and relationship changes — all in under 30 seconds.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import { propagateSceneOutcome, relationships, characterArcs, createRelationship } from '../core/progression.js';

function getPieces() { return window.__loreforge_pieces || []; }
function getScenes() { return window.__loreforge_scenes || []; }
function getFactions() { return window.__loreforge_factions || []; }

export function renderQuickSceneLog(container) {
  const wrapper = h('div', { style: { width: '100%', height: '100%', overflowY: 'auto', padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' } });

  const form = h('div', { style: { width: '100%', maxWidth: '680px' } },
    // Header
    h('div', { style: { marginBottom: '32px' } },
      h('h2', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, '⚡ Quick Scene Log'),
      h('p', { style: { fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' } }, 'Just finished writing? Log what happened in 30 seconds. LoreForge will auto-update character stats, momentum, and relationships.'),
    ),

    renderSceneForm()
  );

  wrapper.appendChild(form);
  container.appendChild(wrapper);
  updateQuickLogSidebar();
}

function renderSceneForm() {
  const pieces = getPieces();
  const factions = getFactions();
  const scenes = getScenes();

  // State
  const state = {
    title: '',
    summary: '',
    location: '',
    participants: [],
    winners: [],
    losers: [],
    conflictType: 'opposition',
    relChanges: [],
  };

  // ─── Step 1: What Happened ───────────────────────────────────────────────

  const step1 = h('div', { style: { marginBottom: '28px', padding: '20px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)' } },
    h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-primary)', marginBottom: '12px' } }, '① What Happened?'),
    h('div', { style: { marginBottom: '12px' } },
      h('input', { class: 'input', placeholder: 'Scene title (e.g. "The Betrayal at Nexus Hub")', style: { fontSize: '14px', fontWeight: '500' }, oninput: (e) => state.title = e.target.value }),
    ),
    h('div', { style: { marginBottom: '12px' } },
      h('textarea', { class: 'input', placeholder: 'One-sentence summary of what happened...', style: { minHeight: '60px', fontSize: '13px' }, oninput: (e) => state.summary = e.target.value }),
    ),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
      h('div', {},
        h('label', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' } }, 'Location'),
        h('input', { class: 'input', placeholder: 'Where?', oninput: (e) => state.location = e.target.value }),
      ),
      h('div', {},
        h('label', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' } }, 'Conflict Type'),
        h('select', { class: 'input', onchange: (e) => state.conflictType = e.target.value },
          ...['opposition', 'alliance', 'manipulation', 'competition', 'escalation', 'support', 'discovery', 'betrayal', 'escape', 'negotiation'].map(t => h('option', { value: t }, t.charAt(0).toUpperCase() + t.slice(1)))
        ),
      ),
    ),
  );

  // ─── Step 2: Who Was Involved ────────────────────────────────────────────

  const step2 = h('div', { style: { marginBottom: '28px', padding: '20px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)' } },
    h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-primary)', marginBottom: '12px' } }, '② Who Was Involved?'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' } },
      ...pieces.map(p => {
        const f = factions.find(ff => ff.id === p.faction);
        return h('label', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', fontSize: '12px', transition: 'all 0.1s ease' },
        },
          h('input', { type: 'checkbox', onchange: (e) => {
            if (e.target.checked) state.participants.push(p.id);
            else state.participants = state.participants.filter(id => id !== p.id);
            e.target.closest('label').style.borderColor = e.target.checked ? 'var(--accent-primary)' : 'var(--border-subtle)';
            e.target.closest('label').style.background = e.target.checked ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)';
          }}),
          h('span', { style: { color: f ? f.color : '#666', fontSize: '14px' } }, '●'),
          h('span', { style: { color: 'var(--text-primary)' } }, p.name),
        );
      })
    ),
  );

  // ─── Step 3: Who Won / Who Lost ──────────────────────────────────────────

  const step3 = h('div', { style: { marginBottom: '28px', padding: '20px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)' } },
    h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-primary)', marginBottom: '12px' } }, '③ Who Won / Who Lost?'),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
      // Winners
      h('div', {},
        h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--success)', marginBottom: '8px' } }, '▲ Winners / Gained Power'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          ...pieces.map(p => h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px' } },
            h('input', { type: 'checkbox', onchange: (e) => {
              if (e.target.checked) state.winners.push(p.id);
              else state.winners = state.winners.filter(id => id !== p.id);
            }}),
            h('span', {}, p.name),
          ))
        ),
      ),
      // Losers
      h('div', {},
        h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--danger)', marginBottom: '8px' } }, '▼ Losers / Lost Power'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          ...pieces.map(p => h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px' } },
            h('input', { type: 'checkbox', onchange: (e) => {
              if (e.target.checked) state.losers.push(p.id);
              else state.losers = state.losers.filter(id => id !== p.id);
            }}),
            h('span', {}, p.name),
          ))
        ),
      ),
    ),
  );

  // ─── Step 4: Relationship Changes (optional) ─────────────────────────────

  const relContainer = h('div', { id: 'rel-changes-list' });

  const step4 = h('div', { style: { marginBottom: '28px', padding: '20px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)' } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
      h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-primary)' } }, '④ Relationship Changes (Optional)'),
      h('button', { class: 'btn btn--sm btn--ghost', onclick: () => addRelChange(relContainer, state, pieces) }, '+ Add Change'),
    ),
    h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' } }, 'Did trust break? Did a new alliance form? Did someone betray someone?'),
    relContainer,
  );

  // ─── Submit ──────────────────────────────────────────────────────────────

  const submitBtn = h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
    h('button', { class: 'btn btn--primary', style: { padding: '10px 24px', fontSize: '14px' }, onclick: () => submitSceneLog(state) }, '⚡ Log Scene & Update Universe'),
  );

  return h('div', {}, step1, step2, step3, step4, submitBtn);
}

// ─── Relationship Change Widget ──────────────────────────────────────────────

function addRelChange(container, state, pieces) {
  const change = { charA: pieces[0]?.id || '', charB: pieces[1]?.id || '', dimension: 'trust', delta: 0, note: '' };
  state.relChanges.push(change);

  const row = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: '6px', alignItems: 'center', marginBottom: '8px', padding: '8px', background: 'var(--surface-2)', borderRadius: '6px' } },
    h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 6px' }, onchange: (e) => change.charA = e.target.value },
      ...pieces.map(p => h('option', { value: p.id }, p.name))
    ),
    h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 6px' }, onchange: (e) => change.charB = e.target.value },
      ...pieces.map((p, i) => h('option', { value: p.id, ...(i === 1 ? { selected: 'selected' } : {}) }, p.name))
    ),
    h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 6px', width: '80px' }, onchange: (e) => change.dimension = e.target.value },
      ...['trust', 'fear', 'respect', 'affection', 'rivalry', 'dependence'].map(d => h('option', { value: d }, d))
    ),
    h('input', { type: 'number', class: 'input', style: { width: '60px', fontSize: '11px', padding: '4px 6px' }, placeholder: '±', oninput: (e) => change.delta = parseInt(e.target.value) || 0 }),
    h('button', { class: 'btn btn--ghost btn--sm', style: { color: 'var(--danger)' }, onclick: () => {
      const idx = state.relChanges.indexOf(change);
      if (idx !== -1) state.relChanges.splice(idx, 1);
      row.remove();
    }}, '✕'),
  );

  container.appendChild(row);
}

// ─── Submit Handler ──────────────────────────────────────────────────────────

function submitSceneLog(state) {
  if (!state.title.trim()) {
    alert('Please enter a scene title.');
    return;
  }

  const pieces = getPieces();
  const scenes = getScenes();
  const factions = getFactions();

  // Build power shift from winners/losers
  const powerShift = {};
  state.winners.forEach(pid => {
    const piece = pieces.find(p => p.id === pid);
    if (piece) powerShift[piece.faction] = (powerShift[piece.faction] || 0) + 10;
  });
  state.losers.forEach(pid => {
    const piece = pieces.find(p => p.id === pid);
    if (piece) powerShift[piece.faction] = (powerShift[piece.faction] || 0) - 10;
  });

  // Create scene
  const newScene = {
    id: generateId(),
    title: state.title,
    order: scenes.length + 1,
    location: state.location,
    summary: state.summary,
    participants: [...state.participants],
    conflictType: state.conflictType,
    outcome: state.winners.length > 0 ? `${state.winners.map(id => pieces.find(p => p.id === id)?.name).filter(Boolean).join(', ')} gained advantage` : '',
    powerShift,
    status: 'completed',
  };
  scenes.push(newScene);

  // Propagate power shifts to character stats
  propagateSceneOutcome(newScene, pieces);

  // Update winners momentum
  state.winners.forEach(pid => {
    const piece = pieces.find(p => p.id === pid);
    if (piece) piece.momentum = 'rising';
  });

  // Update losers momentum
  state.losers.forEach(pid => {
    const piece = pieces.find(p => p.id === pid);
    if (piece) piece.momentum = 'falling';
  });

  // Apply relationship changes
  state.relChanges.forEach(change => {
    if (!change.charA || !change.charB || change.charA === change.charB || !change.delta) return;

    let rel = relationships.find(r =>
      (r.sourceId === change.charA && r.targetId === change.charB) ||
      (r.sourceId === change.charB && r.targetId === change.charA)
    );

    if (!rel) {
      rel = createRelationship(change.charA, change.charB);
    }

    // Apply the dimension change
    rel.dimensions[change.dimension] = Math.max(0, Math.min(100, (rel.dimensions[change.dimension] || 0) + change.delta));

    // Log to history
    rel.history.push({
      sceneId: newScene.id,
      event: `${state.title}: ${change.dimension} ${change.delta > 0 ? '+' : ''}${change.delta}`,
      changes: { [change.dimension]: change.delta },
    });

    // Auto-detect type changes
    if (rel.dimensions.trust < 15 && rel.dimensions.rivalry > 60) rel.type = 'opposition';
    else if (rel.dimensions.trust > 70 && rel.dimensions.affection > 50) rel.type = 'friendship';
    else if (rel.dimensions.rivalry > 70) rel.type = 'rivalry';
  });

  // Show success and re-render
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);

  const container = document.querySelector('.main-content');
  if (container) {
    container.innerHTML = '';
    renderQuickSceneLog(container);
    // Show success toast
    showSuccessMessage(container, newScene);
  }
}

function showSuccessMessage(container, scene) {
  const toast = h('div', { style: { position: 'fixed', top: '60px', right: '20px', padding: '16px 24px', background: 'var(--bg-elevated)', border: '1px solid var(--success)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', zIndex: '9999', animation: 'slideUp 0.3s ease', maxWidth: '320px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
      h('span', { style: { fontSize: '18px' } }, '✅'),
      h('span', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' } }, 'Scene Logged!'),
    ),
    h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' } },
      `"${scene.title}" has been recorded. Character stats, momentum, and relationships have been updated across the universe.`
    ),
  );
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function updateQuickLogSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const scenes = getScenes();
  const recentScenes = [...scenes].sort((a, b) => b.order - a.order).slice(0, 10);

  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Recent Scenes'));

  if (recentScenes.length === 0) {
    sidebar.appendChild(h('div', { style: { padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'No scenes logged yet'));
  } else {
    recentScenes.forEach(scene => {
      sidebar.appendChild(h('div', { class: 'sidebar-item' },
        h('span', { style: { fontSize: '10px', color: 'var(--text-muted)', minWidth: '20px' } }, `#${scene.order}`),
        h('span', { class: 'sidebar-item__label' }, scene.title),
      ));
    });
  }

  sidebar.appendChild(h('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '12px 0' } }));
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Quick Stats'));

  const pieces = getPieces();
  const rising = pieces.filter(p => p.momentum === 'rising').length;
  const falling = pieces.filter(p => p.momentum === 'falling').length;
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { style: { color: 'var(--success)' } }, '▲'), h('span', { class: 'sidebar-item__label' }, `${rising} characters rising`)));
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { style: { color: 'var(--danger)' } }, '▼'), h('span', { class: 'sidebar-item__label' }, `${falling} characters falling`)));
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', {}, '🔗'), h('span', { class: 'sidebar-item__label' }, `${relationships.length} relationships`)));
}
