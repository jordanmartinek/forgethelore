/**
 * LoreForge Planner - Resource Planner
 * Create custom resources (trust, wealth, military power, etc.) and track
 * what percentage each character holds. Includes pie chart visualization.
 */

import { h } from '../core/renderer.js';
import { loadData, persistState, getActiveProjectId } from '../core/persist.js';

import { generateId } from '../core/objects.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';

// ─── Data ────────────────────────────────────────────────────────────────────

const _isDemo = getActiveProjectId() === 'proj1';
const DEFAULT_RESOURCES = [
  { id: 'res1', name: 'Crew Loyalty', icon: '🤝', color: '#3b82f6', description: 'Who does the crew trust and follow?', holders: [
    { character: 'Aurelian', percent: 40, color: '#ef4444' },
    { character: 'Fleet Admiral Koss', percent: 25, color: '#ef4444' },
    { character: 'Captain Sera', percent: 20, color: '#f59e0b' },
    { character: 'AXIOM Prime', percent: 10, color: '#3b82f6' },
    { character: 'Other', percent: 5, color: '#64748b' },
  ]},
  { id: 'res2', name: 'Military Strength', icon: '⚔️', color: '#ef4444', description: 'Control over armed forces and fleets.', holders: [
    { character: 'The Dominion', percent: 45, color: '#ef4444' },
    { character: 'The Swarm', percent: 25, color: '#22c55e' },
    { character: 'Machinae Collective', percent: 20, color: '#3b82f6' },
    { character: 'Free Colonies', percent: 10, color: '#f59e0b' },
  ]},
  { id: 'res3', name: 'Void Knowledge', icon: '🔮', color: '#a855f7', description: 'Understanding of Void Conduit technology.', holders: [
    { character: 'Dr. Orin Voss', percent: 35, color: '#f59e0b' },
    { character: 'AXIOM Prime', percent: 30, color: '#3b82f6' },
    { character: 'Aurelian', percent: 20, color: '#ef4444' },
    { character: 'The Overmind', percent: 15, color: '#22c55e' },
  ]},
  { id: 'res4', name: 'Political Influence', icon: '🏛️', color: '#f59e0b', description: 'Ability to shape laws, treaties, and public opinion.', holders: [
    { character: 'Senator Vex', percent: 35, color: '#ef4444' },
    { character: 'Aurelian', percent: 30, color: '#ef4444' },
    { character: 'Nexus Trade Council', percent: 20, color: '#06b6d4' },
    { character: 'Captain Sera', percent: 10, color: '#f59e0b' },
    { character: 'Other', percent: 5, color: '#64748b' },
  ]},
];

let resources = loadData('resources', _isDemo ? DEFAULT_RESOURCES : []);

function save() {
  persistState('resources', resources);
}

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderResourcePlanner(container) {
  const planner = h('div', { class: 'character-planner' },
    renderResourceList(),
    resources.length > 0
      ? renderResourceDetail(resources[0])
      : h('div', { class: 'character-detail', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: { textAlign: 'center', color: 'var(--text-muted)' } },
            h('div', { style: { fontSize: '48px', marginBottom: '16px', opacity: '0.5' } }, '📊'),
            h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'No Resources Yet'),
            h('div', { style: { fontSize: '13px', marginBottom: '16px' } }, 'Create a resource to track who holds power.'),
            h('button', { class: 'btn btn--primary', onclick: openAddResourceModal }, '+ New Resource'),
          ))
  );
  container.appendChild(planner);
  updateResourceSidebar();
}

// ─── List ────────────────────────────────────────────────────────────────────

function renderResourceList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search resources...', style: { fontSize: '12px' }, oninput: (e) => {
        const q = e.target.value.toLowerCase();
        list.querySelectorAll('.character-card').forEach(c => { c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
      }}),
    ),
  );

  resources.forEach(res => {
    list.appendChild(h('div', {
      class: 'character-card',
      onclick: (e) => {
        if (e.target.closest('.card-actions')) return;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderResourceDetailContent(res)); }
      }
    },
      h('div', { class: 'character-card__avatar', style: { background: res.color, fontSize: '18px', borderRadius: '8px' } }, res.icon),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, res.name),
        h('div', { class: 'character-card__role' }, `${res.holders.length} holders`),
      ),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditResourceModal(res); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteResource(res); } }, '🗑️'),
      ),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddResourceModal }, '+ New Resource')
  ));
  return list;
}

