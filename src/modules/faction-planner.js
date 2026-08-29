/**
 * LoreForge Planner - Faction Planner
 * Dedicated module for managing factions as first-class planning objects.
 */

import { h } from '../core/renderer.js';
import { loadData, persistState, getActiveProjectId } from '../core/persist.js';
import { generateId } from '../core/objects.js';
import { expandableText } from '../ui/expandable-text.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';

const FACTION_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#64748b'];
const FACTION_ICONS = ['🦅', '🤖', '🐛', '🌟', '⚔️', '🛡️', '🔥', '🌀', '👑', '💀', '🐉', '🕷️', '🦊', '🐺', '🦁', '🏴', '⚡', '🌑', '☀️', '🎭'];

let factionData = [
  { id: 'fac1', name: 'The Dominion', color: '#ef4444', icon: '🦅', goal: 'Secure the Void Conduit', type: 'Empire', leader: 'Aurelian', territory: 'Core Systems', population: '8 billion', militaryStrength: 90, politicalPower: 85, economicPower: 75, status: 'dominant', description: 'A militaristic human empire that believes in human supremacy and expansion. Controls the largest fleet and most territory.' },
  { id: 'fac2', name: 'Machinae Collective', color: '#3b82f6', icon: '🤖', goal: 'Prevent Dominion Expansion', type: 'AI Collective', leader: 'AXIOM Prime', territory: 'Distributed Networks', population: '2 billion units', militaryStrength: 70, politicalPower: 30, economicPower: 60, status: 'growing', description: 'A coalition of synthetic intelligences seeking sovereignty and recognition. Operates through distributed networks rather than territory.' },
  { id: 'fac3', name: 'The Swarm', color: '#22c55e', icon: '🐛', goal: 'Assimilate the System', type: 'Hive Mind', leader: 'The Overmind', territory: 'Sector 7 (expanding)', population: 'Trillions', militaryStrength: 85, politicalPower: 5, economicPower: 10, status: 'expanding', description: 'An alien collective consciousness that absorbs all organic life. No diplomacy, no negotiation. Only assimilation.' },
  { id: 'fac4', name: 'Free Colonies', color: '#f59e0b', icon: '🌟', goal: 'Survive the War', type: 'Loose Alliance', leader: 'Captain Sera (unofficial)', territory: 'Outer Rim', population: '1.2 billion', militaryStrength: 35, politicalPower: 60, economicPower: 30, status: 'struggling', description: 'A fractured coalition of independent colonies trying to maintain autonomy against all major powers. Underfunded but determined.' },
  { id: 'fac5', name: 'Nexus Trade Consortium', color: '#06b6d4', icon: '💎', goal: 'Profit from all sides', type: 'Trade Federation', leader: 'Guildmaster Riven Khol', territory: 'Neutral Zones', population: '340 million', militaryStrength: 20, politicalPower: 50, economicPower: 90, status: 'neutral', description: 'Controls all neutral trade routes and stations. Officially neutral, secretly sells to everyone. War is good for business.' },
];

// Load persisted data
const _saved_factionData = loadData("factionData", null);
const _isDemo_factionData = getActiveProjectId() === "proj1";
if (_saved_factionData) { factionData.length = 0; factionData.push(..._saved_factionData); } else if (!_isDemo_factionData) { factionData.length = 0; }

// Expose faction data globally so other modules can read faction names
window.__loreforge_factionData = factionData;

export function renderFactionPlanner(container) {
  const planner = h('div', { class: 'character-planner' },
    renderFactionList(),
    factionData.length > 0
      ? renderFactionDetail(factionData[0])
      : h("div", { class: "character-detail", style: { display: "flex", alignItems: "center", justifyContent: "center" } },
          h("div", { style: { textAlign: "center", color: "var(--text-muted)" } },
            h("div", { style: { fontSize: "48px", marginBottom: "16px", opacity: "0.5" } }, "⚔️"),
            h("div", { style: { fontSize: "16px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "8px" } }, "No Factions Yet"),
            h("div", { style: { fontSize: "13px", marginBottom: "16px" } }, "Create your first entry to get started."),
            h("button", { class: "btn btn--primary", onclick: openAddFactionModal }, "+ New"),
          )
        )
  );
  container.appendChild(planner);
  updateFactionSidebar();
}

function renderFactionList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', { class: 'input', placeholder: 'Search factions...', style: { fontSize: '12px' } }),
    ),
  );

  factionData.forEach(fac => {
    list.appendChild(h('div', {
      class: 'character-card',
      onclick: (e) => {
        if (e.target.closest('.card-actions')) return;
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderFactionDetailContent(fac)); }
      }
    },
      h('div', { class: 'character-card__avatar', style: { background: fac.color, fontSize: '18px', borderRadius: '8px' } }, fac.icon),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, fac.name),
        h('div', { class: 'character-card__role' }, `${fac.type} • ${fac.leader}`),
      ),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditFactionItemModal(fac); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteFaction(fac); } }, '🗑️'),
      ),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddFactionModal }, '+ New Faction')
  ));

  return list;
}

function renderFactionDetail(fac) {
  return h('div', { class: 'character-detail' }, renderFactionDetailContent(fac));
}

