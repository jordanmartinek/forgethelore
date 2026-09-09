/**
 * LoreForge Planner - World Hub (worldbuilding landing page)
 *
 * PRIORITY 6 / §10 of the redesign: give worldbuilding HIERARCHICAL DISCOVERY.
 * Instead of exposing a dozen sibling planner modules at once, this landing page
 * presents a small set of intuitive categories — People, Places, Cultures,
 * Factions, History, Systems, Map — each a calm card with a live count that
 * routes into the existing module. A new user understands the system instantly;
 * a power user still reaches everything (every underlying module remains a
 * routable primary/advanced entry in the registry, and each card links straight
 * to it).
 *
 * This adds no new data model: counts come straight from repo.list(Collections)
 * and routing is a plain appStore.setState({ activeModule }).
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';

const go = (id) => appStore.setState({ activeModule: id });

/** Count records across one or more collections. */
function count(...collections) {
  return collections.reduce((n, c) => n + repo.list(c).length, 0);
}

/**
 * Category cards. Each groups related world modules; `module` is the primary
 * destination and `count` is a live tally shown as a quiet subtitle.
 */
function categories() {
  return [
    {
      icon: '👤', title: 'People', module: 'characters',
      desc: 'Characters, species and the important figures of your world.',
      count: count(Collections.CHARACTERS, Collections.PIECES, Collections.SPECIES),
      unit: 'people',
    },
    {
      icon: '📍', title: 'Places', module: 'locations',
      desc: 'Cities, regions, buildings and the places your story happens.',
      count: count(Collections.LOCATIONS),
      unit: 'places',
    },
    {
      icon: '🕯️', title: 'Cultures', module: 'religions',
      desc: 'Languages, religions and the traditions that shape your world.',
      count: count(Collections.LANGUAGES, Collections.RELIGIONS),
      unit: 'entries', links: [
        { label: 'Languages', module: 'languages' },
        { label: 'Religions', module: 'religions' },
      ],
    },
    {
      icon: '⚔️', title: 'Factions', module: 'factions',
      desc: 'Organizations, governments and military powers.',
      count: count(Collections.FACTIONS, Collections.BOARD_FACTIONS, Collections.ORGANIZATIONS, Collections.MILITARY, Collections.POLITICS),
      unit: 'groups', links: [
        { label: 'Organizations', module: 'organizations' },
        { label: 'Politics', module: 'politics' },
        { label: 'Military', module: 'military' },
      ],
    },
    {
      icon: '⏳', title: 'History', module: 'timeline',
      desc: 'Timeline, historical events and the shape of your continuity.',
      count: count(Collections.TIMELINE, Collections.SCENES),
      unit: 'events',
    },
    {
      icon: '⚙️', title: 'Systems', module: 'technology',
      desc: 'Magic, technology and the resources that power your world.',
      count: count(Collections.TECHNOLOGIES, Collections.RESOURCES),
      unit: 'systems', links: [
        { label: 'Technology', module: 'technology' },
        { label: 'Resources', module: 'resources' },
      ],
    },
    {
      icon: '🗺️', title: 'Map', module: 'world-map',
      desc: 'Draw and explore the geography of your world.',
      count: null,
    },
  ];
}

export function renderWorldHub(container) {
  const cats = categories();
  const total = cats.reduce((n, c) => n + (c.count || 0), 0);

  const card = (cat) => h('button', {
    class: 'card card--interactive world-card',
    onclick: () => go(cat.module),
    title: `Open ${cat.title}`,
  },
    h('span', { class: 'world-card__icon' }, cat.icon),
    h('span', { class: 'world-card__title' }, cat.title),
    h('span', { class: 'world-card__desc' }, cat.desc),
    cat.count != null
      ? h('span', { class: 'world-card__count' }, `${cat.count} ${cat.unit}`)
      : null,
    cat.links
      ? h('span', { class: 'world-card__links' },
          ...cat.links.map((l, i) => h('span', {},
            i > 0 ? h('span', { class: 'world-card__sep' }, ' · ') : null,
            h('a', {
              href: '#', class: 'world-card__link',
              onclick: (e) => { e.preventDefault(); e.stopPropagation(); go(l.module); },
            }, l.label),
          )))
      : null,
  );

  container.appendChild(
    h('div', { class: 'world-hub' },
      h('div', { class: 'world-hub__head' },
        h('h1', { class: 'world-hub__title' }, 'World'),
        h('p', { class: 'world-hub__subtitle' }, total > 0
          ? `Your world at a glance — ${total} entities across your world.`
          : 'Your world at a glance. Start anywhere below.'),
      ),

      h('div', { class: 'world-hub__grid' },
        ...cats.map(card),
      ),

      // A calm route to the full, unfiltered builder for power users.
      h('div', { class: 'world-hub__footer' },
        h('button', { class: 'btn btn--ghost', onclick: () => go('world-builder') }, 'Open the full World Builder →'),
      ),
    ),
  );
}
