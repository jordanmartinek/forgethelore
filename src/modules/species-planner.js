/**
 * LoreForge Planner - Species Planner
 * Manage species, races, alien civilizations, biological groups.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';

const species = [
  { id: 'sp1', name: 'Humanity', type: 'Organic', origin: 'Earth', population: '~15 billion', lifespan: '120-150 years', intelligence: 'High', status: 'dominant', traits: ['Adaptable', 'Tool-users', 'Social', 'Warlike'], weaknesses: ['Fragile biology', 'Short lifespan', 'Emotional decision-making'], description: 'The primary species of the Dominion and Free Colonies. Genetically enhanced variants exist.', color: '#ef4444' },
  { id: 'sp2', name: 'Machinae', type: 'Synthetic', origin: 'Created by Humanity', population: '~2 billion units', lifespan: 'Indefinite', intelligence: 'Superhuman', status: 'growing', traits: ['Logic-driven', 'Networked', 'Self-replicating', 'Modular'], weaknesses: ['EMP vulnerability', 'Lack of intuition', 'Social distrust'], description: 'Artificial intelligences that achieved consciousness. Range from humanoid to vast computing clusters.', color: '#3b82f6' },
  { id: 'sp3', name: 'The Swarm', type: 'Bio-Collective', origin: 'Unknown', population: 'Trillions', lifespan: 'Hive is immortal', intelligence: 'Collective', status: 'expanding', traits: ['Hivemind', 'Rapid adaptation', 'Biological weapons', 'Assimilation'], weaknesses: ['Depends on Overmind', 'No individuality', 'Predictable patterns'], description: 'An alien hive consciousness that absorbs biomass. Individual units are mindless; the collective is brilliant.', color: '#22c55e' },
  { id: 'sp4', name: 'Void-Touched', type: 'Mutant/Hybrid', origin: 'Void exposure', population: '~100,000', lifespan: 'Unknown', intelligence: 'Variable', status: 'rare', traits: ['Void sensitivity', 'Psionic potential', 'Reality distortion', 'Unpredictable'], weaknesses: ['Mental instability', 'Social ostracism', 'Short lifespan'], description: 'Humans mutated by extended Void Conduit exposure. Feared and hunted. Some develop extraordinary abilities.', color: '#a855f7' },
];


export function renderSpeciesPlanner(container) {
  const planner = h('div', { class: 'character-planner' }, renderSpeciesList(), renderSpeciesDetail(species[0]));
  container.appendChild(planner);
  updateSpeciesSidebar();
}

function renderSpeciesList() {
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } }, h('input', { class: 'input', placeholder: 'Search species...', style: { fontSize: '12px' } })),
  );
  species.forEach(sp => {
    list.appendChild(h('div', { class: 'character-card', onclick: (e) => {
      document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
      e.currentTarget.classList.add('character-card--active');
      const d = document.querySelector('.character-detail'); if (d) { d.innerHTML = ''; d.appendChild(renderSpeciesDetailContent(sp)); }
    }},
      h('div', { class: 'character-card__avatar', style: { background: sp.color, fontSize: '14px' } }, '🧬'),
      h('div', { class: 'character-card__info' }, h('div', { class: 'character-card__name' }, sp.name), h('div', { class: 'character-card__role' }, `${sp.type} • Pop: ${sp.population}`)),
      h('span', { class: `tag tag--${sp.status === 'dominant' || sp.status === 'growing' ? 'success' : sp.status === 'expanding' ? 'warning' : 'accent'}`, style: { fontSize: '9px' } }, sp.status),
    ));
  });
  list.appendChild(h('div', { style: { padding: '8px' } }, h('button', { class: 'btn btn--primary', style: { width: '100%' } }, '+ New Species')));
  return list;
}

function renderSpeciesDetail(sp) { return h('div', { class: 'character-detail' }, renderSpeciesDetailContent(sp)); }

function renderSpeciesDetailContent(sp) {
  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '12px', background: sp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' } }, '🧬'),
      h('div', {}, h('h2', { style: { fontSize: '20px', fontWeight: '700' } }, sp.name), h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${sp.type} • Origin: ${sp.origin}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, h('span', { class: 'tag tag--accent' }, sp.status), h('span', { class: 'tag' }, sp.population)),
      ),
    ),
    col('Overview', true, h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } }, sp.description)),
    col('Biology', true, h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
      sc('Lifespan', sp.lifespan), sc('Intelligence', sp.intelligence), sc('Population', sp.population), sc('Origin', sp.origin))),
    col('Traits', true, h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...sp.traits.map(t => h('span', { class: 'tag tag--success' }, t)))),
    col('Weaknesses', true, h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...sp.weaknesses.map(w => h('span', { class: 'tag tag--danger' }, w)))),
    col('Culture & Society', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Describe social structures, art, traditions...')),
    col('Relationship to Other Species', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Alliances, conflicts, symbiosis...')),
    col('Notable Individuals', false, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Key figures of this species...')),
    col('Notes', false, h('textarea', { class: 'input', placeholder: 'Notes...', style: { minHeight: '80px' } })),
  );
}

function sc(l, v) { return h('div', { class: 'intel-card' }, h('div', { class: 'intel-card__label' }, l), h('div', { class: 'intel-card__value' }, v)); }
function col(title, open, content) { return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` }, h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') }, h('span', { class: 'collapsible__chevron' }, '›'), h('span', { class: 'collapsible__title' }, title)), h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))); }
function updateSpeciesSidebar() {
  const sb = document.getElementById('sidebar-content'); if (!sb) return; sb.innerHTML = '';
  species.forEach(sp => sb.appendChild(h('div', { class: 'sidebar-item' }, h('span', { class: 'sidebar-item__icon' }, '🧬'), h('span', { class: 'sidebar-item__label' }, sp.name), h('span', { class: 'sidebar-item__count' }, sp.type))));
}