function renderFactionDetailContent(fac) {
  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: fac.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, fac.icon),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, fac.name),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${fac.type} • Led by ${fac.leader}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: `tag tag--${fac.status === 'dominant' ? 'danger' : fac.status === 'growing' || fac.status === 'expanding' ? 'success' : 'accent'}` }, fac.status),
          h('span', { class: 'tag' }, fac.territory),
        ),
      ),
    ),

    collapsible('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, fac.description)),

    collapsible('Strategic Goal', true, h('div', {},
      h('div', { style: { padding: '12px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' } }, `🎯 ${fac.goal}`),
    )),

    collapsible('Power & Resources', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } },
      powerBar('Military Strength', fac.militaryStrength, '#ef4444'),
      powerBar('Political Power', fac.politicalPower, '#a855f7'),
      powerBar('Economic Power', fac.economicPower, '#f59e0b'),
    )),

    collapsible('Properties', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      statCard('Leader', fac.leader),
      statCard('Territory', fac.territory),
      statCard('Population', fac.population),
      statCard('Type', fac.type),
    )),

    collapsible('Key Members', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Characters belonging to this faction...')),
    collapsible('Allies & Enemies', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Diplomatic relationships with other factions...')),
    collapsible('Military Assets', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Fleets, armies, and military capabilities...')),
    collapsible('History', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Key events in this faction\'s history...')),
    collapsible('Internal Conflicts', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Power struggles, dissent, and factions within the faction...')),
    collapsible('Notes', false, h('textarea', { class: 'input', placeholder: 'Add notes...', style: { minHeight: '100px' } })),
  );
}

function openAddFactionModal() {
  const state = { name: '', type: 'Alliance', leader: '', goal: '', territory: '', description: '', color: FACTION_COLORS[factionData.length % FACTION_COLORS.length], icon: '⚔️' };

  const colorGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    ...FACTION_COLORS.map(c => h('div', {
      style: { width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
      onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; }
    }))
  );

  const iconGrid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
    ...FACTION_ICONS.map(ic => h('span', {
      style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '4px', background: ic === state.icon ? 'var(--bg-active)' : 'transparent', fontSize: '16px' },
      onclick: (e) => { state.icon = ic; e.currentTarget.parentElement.querySelectorAll('span').forEach(s => s.style.background = 'transparent'); e.currentTarget.style.background = 'var(--bg-active)'; }
    }, ic))
  );

  const content = h('div', {},
    formField('Faction Name', h('input', { class: 'input', placeholder: 'e.g. The Dominion', oninput: (e) => state.name = e.target.value })),
    formField('Color', colorGrid),
    formField('Icon', iconGrid),
    formField('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Empire', 'Alliance', 'Collective', 'Hive Mind', 'Trade Federation', 'Religious Order', 'Military Junta', 'Democracy', 'Monarchy', 'Rebellion', 'Other'].map(t => h('option', { value: t }, t))
    )),
    formField('Leader', h('input', { class: 'input', placeholder: 'Who leads this faction?', oninput: (e) => state.leader = e.target.value })),
    formField('Strategic Goal', h('input', { class: 'input', placeholder: 'What is their primary objective?', oninput: (e) => state.goal = e.target.value })),
    formField('Territory', h('input', { class: 'input', placeholder: 'e.g. Core Systems, Outer Rim', oninput: (e) => state.territory = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Describe this faction...', label: 'Faction Description', oninput: (e) => state.description = e.target.value })),
  );

  showModal('Add New Faction', content, () => {
    if (!state.name.trim()) return;
    factionData.push({ id: generateId(), name: state.name, color: state.color, icon: state.icon, goal: state.goal, type: state.type, leader: state.leader, territory: state.territory, population: 'Unknown', militaryStrength: 50, politicalPower: 50, economicPower: 50, status: 'active', description: state.description });
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderFactionPlanner(container); }
    persistState("factionData", factionData);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function powerBar(label, value, color) {
  return h('div', {},
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, label),
      h('span', { style: { fontSize: '12px', fontWeight: '700', color } }, `${value}%`),
    ),
    h('div', { class: 'progress' },
      h('div', { class: 'progress__bar', style: { width: `${value}%`, background: color } })
    ),
  );
}

function statCard(label, value) {
  return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, label), h('div', { class: 'intel-card__value' }, value));
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

function updateFactionSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const byStatus = {};
  factionData.forEach(f => { if (!byStatus[f.status]) byStatus[f.status] = []; byStatus[f.status].push(f); });

  Object.entries(byStatus).forEach(([status, facs]) => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, status));
    facs.forEach(fac => {
      sidebar.appendChild(h('div', { class: 'sidebar-item' },
        h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: fac.color, flexShrink: '0' } }),
        h('span', { class: 'sidebar-item__label' }, fac.name),
      ));
    });
  });
}


function openEditFactionItemModal(fac) {
  const state = { name: fac.name, type: fac.type, leader: fac.leader, goal: fac.goal, territory: fac.territory, description: fac.description };
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    formField('Type', h('input', { class: 'input', value: state.type, oninput: (e) => state.type = e.target.value })),
    formField('Leader', h('input', { class: 'input', value: state.leader, oninput: (e) => state.leader = e.target.value })),
    formField('Strategic Goal', h('input', { class: 'input', value: state.goal, oninput: (e) => state.goal = e.target.value })),
    formField('Territory', h('input', { class: 'input', value: state.territory, oninput: (e) => state.territory = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Describe...', value: state.description, label: 'Faction Description', oninput: (e) => state.description = e.target.value })),
  );
  showModal(`Edit: ${fac.name}`, content, () => {
    Object.assign(fac, state);
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderFactionPlanner(container); }
    persistState("factionData", factionData);
  });
}

async function deleteFaction(fac) {
  const ok = await confirmDialog({ title: `Delete ${fac.name}`, message: `This will permanently remove the faction "${fac.name}".`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = factionData.findIndex(f => f.id === fac.id);
  if (idx !== -1) factionData.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderFactionPlanner(container); }
  persistState("factionData", factionData);
}
