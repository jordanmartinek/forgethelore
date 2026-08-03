/**
 * LoreForge Planner - Organization Planner
 * Manage organizations, guilds, companies, secret societies, agencies.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

const organizations = [
  { id: 'org1', name: 'Dominion Intelligence Bureau', type: 'Intelligence Agency', faction: 'The Dominion', leader: 'Director Sylas Crane', members: '~50,000', purpose: 'Espionage, counter-intelligence, internal security', secrecy: 95, influence: 85, status: 'active', color: '#ef4444', description: 'The Dominion\'s shadow arm. Operates black sites, maintains surveillance networks, and eliminates threats before they materialize.' },
  { id: 'org2', name: 'Void Research Institute', type: 'Research Organization', faction: 'Independent', leader: 'Dr. Orin Voss', members: '~2,000', purpose: 'Study Void energy and Conduit technology', secrecy: 40, influence: 60, status: 'active', color: '#a855f7', description: 'Officially neutral scientific body. In practice, every faction tries to infiltrate it. Dr. Voss maintains independence through indispensability.' },
  { id: 'org3', name: 'The Unseen', type: 'Secret Society', faction: 'Unknown', leader: 'Unknown', members: 'Unknown', purpose: 'Unknown — possibly Void worship', secrecy: 100, influence: 50, status: 'active', color: '#1e1e2a', description: 'A rumored organization with members in every faction. Their goals are unclear but they seem to be guiding events toward a specific outcome.' },
  { id: 'org4', name: 'Stellar Merchants Guild', type: 'Trade Guild', faction: 'Nexus', leader: 'Guildmaster Riven Khol', members: '~500,000', purpose: 'Control interstellar trade routes', secrecy: 20, influence: 70, status: 'active', color: '#06b6d4', description: 'The economic backbone of neutral space. Controls shipping lanes, enforces trade contracts, and profits from every conflict.' },
];


export function renderOrganizationPlanner(container) {
  const planner = h('div', { class: 'character-planner' }, renderOrgList(), renderOrgDetail(organizations[0]));
  container.appendChild(planner);
  updateOrgSidebar();
}

function renderOrgList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } }, h('input', { class: 'input', placeholder: 'Search organizations...', style: { fontSize: '12px' } })),
  );
  organizations.forEach(org => {
    list.appendChild(h('div', { class: 'character-card', onclick: (e) => {
      document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
      e.currentTarget.classList.add('character-card--active');
      const d = document.querySelector('.character-detail'); if (d) { d.innerHTML = ''; d.appendChild(renderOrgDetailContent(org)); }
    }},
      h('div', { class: 'character-card__avatar', style: { background: org.color, fontSize: '14px' } }, '🏢'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, org.name), h('div', { class: 'character-card__role' }, `${org.type} • ${org.faction}`)),
      h('span', { class: 'tag tag--accent', style: { fontSize: '9px' } }, org.status),
    ));
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' } }, '+ New Organization')));
  return list;
}

function renderOrgDetail(org) { return h('div', { class: 'character-detail' }, renderOrgDetailContent(org)); }

function renderOrgDetailContent(org) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: org.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '🏢'),
      h('div', {}, h('h2', { style: { fontSize: '20px', fontWeight: '700' } }, org.name), h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${org.type} • ${org.faction}`)),
    ),
    col('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, org.description)),
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
