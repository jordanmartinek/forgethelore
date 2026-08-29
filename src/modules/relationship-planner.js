/**
 * LoreForge Planner - Relationship Planner
 * View, create, and edit relationships between characters with history timeline.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import { relationships, RELATIONSHIP_TYPES, RELATIONSHIP_DIMENSIONS, getRelationshipsFor, createRelationship, saveProgressionData } from '../core/progression.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';
import { toastError } from '../ui/toast.js';

/** Reflect the real progression-data write result in the save indicator. */
function reportSave(ok) {
  appStore.setState(ok ? { saveStatus: 'saved', lastSaved: Date.now() } : { saveStatus: 'offline' });
  if (!ok) toastError('Could not save — storage may be full. Export your project to avoid losing work.');
}

// Reference to pieces from conflict board (shared data)
function getPieces() {
  // Import dynamically to avoid circular deps
  return window.__loreforge_pieces || [];
}

export function renderRelationshipPlanner(container) {
  const planner = h('div', { class: 'character-planner' },
    renderRelationshipList(),
    relationships.length > 0
      ? renderRelationshipDetail(relationships[0])
      : h("div", { class: "character-detail", style: { display: "flex", alignItems: "center", justifyContent: "center" } },
          h("div", { style: { textAlign: "center", color: "var(--text-muted)" } },
            h("div", { style: { fontSize: "48px", marginBottom: "16px", opacity: "0.5" } }, "💫"),
            h("div", { style: { fontSize: "16px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "8px" } }, "No Relationships Yet"),
            h("div", { style: { fontSize: "13px", marginBottom: "16px" } }, "Create your first entry to get started."),
            h("button", { class: "btn btn--primary", onclick: openAddRelationshipModal }, "+ New"),
          )
        )
  );
  container.appendChild(planner);
  updateRelationshipSidebar();
}

function renderRelationshipList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search relationships...', style: { fontSize: '12px' } }),
    ),
  );

  relationships.forEach(rel => {
    const source = getPieces().find(p => p.id === rel.sourceId);
    const target = getPieces().find(p => p.id === rel.targetId);
    const sourceName = source ? source.name : rel.sourceId;
    const targetName = target ? target.name : rel.targetId;
    const typeColor = getTypeColor(rel.type);

    list.appendChild(h('div', {
      class: 'character-card',
      onclick: (e) => {
        if (e.target.closest('.card-actions')) return;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderRelationshipDetailContent(rel)); }
      }
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: '1' } },
        h('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' } }, `${sourceName} ↔ ${targetName}`),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: typeColor } }),
          h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, rel.type),
          h('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `• ${rel.history.length} events`),
        ),
      ),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteRelationship(rel); } }, '🗑️'),
      ),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddRelationshipModal }, '+ New Relationship')
  ));

  return list;
}


function renderRelationshipDetail(rel) {
  return h('div', { class: 'character-detail' }, renderRelationshipDetailContent(rel));
}

function renderRelationshipDetailContent(rel) {
  const source = getPieces().find(p => p.id === rel.sourceId);
  const target = getPieces().find(p => p.id === rel.targetId);
  const sourceName = source ? source.name : rel.sourceId;
  const targetName = target ? target.name : rel.targetId;

  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' } }, source ? source.name[0] : '?'),
        h('div', { style: { fontSize: '20px', color: getTypeColor(rel.type) } }, '↔'),
        h('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' } }, target ? target.name[0] : '?'),
      ),
      h('div', {},
        h('h2', { style: { fontSize: '18px', fontWeight: '700', marginBottom: '2px' } }, `${sourceName} ↔ ${targetName}`),
        h('div', { style: { display: 'flex', gap: '6px' } },
          h('span', { class: 'tag', style: { background: getTypeColor(rel.type) + '30', color: getTypeColor(rel.type) } }, rel.type),
          h('span', { class: 'tag' }, `${rel.history.length} events`),
        ),
      ),
    ),

    // Dimensions (current state)
    collapsible('Relationship Dimensions', true,
      h('div', { style: { display: 'grid', gap: '10px' } },
        ...Object.entries(RELATIONSHIP_DIMENSIONS).map(([key, dim]) => {
          const value = rel.dimensions[key] || 0;
          return h('div', {},
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, `${dim.icon} ${dim.label}`),
              h('span', { style: { fontSize: '12px', fontWeight: '700', color: dim.color } }, `${value}%`),
            ),
            h('div', { class: 'progress' },
              h('div', { class: 'progress__bar', style: { width: `${value}%`, background: dim.color } })
            ),
          );
        })
      )
    ),

    // History timeline
    collapsible('History Timeline', true,
      rel.history.length > 0
        ? h('div', { style: { borderLeft: '2px solid var(--border-default)', paddingLeft: '16px', marginLeft: '8px' } },
            ...rel.history.map((entry, i) =>
              h('div', { style: { marginBottom: '16px', position: 'relative' } },
                // Timeline dot
                h('div', { style: { position: 'absolute', left: '-21px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-primary)', border: '2px solid var(--bg-elevated)' } }),
                h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' } }, `Scene ${i + 1}`),
                h('div', { style: { fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' } }, entry.event),
                h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  ...Object.entries(entry.changes).map(([key, delta]) => {
                    const dim = RELATIONSHIP_DIMENSIONS[key];
                    const color = delta > 0 ? 'var(--success)' : 'var(--danger)';
                    return h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: color + '20', color } }, `${dim ? dim.icon : ''} ${key} ${delta > 0 ? '+' : ''}${delta}`);
                  })
                ),
              )
            )
          )
        : h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'No history yet. Events will appear as scenes involving these characters are completed.')
    ),

    // Add event button
    collapsible('Add Event', false,
      h('div', {},
        h('div', { style: { marginBottom: '8px' } },
          h('input', { class: 'input', id: 'rel-event-text', placeholder: 'What happened between them?' }),
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' } },
          ...Object.entries(RELATIONSHIP_DIMENSIONS).map(([key, dim]) =>
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
              h('span', { style: { fontSize: '11px' } }, dim.icon),
              h('input', { type: 'number', class: 'input', style: { width: '50px', padding: '3px 6px', fontSize: '11px' }, placeholder: '0', id: `rel-dim-${key}` }),
            )
          )
        ),
        h('button', { class: 'btn btn--primary btn--sm', onclick: () => addManualEvent(rel) }, 'Add Event'),
      )
    ),
  );
}


