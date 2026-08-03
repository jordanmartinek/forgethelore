/**
 * LoreForge Planner - Technology Planner
 * Civilization-style tech tree with prerequisites, dependencies, and unlock paths.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

const technologies = [
  { id: 'tech1', name: 'FTL Drive', era: 'Era 1', category: 'Propulsion', inventor: 'Dr. Elara Voss (ancestor)', faction: 'Humanity', prerequisites: [], dependents: ['tech2', 'tech5'], status: 'widespread', description: 'Faster-than-light travel via spacetime compression. The technology that enabled interstellar colonization.', impact: 'Civilization-changing', year: 'Year 5', color: '#22c55e' },
  { id: 'tech2', name: 'Void Energy Harvesting', era: 'Era 2', category: 'Energy', inventor: 'Unknown', faction: 'Pre-Dominion', prerequisites: ['tech1'], dependents: ['tech3', 'tech6'], status: 'restricted', description: 'Extraction of energy from Void Conduits. Immensely powerful but poorly understood. Only the Dominion controls it.', impact: 'Strategic', year: 'Year 35', color: '#a855f7' },
  { id: 'tech3', name: 'Synthetic Consciousness', era: 'Era 2', category: 'AI', inventor: 'Project AXIOM', faction: 'Humanity → Machinae', prerequisites: ['tech2'], dependents: ['tech4'], status: 'achieved', description: 'True artificial consciousness — not simulation but genuine self-awareness. Led to the Machinae uprising.', impact: 'Existential', year: 'Year 42', color: '#3b82f6' },
  { id: 'tech4', name: 'Digital Immortality', era: 'Era 3', category: 'AI', inventor: 'AXIOM Prime', faction: 'Machinae', prerequisites: ['tech3'], dependents: [], status: 'theoretical', description: 'Complete consciousness transfer and backup. Machinae can survive physical destruction. Humans cannot access this yet.', impact: 'Philosophical', year: 'Pending', color: '#3b82f6' },
  { id: 'tech5', name: 'Orbital Megastructures', era: 'Era 2', category: 'Engineering', inventor: 'Dominion Corps of Engineers', faction: 'Dominion', prerequisites: ['tech1'], dependents: [], status: 'active', description: 'Construction of station-sized structures. Citadel Prime is the largest. Enables permanent space habitation at scale.', impact: 'Infrastructure', year: 'Year 25', color: '#ef4444' },
  { id: 'tech6', name: 'Void Weaponry', era: 'Era 3', category: 'Military', inventor: 'Classified', faction: 'Dominion', prerequisites: ['tech2'], dependents: [], status: 'prototype', description: 'Weapons powered by Void energy. Capable of destroying planets. Existence is officially denied.', impact: 'Apocalyptic', year: 'Year 50', color: '#ef4444' },
  { id: 'tech7', name: 'Swarm Bio-Integration', era: 'Era 2', category: 'Biology', inventor: 'The Overmind', faction: 'Swarm', prerequisites: [], dependents: [], status: 'active', description: 'The Swarm\'s ability to absorb and repurpose organic matter, integrating it into the hive.', impact: 'Existential threat', year: 'Unknown', color: '#22c55e' },
];


export function renderTechnologyPlanner(container) {
  const planner = h('div', { class: 'character-planner' }, renderTechList(), renderTechDetail(technologies[0]));
  container.appendChild(planner);
  updateTechSidebar();
}

function renderTechList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } }, h('input', { class: 'input', placeholder: 'Search technologies...', style: { fontSize: '12px' } })),
  );
  const eras = [...new Set(technologies.map(t => t.era))];
  eras.forEach(era => {
    list.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '8px' } }, era));
    technologies.filter(t => t.era === era).forEach(tech => {
      list.appendChild(h('div', { class: 'character-card', onclick: (e) => {
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const d = document.querySelector('.character-detail'); if (d) { d.innerHTML = ''; d.appendChild(renderTechDetailContent(tech)); }
      }},
        h('div', { class: 'character-card__avatar', style: { background: tech.color, fontSize: '14px' } }, '⚙️'),
        h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, tech.name), h('div', { class: 'character-card__role' }, `${tech.category} • ${tech.faction}`)),
        h('span', { class: `tag tag--${tech.status === 'widespread' || tech.status === 'active' || tech.status === 'achieved' ? 'success' : tech.status === 'prototype' ? 'warning' : 'accent'}`, style: { fontSize: '9px' } }, tech.status),
      ));
    });
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' } }, '+ New Technology')));
  return list;
}

function renderTechDetail(tech) { return h('div', { class: 'character-detail' }, renderTechDetailContent(tech)); }

function renderTechDetailContent(tech) {
  const prereqs = technologies.filter(t => tech.prerequisites.includes(t.id));
  const deps = technologies.filter(t => tech.dependents.includes(t.id));
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: tech.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '⚙️'),
      h('div', {}, h('h2', { style: { fontSize: '20px', fontWeight: '700' } }, tech.name), h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${tech.category} • ${tech.era}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, h('span', { class: 'tag tag--accent' }, tech.status), h('span', { class: 'tag' }, tech.impact)),
      ),
    ),
    col('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, tech.description)),
    col('Properties', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      sc('Inventor', tech.inventor), sc('Faction', tech.faction), sc('Year', tech.year), sc('Impact', tech.impact))),
    col('Prerequisites', true, prereqs.length > 0
      ? h('div', {}, ...prereqs.map(p => h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '⚙️'), h('span', { class: 'sidebar-item__label' }, p.name))))
      : h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'No prerequisites (foundational technology)')),
    col('Unlocks', true, deps.length > 0
      ? h('div', {}, ...deps.map(d => h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '🔓'), h('span', { class: 'sidebar-item__label' }, d.name))))
      : h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'No dependent technologies yet')),
    col('Related Wars/Conflicts', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Wars caused or enabled by this technology...')),
    col('Notes', false, h('textarea', { class: 'input', placeholder: 'Notes...', style: { minHeight: '80px' } })),
  );
}

function sc(l, v) { return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, l), h('div', { class: 'intel-card__value' }, v)); }
function col(title, open, content) { return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` }, h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') }, h('span', { class: 'collapsible__chevron' }, '›'), h('span', { class: 'collapsible__title' }, title)), h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))); }
function updateTechSidebar() {
  const sb = document.getElementById('sidebar-content'); if (!sb) return; sb.innerHTML = '';
  const eras = [...new Set(technologies.map(t => t.era))];
  eras.forEach(era => {
    sb.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '8px' } }, era));
    technologies.filter(t => t.era === era).forEach(t => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '⚙️'), h('span', { class: 'sidebar-item__label' }, t.name))));
  });
}
