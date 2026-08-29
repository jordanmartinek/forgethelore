/**
 * LoreForge Planner - Organization Planner
 * Manage organizations, guilds, companies, secret societies, agencies.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { loadData, persistState, getActiveProjectId } from '../core/persist.js';
import { confirmDialog, showModal, formField } from '../ui/modal.js';
import { expandableText } from '../ui/expandable-text.js';
import { generateId } from '../core/objects.js';

let organizations = [
  { id: 'org1', name: 'Dominion Intelligence Bureau', type: 'Intelligence Agency', faction: 'The Dominion', leader: 'Director Sylas Crane', members: '~50,000', purpose: 'Espionage, counter-intelligence, internal security', secrecy: 95, influence: 85, status: 'active', color: '#ef4444', description: 'The Dominion\'s shadow arm. Operates black sites, maintains surveillance networks, and eliminates threats before they materialize.' },
  { id: 'org2', name: 'Void Research Institute', type: 'Research Organization', faction: 'Independent', leader: 'Dr. Orin Voss', members: '~2,000', purpose: 'Study Void energy and Conduit technology', secrecy: 40, influence: 60, status: 'active', color: '#a855f7', description: 'Officially neutral scientific body. In practice, every faction tries to infiltrate it. Dr. Voss maintains independence through indispensability.' },
  { id: 'org3', name: 'The Unseen', type: 'Secret Society', faction: 'Unknown', leader: 'Unknown', members: 'Unknown', purpose: 'Unknown — possibly Void worship', secrecy: 100, influence: 50, status: 'active', color: '#1e1e2a', description: 'A rumored organization with members in every faction. Their goals are unclear but they seem to be guiding events toward a specific outcome.' },
  { id: 'org4', name: 'Stellar Merchants Guild', type: 'Trade Guild', faction: 'Nexus', leader: 'Guildmaster Riven Khol', members: '~500,000', purpose: 'Control interstellar trade routes', secrecy: 20, influence: 70, status: 'active', color: '#06b6d4', description: 'The economic backbone of neutral space. Controls shipping lanes, enforces trade contracts, and profits from every conflict.' },
];


// Load persisted data
const _saved_organizations = loadData("organizations", null);
const _isDemo_organizations = getActiveProjectId() === "proj1";
if (_saved_organizations) { organizations.length = 0; organizations.push(..._saved_organizations); } else if (!_isDemo_organizations) { organizations.length = 0; }

export function renderOrganizationPlanner(container) {
  const planner = h('div', { class: 'character-planner' }, renderOrgList(), organizations.length > 0
      ? renderOrgDetail(organizations[0])
      : h("div", { class: "character-detail", style: { display: "flex", alignItems: "center", justifyContent: "center" } },
          h("div", { style: { textAlign: "center", color: "var(--text-muted)" } },
            h("div", { style: { fontSize: "48px", marginBottom: "16px", opacity: "0.5" } }, "🏢"),
            h("div", { style: { fontSize: "16px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "8px" } }, "No Organizations Yet"),
            h("div", { style: { fontSize: "13px", marginBottom: "16px" } }, "Create your first entry to get started."),
            h("button", { class: "btn btn--primary", onclick: openAddOrgModal }, "+ New"),
          )
        ));
  container.appendChild(planner);
  updateOrgSidebar();
}

function renderOrgList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } }, h('input', { class: 'input', placeholder: 'Search organizations...', style: { fontSize: '12px' } })),
  );
  organizations.forEach(org => {
    list.appendChild(h('div', { class: 'character-card', onclick: (e) => {
      if (e.target.closest('.card-actions')) return;
      document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
      e.currentTarget.classList.add('character-card--active');
      const d = document.querySelector('.character-detail'); if (d) { d.innerHTML = ''; d.appendChild(renderOrgDetailContent(org)); }
    }},
      h('div', { class: 'character-card__avatar', style: { background: org.color, fontSize: '14px' } }, '🏢'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, org.name), h('div', { class: 'character-card__role' }, `${org.type} • ${org.faction}`)),
      h('div', { class: 'card-actions', style: { display: 'flex', gap: '2px', marginLeft: 'auto' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditOrgModal(org); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteOrg(org); } }, '🗑️'),
      ),
      h('span', { class: 'tag tag--accent', style: { fontSize: '9px' } }, org.status),
    ));
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddOrgModal }, '+ New Organization')));
  return list;
}

function renderOrgDetail(org) { return h('div', { class: 'character-detail' }, renderOrgDetailContent(org)); }

function renderOrgDetailContent(org) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: org.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '🏢'),
      h('div', {}, h('h2', { style: { fontSize: '20px', fontWeight: '700' } }, org.name), h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${org.type} • ${org.faction}`)),
    ),
    col('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' } }, org.description)),
    col('Properties', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      sc('Leader', org.leader), sc('Members', org.members), sc('Purpose', org.purpose), sc('Secrecy', `${org.secrecy}%`), sc('Influence', `${org.influence}%`), sc('Status', org.status))),
    col('Internal Hierarchy', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Define ranks, departments, and chains of command...')),
    col('Key Operatives', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Notable members...')),
    col('Resources & Assets', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Budget, technology, bases...')),
    col('Notes', false, h('textarea', { class: 'input', placeholder: 'Notes...', style: { minHeight: '80px' } })),
  );
}

function sc(l, v) { return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, l), h('div', { class: 'intel-card__value' }, v)); }
function col(title, open, content) { return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` }, h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') }, h('span', { class: 'collapsible__chevron' }, '›'), h('span', { class: 'collapsible__title' }, title)), h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))); }
function updateOrgSidebar() {
  const sb = document.getElementById('sidebar-content'); if (!sb) return; sb.innerHTML = '';
  organizations.forEach(org => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '🏢'), h('span', { class: 'sidebar-item__label' }, org.name))));
}


function openEditOrgModal(org) {
  const state = { name: org.name, type: org.type, faction: org.faction, leader: org.leader, description: org.description };
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', value: state.name, oninput: (e) => state.name = e.target.value })),
    formField('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Intelligence Agency', 'Research Organization', 'Secret Society', 'Trade Guild', 'Military Order', 'Criminal Syndicate', 'Religious Order', 'Corporation', 'Other'].map(t => h('option', { value: t, selected: t === state.type ? 'selected' : undefined }, t)))),
    formField('Faction', h('input', { class: 'input', value: state.faction, oninput: (e) => state.faction = e.target.value })),
    formField('Leader', h('input', { class: 'input', value: state.leader, oninput: (e) => state.leader = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Describe this organization...', label: 'Organization Description', value: state.description, oninput: (e) => state.description = e.target.value })),
  );
  showModal('Edit: ' + org.name, content, () => {
    Object.assign(org, state);
    const container = document.querySelector('.main-content');
    if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderOrganizationPlanner(container); });
    persistState("organizations", organizations);
  });
}

async function deleteOrg(org) {
  const ok = await confirmDialog({ title: `Delete "${org.name}"?`, message: 'This will permanently remove it.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = organizations.findIndex(i => i.id === org.id);
  if (idx !== -1) organizations.splice(idx, 1);
  const container = document.querySelector('.main-content');
  if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderOrganizationPlanner(container); });
  persistState("organizations", organizations);
}


function openAddOrgModal() {
  const state = { name: '', type: 'Organization', faction: '', leader: '', description: '' };
  const content = h('div', {},
    formField('Name', h('input', { class: 'input', placeholder: 'Organization name', oninput: (e) => state.name = e.target.value })),
    formField('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Intelligence Agency', 'Research Organization', 'Secret Society', 'Trade Guild', 'Military Order', 'Criminal Syndicate', 'Religious Order', 'Corporation', 'Other'].map(t => h('option', { value: t }, t)))),
    formField('Faction', h('input', { class: 'input', placeholder: 'Affiliated faction', oninput: (e) => state.faction = e.target.value })),
    formField('Leader', h('input', { class: 'input', placeholder: 'Leader name', oninput: (e) => state.leader = e.target.value })),
    formField('Description', expandableText({ placeholder: 'Describe this organization...', label: 'Organization Description', oninput: (e) => state.description = e.target.value })),
  );
  showModal('Add New Organization', content, () => {
    if (!state.name.trim()) return;
    organizations.push({ id: `org${Date.now()}`, name: state.name, type: state.type, faction: state.faction, leader: state.leader, members: 'Unknown', purpose: '', secrecy: 50, influence: 30, status: 'active', color: '#6366f1', description: state.description });
    const container = document.querySelector('.main-content');
    if (container) renderPreservingScroll(container, () => { container.innerHTML = ''; renderOrganizationPlanner(container); });
    persistState("organizations", organizations);
  });
}
// modal + field now come from the shared, accessible ui/modal.js
