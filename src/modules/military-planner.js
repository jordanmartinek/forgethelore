/**
 * LoreForge Planner - Military Planner
 * Manage fleets, armies, units, campaigns, doctrines, and military assets.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

const militaryForces = [
  { id: 'mil1', name: 'Dominion 1st Fleet', type: 'Space Fleet', faction: 'The Dominion', commander: 'Fleet Admiral Koss', strength: 95, ships: 340, personnel: '1.2 million', status: 'deployed', doctrine: 'Overwhelming force', location: 'Kepler Array', description: 'The Dominion\'s primary strike force. Capable of planetary bombardment and system-wide blockades.', color: '#ef4444' },
  { id: 'mil2', name: 'Dominion 3rd Fleet', type: 'Space Fleet', faction: 'The Dominion', commander: 'Admiral Chen', strength: 70, ships: 180, personnel: '600,000', status: 'patrol', doctrine: 'Defensive perimeter', location: 'Core Systems', description: 'Home defense fleet. Guards Citadel Prime and core infrastructure.', color: '#ef4444' },
  { id: 'mil3', name: 'Machinae Vanguard', type: 'AI Strike Force', faction: 'Machinae Collective', commander: 'Unit-7', strength: 80, ships: 500, personnel: '0 (automated)', status: 'active', doctrine: 'Infiltration & precision', location: 'Distributed', description: 'Automated warships controlled by distributed AI. No crew, no morale, no mercy. Emphasis on electronic warfare.', color: '#3b82f6' },
  { id: 'mil4', name: 'Swarm Tendril Alpha', type: 'Bio-Fleet', faction: 'The Swarm', commander: 'The Overmind', strength: 85, ships: 0, personnel: '~10 billion organisms', status: 'advancing', doctrine: 'Consume and assimilate', location: 'Sector 7', description: 'A massive biological armada. Ships are living organisms. Weapons are evolved. Numbers are infinite.', color: '#22c55e' },
  { id: 'mil5', name: 'Colonial Defense Force', type: 'Militia Fleet', faction: 'Free Colonies', commander: 'Captain Sera', strength: 35, ships: 60, personnel: '80,000', status: 'mobilizing', doctrine: 'Guerrilla warfare', location: 'Terra Nova orbit', description: 'An underfunded, outgunned volunteer navy. Relies on hit-and-run tactics, local knowledge, and desperation.', color: '#f59e0b' },
];


const campaigns = [
  { id: 'camp1', name: 'Operation Void Gate', status: 'active', faction: 'Dominion', objective: 'Secure The Breach', progress: 45 },
  { id: 'camp2', name: 'Sector 7 Containment', status: 'failing', faction: 'All', objective: 'Stop Swarm expansion', progress: 20 },
  { id: 'camp3', name: 'Project Ghost', status: 'covert', faction: 'Machinae', objective: 'Infiltrate Citadel Prime', progress: 70 },
];

export function renderMilitaryPlanner(container) {
  const planner = h('div', { class: 'character-planner' }, renderMilitaryList(), renderMilitaryDetail(militaryForces[0]));
  container.appendChild(planner);
  updateMilitarySidebar();
}

function renderMilitaryList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } }, h('input', { class: 'input', placeholder: 'Search military forces...', style: { fontSize: '12px' } })),
  );
  list.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '4px' } }, 'Forces'));
  militaryForces.forEach(mil => {
    list.appendChild(h('div', { class: 'character-card', onclick: (e) => {
      document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
      e.currentTarget.classList.add('character-card--active');
      const d = document.querySelector('.character-detail'); if (d) { d.innerHTML = ''; d.appendChild(renderMilitaryDetailContent(mil)); }
    }},
      h('div', { class: 'character-card__avatar', style: { background: mil.color, fontSize: '14px' } }, '⚔️'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, mil.name), h('div', { class: 'character-card__role' }, `${mil.type} • ${mil.faction}`)),
      h('span', { class: `tag tag--${mil.status === 'deployed' || mil.status === 'active' ? 'success' : mil.status === 'advancing' ? 'warning' : 'accent'}`, style: { fontSize: '9px' } }, mil.status),
    ));
  });
  list.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '12px' } }, 'Campaigns'));
  campaigns.forEach(c => {
    list.appendChild(h('div', { class: 'character-card' },
      h('div', { class: 'character-card__avatar', style: { background: 'var(--surface-4)', fontSize: '14px' } }, '🎯'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, c.name), h('div', { class: 'character-card__role' }, `${c.faction} • ${c.objective}`)),
      h('span', { class: `tag tag--${c.status === 'active' ? 'success' : c.status === 'failing' ? 'danger' : 'accent'}`, style: { fontSize: '9px' } }, `${c.progress}%`),
    ));
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: openAddMilitaryModal }, '+ New Force / Campaign')));
  return list;
}

function renderMilitaryDetail(mil) { return h('div', { class: 'character-detail' }, renderMilitaryDetailContent(mil)); }

function renderMilitaryDetailContent(mil) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: mil.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '⚔️'),
      h('div', {}, h('h2', { style: { fontSize: '20px', fontWeight: '700' } }, mil.name), h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${mil.type} • ${mil.faction}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, h('span', { class: 'tag tag--accent' }, mil.status), h('span', { class: 'tag' }, mil.location)),
      ),
    ),
    col('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, mil.description)),
    col('Force Composition', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      sc('Commander', mil.commander), sc('Ships/Units', String(mil.ships || 'N/A')), sc('Personnel', mil.personnel), sc('Doctrine', mil.doctrine))),
    col('Combat Strength', true, h('div', {},
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } }, h('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Overall Strength'), h('span', { style: { fontSize: '14px', fontWeight: '700' } }, `${mil.strength}%`)),
      h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${mil.strength}%`, background: mil.strength > 70 ? 'var(--success)' : mil.strength > 40 ? 'var(--warning)' : 'var(--danger)' } })))),
    col('Current Orders', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Active missions and deployment orders...')),
    col('Battle History', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Past engagements and outcomes...')),
    col('Supply & Logistics', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Supply lines, resources, morale...')),
    col('Notes', false, h('textarea', { class: 'input', placeholder: 'Notes...', style: { minHeight: '80px' } })),
  );
}

function sc(l, v) { return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, l), h('div', { class: 'intel-card__value' }, v)); }
function col(title, open, content) { return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` }, h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') }, h('span', { class: 'collapsible__chevron' }, '›'), h('span', { class: 'collapsible__title' }, title)), h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))); }
function updateMilitarySidebar() {
  const sb = document.getElementById('sidebar-content'); if (!sb) return; sb.innerHTML = '';
  sb.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)' } }, 'Forces'));
  militaryForces.forEach(mil => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '⚔️'), h('span', { class: 'sidebar-item__label' }, mil.name))));
  sb.appendChild(h('div', { style: { height: '1px', background: 'var(--border-subtle)', margin: '8px 0' } }));
  sb.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)' } }, 'Campaigns'));
  campaigns.forEach(c => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '🎯'), h('span', { class: 'sidebar-item__label' }, c.name), h('span', { class: 'sidebar-item__count' }, `${c.progress}%`))));
}


function openAddMilitaryModal() {
  const state = { name: '', type: 'Space Fleet', faction: '', commander: '', description: '' };
  const content = h('div', {},
    ff('Name', h('input', { class: 'input', placeholder: 'Force name', oninput: (e) => state.name = e.target.value })),
    ff('Type', h('select', { class: 'input', onchange: (e) => state.type = e.target.value },
      ...['Space Fleet', 'Ground Army', 'AI Strike Force', 'Bio-Fleet', 'Militia', 'Special Forces', 'Defense Force'].map(t => h('option', { value: t }, t)))),
    ff('Faction', h('input', { class: 'input', placeholder: 'Faction', oninput: (e) => state.faction = e.target.value })),
    ff('Commander', h('input', { class: 'input', placeholder: 'Commanding officer', oninput: (e) => state.commander = e.target.value })),
    ff('Description', h('textarea', { class: 'input', placeholder: 'Describe this force...', oninput: (e) => state.description = e.target.value })),
  );
  modal('Add New Military Force', content, () => {
    if (!state.name.trim()) return;
    militaryForces.push({ id: `mil${Date.now()}`, name: state.name, type: state.type, faction: state.faction, commander: state.commander, strength: 50, ships: 0, personnel: 'Unknown', status: 'active', doctrine: 'Unknown', location: 'Unknown', description: state.description, color: '#6366f1' });
    const container = document.querySelector('.main-content');
    if (container) { container.innerHTML = ''; renderMilitaryPlanner(container); }
    appStore.setState({ saveStatus: 'saving' }); setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 500);
  });
}
function ff(label, input) { return h('div', { style: { marginBottom: '12px' } }, h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label), input); }
function modal(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay'); if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' }, h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, title), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content), h('div', { class: 'modal__footer' }, h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'), h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save'))));
  document.body.appendChild(overlay);
}
