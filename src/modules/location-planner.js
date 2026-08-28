/**
 * LoreForge Planner - Location Planner
 * Manage all named locations: planets, cities, buildings, regions, etc.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { loadData, persistState, getActiveProjectId } from '../core/persist.js';
import { generateId } from '../core/objects.js';
import { expandableText } from '../ui/expandable-text.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';

let locations = [
  { id: 'loc1', name: 'Citadel Prime', type: 'Space Station', region: 'Core Systems', faction: 'The Dominion', population: '2.4 million', status: 'active', description: 'The political and military heart of the Dominion. A massive orbital station serving as the seat of government.', climate: 'Controlled', resources: 'High', strategicValue: 90, color: '#ef4444' },
  { id: 'loc2', name: 'Terra Nova', type: 'Planet', region: 'Kepler Array', faction: 'Free Colonies', population: '800 million', status: 'active', description: 'The largest colony world and de facto capital of the Free Colonies movement.', climate: 'Temperate', resources: 'Moderate', strategicValue: 75, color: '#f59e0b' },
  { id: 'loc3', name: 'The Breach', type: 'Void Conduit', region: 'Void Expanse', faction: 'Contested', population: '0', status: 'active', description: 'The largest known Void Conduit. Its origin and purpose remain unknown. All factions seek to control it.', climate: 'N/A', resources: 'Unknown', strategicValue: 100, color: '#a855f7' },
  { id: 'loc4', name: 'Obsidian', type: 'Planet', region: 'Kepler Array', faction: 'The Swarm', population: '0 (infested)', status: 'fallen', description: 'Once a thriving mining colony, now completely consumed by the Swarm.', climate: 'Volcanic', resources: 'High (minerals)', strategicValue: 60, color: '#22c55e' },
  { id: 'loc5', name: 'Nexus Hub', type: 'Space Station', region: 'Neutral Zone', faction: 'Independent', population: '340,000', status: 'active', description: 'A neutral trading station where all factions maintain embassies. Espionage hotspot.', climate: 'Controlled', resources: 'Trade Hub', strategicValue: 70, color: '#06b6d4' },
  { id: 'loc6', name: 'The Quantum Rift', type: 'Anomaly', region: 'Void Expanse', faction: 'None', population: '0', status: 'active', description: 'A spacetime anomaly near The Breach. Dr. Voss conducts research here. Emits strange signals.', climate: 'N/A', resources: 'Research', strategicValue: 85, color: '#ec4899' },
];

const LOCATION_TYPES = ['Planet', 'Moon', 'Space Station', 'City', 'Continent', 'Country', 'Region', 'Building', 'Void Conduit', 'Anomaly', 'Fleet', 'Ship', 'Asteroid Belt', 'Nebula', 'Other'];

// Load persisted data
const _saved_locations = loadData("locations", null);
const _isDemo_locations = getActiveProjectId() === "proj1";
if (_saved_locations) { locations.length = 0; locations.push(..._saved_locations); } else if (!_isDemo_locations) { locations.length = 0; }

export function renderLocationPlanner(container) {
  const planner = h('div', { class: 'character-planner' },
    renderLocationList(),
    locations.length > 0
      ? renderLocationDetail(locations[0])
      : h("div", { class: "character-detail", style: { display: "flex", alignItems: "center", justifyContent: "center" } },
          h("div", { style: { textAlign: "center", color: "var(--text-muted)" } },
            h("div", { style: { fontSize: "48px", marginBottom: "16px", opacity: "0.5" } }, "📍"),
            h("div", { style: { fontSize: "16px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "8px" } }, "No Locations Yet"),
            h("div", { style: { fontSize: "13px", marginBottom: "16px" } }, "Create your first entry to get started."),
            h("button", { class: "btn btn--primary", onclick: openAddLocationModal }, "+ New"),
          )
        )
  );
  container.appendChild(planner);
  updateLocationSidebar();
}

function renderLocationList() {
  const allTypes = [...new Set(locations.map(l => l.type))];
  
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search locations...', style: { fontSize: '12px', marginBottom: '6px' }, oninput: (e) => {
        const q = e.target.value.toLowerCase();
        list.querySelectorAll('.character-card').forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(q) ? '' : 'none';
        });
      }}),
      h('select', { class: 'input', style: { fontSize: '11px', padding: '4px 8px' }, onchange: (e) => {
        const filter = e.target.value;
        list.querySelectorAll('.character-card').forEach(card => {
          if (!filter) { card.style.display = ''; return; }
          card.style.display = card.dataset.type === filter ? '' : 'none';
        });
      }},
        h('option', { value: '' }, 'All Types'),
        ...allTypes.map(t => h('option', { value: t }, t))
      ),
    ),
  );

  locations.forEach(loc => {
    list.appendChild(h('div', {
      class: 'character-card',
      dataset: { type: loc.type },
      onclick: (e) => {
        if (e.target.closest('.card-actions')) return;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderLocationDetailContent(loc)); }
      }
    },
      h('div', { class: 'character-card__avatar', style: { background: loc.color, fontSize: '14px' } }, loc.type === 'Planet' ? '🪐' : loc.type === 'Space Station' ? '🛸' : loc.type === 'Void Conduit' ? '🕳️' : loc.type === 'Anomaly' ? '⚡' : '📍'),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, loc.name),
        h('div', { class: 'character-card__role' }, `${loc.type} • ${loc.region}`),
      ),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditLocationModal(loc); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteLocation(loc); } }, '🗑️'),
      ),
      h('span', { class: `tag tag--${loc.status === 'active' ? 'success' : 'danger'}`, style: { fontSize: '9px' } }, loc.status),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddLocationModal }, '+ New Location')
  ));

  return list;
}

function renderLocationDetail(loc) {
  return h('div', { class: 'character-detail' }, renderLocationDetailContent(loc));
}

function renderLocationDetailContent(loc) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: loc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, loc.type === 'Planet' ? '🪐' : loc.type === 'Space Station' ? '🛸' : '📍'),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, loc.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${loc.type} • ${loc.region}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: `tag tag--${loc.status === 'active' ? 'success' : 'danger'}` }, loc.status),
          h('span', { class: 'tag' }, loc.faction),
        ),
      ),
    ),
    createCollapsible('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, loc.description)),
    createCollapsible('Properties', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      statCard('Population', loc.population),
      statCard('Climate', loc.climate),
      statCard('Resources', loc.resources),
      statCard('Strategic Value', `${loc.strategicValue}%`),
    )),
    createCollapsible('Controlling Faction', true, h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__value' }, loc.faction))),
    createCollapsible('Connected Locations', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Drag to connect locations...')),
    createCollapsible('Events Here', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Timeline events at this location...')),
    createCollapsible('Notes', false, h('div', {}, h('textarea', { class: 'input', placeholder: 'Add notes...', style: { minHeight: '100px' } }))),
  );
}

function openAddLocationModal() {
  const state = { name: '', type: 'Planet', region: '', faction: '', description: '' };
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', placeholder: 'Location name', oninput: (e) => state.name = e.target.value })),
    formField('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value }, ...LOCATION_TYPES.map(t => h('option', { value: t }, t)))),
    formField('Region', h('input', { class: 'input', placeholder: 'e.g. Core Systems', oninput: (e) => state.region = e.target.value })),
    formField('Controlling Faction', h('input', { class: 'input', placeholder: 'e.g. The Dominion', oninput: (e) => state.faction = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Describe this location...', label: 'Location Description', oninput: (e) => state.description = e.target.value })),
  );
  showModal('Add New Location', content, () => {
    if (!state.name.trim()) return;
    locations.push({ id: generateId(), ...state, population: 'Unknown', status: 'active', climate: 'Unknown', resources: 'Unknown', strategicValue: 50, color: '#6366f1' });
    const container = document.querySelector('.main-content');
    if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderLocationPlanner(container); });
    persistState("locations", locations);
  });
}

function openEditLocationModal(loc) {
  const state = { name: loc.name, type: loc.type, region: loc.region, faction: loc.faction, description: loc.description };
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    formField('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value }, ...LOCATION_TYPES.map(t => h('option', { value: t, selected: t === state.type ? 'selected' : undefined }, t)))),
    formField('Region', h('input', { class: 'input', value: state.region, oninput: (e) => state.region = e.target.value })),
    formField('Controlling Faction', h('input', { class: 'input', value: state.faction, oninput: (e) => state.faction = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Describe this location...', label: 'Location Description', value: state.description, oninput: (e) => state.description = e.target.value })),
  );
  showModal('Edit: ' + loc.name, content, () => {
    Object.assign(loc, state);
    const container = document.querySelector('.main-content');
    if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderLocationPlanner(container); });
    persistState("locations", locations);
  });
}

async function deleteLocation(loc) {
  const ok = await confirmDialog({ title: `Delete ${loc.name}`, message: `This will permanently remove the location "${loc.name}".`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = locations.findIndex(i => i.id === loc.id);
  if (idx !== -1) locations.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderLocationPlanner(container); });
  persistState("locations", locations);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createCollapsible(title, open, content) {
  return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` },
    h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') },
      h('span', { class: 'collapsible__chevron' }, '›'),
      h('span', { class: 'collapsible__title' }, title),
    ),
    h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))
  );
}

function statCard(label, value) {
  return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, label), h('div', { class: 'intel-card__value' }, value));
}

// showModal / formField now come from the shared, accessible ui/modal.js

function updateLocationSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  const types = [...new Set(locations.map(l => l.type))];
  types.forEach(type => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, type));
    locations.filter(l => l.type === type).forEach(loc => {
      sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '📍'), h('span', { class: 'sidebar-item__label' }, loc.name)));
    });
  });
}