// ─── Actions ─────────────────────────────────────────────────────────────────

function addManualEvent(rel) {
  const eventText = document.getElementById('rel-event-text')?.value;
  if (!eventText) return;

  const changes = {};
  Object.keys(RELATIONSHIP_DIMENSIONS).forEach(key => {
    const input = document.getElementById(`rel-dim-${key}`);
    const val = parseInt(input?.value);
    if (val && val !== 0) changes[key] = val;
  });

  if (Object.keys(changes).length === 0) return;

  // Apply changes
  for (const [key, delta] of Object.entries(changes)) {
    rel.dimensions[key] = Math.max(0, Math.min(100, (rel.dimensions[key] || 0) + delta));
  }
  rel.history.push({ sceneId: null, event: eventText, changes });
  const ok = saveProgressionData();

  // Re-render
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderRelationshipPlanner(container); }
  reportSave(ok);
}

async function deleteRelationship(rel) {
  const ok = await confirmDialog({ title: 'Delete relationship?', message: 'This relationship will be permanently removed.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = relationships.findIndex(r => r.id === rel.id);
  if (idx !== -1) relationships.splice(idx, 1);
  const saved = saveProgressionData();
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderRelationshipPlanner(container); }
  reportSave(saved);
}

function openAddRelationshipModal() {
  const pcs = getPieces();
  const state = { sourceId: pcs[0]?.id || '', targetId: pcs[1]?.id || '', type: 'professional' };

  const content = h('div', {},
    formField('Character A', h('select', { class: 'input', onchange: (e) => state.sourceId = e.target.value },
      ...pcs.map(p => h('option', { value: p.id }, p.name))
    )),
    formField('Character B', h('select', { class: 'input', onchange: (e) => state.targetId = e.target.value },
      ...pcs.map(p => h('option', { value: p.id, ...(p.id === state.targetId ? { selected: 'selected' } : {}) }, p.name))
    )),
    formField('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...RELATIONSHIP_TYPES.map(t => h('option', { value: t }, t.charAt(0).toUpperCase() + t.slice(1)))
    )),
  );

  showModal('Create Relationship', content, () => {
    if (state.sourceId === state.targetId) return;
    createRelationship(state.sourceId, state.targetId, state.type);
    const ok = saveProgressionData();
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderRelationshipPlanner(container); }
    reportSave(ok);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTypeColor(type) {
  const colors = { alliance: '#3b82f6', opposition: '#ef4444', manipulation: '#eab308', mentorship: '#22c55e', romance: '#ec4899', rivalry: '#f97316', friendship: '#06b6d4', fear: '#7c3aed', respect: '#f59e0b', hatred: '#dc2626', family: '#84cc16', professional: '#64748b' };
  return colors[type] || '#6366f1';
}

function collapsible(title, open, content) {
  return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` },
    h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') },
      h('span', { class: 'collapsible__chevron' }, '›'),
      h('span', { class: 'collapsible__title' }, title),
    ),
    h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))
  );
}

// showModal / formField now come from the shared, accessible ui/modal.js

function updateRelationshipSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const types = [...new Set(relationships.map(r => r.type))];
  types.forEach(type => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, type));
    relationships.filter(r => r.type === type).forEach(rel => {
      const source = getPieces().find(p => p.id === rel.sourceId);
      const target = getPieces().find(p => p.id === rel.targetId);
      sidebar.appendChild(h('div', { class: 'sidebar-item' },
        h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: getTypeColor(type), flexShrink: '0' } }),
        h('span', { class: 'sidebar-item__label' }, `${source?.name || '?'} ↔ ${target?.name || '?'}`),
      ));
    });
  });
}