// ─── Detail with Pie Chart ───────────────────────────────────────────────────

function renderResourceDetail(res) {
  return h('div', { class: 'character-detail' }, renderResourceDetailContent(res));
}

function renderResourceDetailContent(res) {
  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: res.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, res.icon),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '4px' } }, res.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, res.description || 'No description'),
      ),
    ),

    // Pie Chart
    h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '24px' } },
      renderPieChart(res.holders),
    ),

    // Holders list with editable percentages
    h('div', { style: { marginBottom: '16px' } },
      h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '10px' } }, 'RESOURCE HOLDERS'),
      ...res.holders.map((holder, idx) =>
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' } },
          h('div', { style: { width: '12px', height: '12px', borderRadius: '3px', background: holder.color, flexShrink: '0' } }),
          h('div', { style: { flex: '1', fontSize: '13px', color: 'var(--text-primary)' } }, holder.character),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            h('input', { type: 'range', min: '0', max: '100', value: String(holder.percent), style: { width: '80px' }, oninput: (e) => {
              holder.percent = parseInt(e.target.value);
              save();
              // Update display
              const detail = document.querySelector('.character-detail');
              if (detail) { detail.innerHTML = ''; detail.appendChild(renderResourceDetailContent(res)); }
            }}),
            h('span', { style: { fontSize: '13px', fontWeight: '700', color: res.color, minWidth: '36px', textAlign: 'right' } }, `${holder.percent}%`),
          ),
          h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }, onclick: () => { res.holders.splice(idx, 1); save(); rerender(); } }, '✕'),
        )
      ),
    ),

    // Add holder
    h('button', { class: 'btn btn--ghost btn--sm', onclick: () => openAddHolderModal(res) }, '+ Add Holder'),

    // Total check
    h('div', { style: { marginTop: '12px', fontSize: '11px', color: getTotalPercent(res) === 100 ? 'var(--success)' : 'var(--warning)' } },
      `Total: ${getTotalPercent(res)}% ${getTotalPercent(res) !== 100 ? '(should equal 100%)' : '✓'}`,
    ),
  );
}

function getTotalPercent(res) {
  return res.holders.reduce((sum, h) => sum + h.percent, 0);
}

// ─── SVG Pie Chart ───────────────────────────────────────────────────────────

function renderPieChart(holders) {
  const size = 180;
  const cx = size / 2, cy = size / 2, r = 70;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  let cumulative = 0;

  holders.forEach(holder => {
    if (holder.percent <= 0) return;
    const startAngle = cumulative * 3.6 * (Math.PI / 180);
    cumulative += holder.percent;
    const endAngle = cumulative * 3.6 * (Math.PI / 180);

    const x1 = cx + r * Math.cos(startAngle - Math.PI / 2);
    const y1 = cy + r * Math.sin(startAngle - Math.PI / 2);
    const x2 = cx + r * Math.cos(endAngle - Math.PI / 2);
    const y2 = cy + r * Math.sin(endAngle - Math.PI / 2);
    const largeArc = holder.percent > 50 ? 1 : 0;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (holder.percent >= 100) {
      // Full circle
      path.setAttribute('d', `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`);
    } else {
      path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`);
    }
    path.setAttribute('fill', holder.color);
    path.setAttribute('stroke', '#0d0d12');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
  });

  // Center label
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', '35');
  circle.setAttribute('fill', '#0d0d12');
  svg.appendChild(circle);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(cx));
  text.setAttribute('y', String(cy + 5));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#e8e8f0');
  text.setAttribute('font-size', '12');
  text.setAttribute('font-weight', '600');
  text.textContent = `${holders.length}`;
  svg.appendChild(text);

  const subtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  subtext.setAttribute('x', String(cx));
  subtext.setAttribute('y', String(cy + 18));
  subtext.setAttribute('text-anchor', 'middle');
  subtext.setAttribute('fill', '#9898b0');
  subtext.setAttribute('font-size', '9');
  subtext.textContent = 'holders';
  svg.appendChild(subtext);

  return svg;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

function openAddResourceModal() {
  const ICONS = ['🤝', '⚔️', '🔮', '🏛️', '💰', '🛡️', '📚', '⚡', '🌟', '🔥', '👑', '🧠', '🏴', '💎', '🌊', '🕸️'];
  const COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#22c55e', '#06b6d4', '#ec4899', '#f97316'];
  const state = { name: '', icon: '🤝', color: '#3b82f6', description: '' };

  const content = h('div', {},
    formField('Resource Name', h('input', { class: 'input', placeholder: 'e.g. Crew Loyalty, Military Power, Public Trust...', oninput: (e) => state.name = e.target.value })),
    formField('Icon', h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
      ...ICONS.map(ic => h('span', { style: { width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '6px', fontSize: '16px', background: ic === state.icon ? 'var(--bg-active)' : 'transparent', border: ic === state.icon ? '1px solid var(--border-accent)' : '1px solid transparent' }, onclick: (e) => { state.icon = ic; e.currentTarget.parentElement.querySelectorAll('span').forEach(s => { s.style.background = 'transparent'; s.style.border = '1px solid transparent'; }); e.currentTarget.style.background = 'var(--bg-active)'; e.currentTarget.style.border = '1px solid var(--border-accent)'; } }, ic))
    )),
    formField('Color', h('div', { style: { display: 'flex', gap: '6px' } },
      ...COLORS.map(c => h('div', { style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' }, onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; } }))
    )),
    formField('Description', h('input', { class: 'input', placeholder: 'What does this resource represent?', oninput: (e) => state.description = e.target.value })),
  );

  showModal('Create New Resource', content, () => {
    if (!state.name.trim()) return;
    resources.push({ id: generateId(), name: state.name, icon: state.icon, color: state.color, description: state.description, holders: [] });
    save(); rerender();
  });
}

function openEditResourceModal(res) {
  const state = { name: res.name, icon: res.icon, color: res.color, description: res.description };
  const content = h('div', {},
    formField('Resource Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    formField('Description', h('input', { class: 'input', value: state.description, oninput: (e) => state.description = e.target.value })),
  );
  showModal(`Edit: ${res.name}`, content, () => {
    Object.assign(res, state);
    save(); rerender();
  });
}

function openAddHolderModal(res) {
  const pieces = window.__loreforge_pieces || [];
  const factions = [...(window.__loreforge_factions || []), ...(window.__loreforge_factionData || [])];
  const allNames = [...pieces.map(p => p.name), ...factions.map(f => f.name), 'Other'];
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b'];

  const state = { character: allNames[0] || '', percent: 10, color: COLORS[res.holders.length % COLORS.length] };

  const content = h('div', {},
    formField('Character / Faction', h('select', { class: 'input', onchange: (e) => state.character = e.target.value },
      ...allNames.map(n => h('option', { value: n }, n))
    )),
    formField('Percentage', h('input', { type: 'number', class: 'input', min: '0', max: '100', value: '10', oninput: (e) => state.percent = parseInt(e.target.value) || 0 })),
    formField('Color', h('div', { style: { display: 'flex', gap: '6px' } },
      ...COLORS.map(c => h('div', { style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' }, onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; } }))
    )),
  );

  showModal('Add Resource Holder', content, () => {
    if (!state.character) return;
    res.holders.push({ character: state.character, percent: state.percent, color: state.color });
    save(); rerender();
  });
}

async function deleteResource(res) {
  const ok = await confirmDialog({ title: `Delete ${res.name}`, message: `This will permanently remove the resource "${res.name}".`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = resources.findIndex(r => r.id === res.id);
  if (idx !== -1) resources.splice(idx, 1);
  save(); rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderResourcePlanner(container); }
}

// showModal / formField now come from the shared, accessible ui/modal.js

function updateResourceSidebar() {
  const sidebar = document.getElementById('sidebar-content'); if (!sidebar) return; sidebar.innerHTML = '';
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Resources'));
  resources.forEach(res => {
    sidebar.appendChild(h('div', { class: 'sidebar-item' },
      h('span', { style: { fontSize: '14px' } }, res.icon),
      h('span', { class: 'sidebar-item__label' }, res.name),
      h('span', { class: 'sidebar-item__count' }, `${res.holders.length}`),
    ));
  });
}
