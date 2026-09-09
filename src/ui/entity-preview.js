/**
 * LoreForge Planner - Contextual Entity Preview
 *
 * §11 of the redesign: let writers interact with story entities without leaving
 * their current surface. Given an entity id OR name, this builds a small
 * contextual card — icon, type, a few key facts, and an "Open" button that
 * routes to the entity's owning module — and helpers to attach it to any element
 * as a hover/click affordance.
 *
 * It reads through the unified entity graph (core/entities.buildEntityMap), so a
 * name like "Blackwater Lighthouse" or a piece id both resolve to the same rich
 * record. No new data model.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { buildEntityMap, resolveIdByName } from '../core/entities.js';

const TYPE_LABEL = {
  character: 'Character', piece: 'Character', faction: 'Faction', location: 'Location',
  scene: 'Scene', species: 'Species', technology: 'Technology',
  organization: 'Organization', religion: 'Religion', mystery: 'Mystery',
};

/** Resolve an entity by id first, then by name. Returns the Entity or null. */
export function resolveEntity(idOrName, preferType) {
  const map = buildEntityMap();
  if (map.has(idOrName)) return map.get(idOrName);
  const id = resolveIdByName(map, idOrName, preferType);
  return id ? map.get(id) : null;
}

/** A few human-friendly facts for an entity, by type. */
function factsFor(ent) {
  const r = ent.raw || {};
  const facts = [];
  const add = (label, value) => { if (value) facts.push([label, String(value)]); };
  switch (ent.type) {
    case 'character':
      add('Role', r.role); add('Faction', r.faction); add('Goal', r.goals);
      break;
    case 'piece':
      add('Role', r.role); add('Momentum', r.momentum); add('Goal', r.goal);
      break;
    case 'faction':
      add('Type', r.type); add('Leader', r.leader); add('Goal', r.goal);
      break;
    case 'location':
      add('Type', r.type); add('Region', r.region); add('Faction', r.faction);
      break;
    case 'mystery':
      add('Question', r.question);
      break;
    default:
      add('Type', r.type); add('Region', r.region);
  }
  // Fall back to a short description snippet if we found nothing structured.
  if (!facts.length && (r.description || r.desc)) {
    const d = String(r.description || r.desc);
    facts.push(['', d.length > 120 ? `${d.slice(0, 119)}…` : d]);
  }
  return facts.slice(0, 3);
}

/**
 * Build the contextual card node for an entity.
 * @param {object} ent  a resolved Entity
 * @param {() => void} [onOpen] extra callback after routing (e.g. close popover)
 */
export function entityPreviewCard(ent, onOpen) {
  const facts = factsFor(ent);
  return h('div', { class: 'entity-preview', role: 'dialog', 'aria-label': `${ent.name} preview` },
    h('div', { class: 'entity-preview__head' },
      h('span', { class: 'entity-preview__icon', style: { background: ent.color || 'var(--surface-3)' } }, ent.icon || '📦'),
      h('div', { class: 'entity-preview__id' },
        h('div', { class: 'entity-preview__name' }, ent.name),
        h('div', { class: 'entity-preview__type' }, TYPE_LABEL[ent.type] || ent.type),
      ),
    ),
    facts.length
      ? h('div', { class: 'entity-preview__facts' },
          ...facts.map(([label, value]) => h('div', { class: 'entity-preview__fact' },
            label ? h('span', { class: 'entity-preview__fact-label' }, label) : null,
            h('span', { class: 'entity-preview__fact-value' }, value),
          )))
      : h('div', { class: 'entity-preview__empty' }, 'No details yet.'),
    h('button', {
      class: 'btn btn--sm btn--primary entity-preview__open',
      onclick: () => { appStore.setState({ activeModule: ent.module || 'dashboard' }); if (onOpen) onOpen(); },
    }, `Open ${TYPE_LABEL[ent.type] || 'entity'}`),
  );
}

// ─── Popover management (one at a time) ──────────────────────────────────────
let openPopover = null;
function closePopover() {
  if (openPopover) { openPopover.remove(); openPopover = null; document.removeEventListener('click', onDocClick, true); }
}
function onDocClick(e) {
  if (openPopover && !openPopover.contains(e.target)) closePopover();
}

/**
 * Show the preview popover anchored near a target element.
 * @param {string} idOrName
 * @param {HTMLElement} anchor
 */
export function showEntityPreview(idOrName, anchor) {
  const ent = resolveEntity(idOrName);
  closePopover();
  if (!ent) return; // unknown entity — no popover (the chip still routes on click elsewhere)

  const rect = anchor.getBoundingClientRect();
  const pop = h('div', {
    class: 'entity-popover',
    style: {
      position: 'fixed',
      top: `${Math.min(rect.bottom + 6, window.innerHeight - 200)}px`,
      left: `${Math.min(rect.left, window.innerWidth - 300)}px`,
    },
  }, entityPreviewCard(ent, closePopover));

  document.body.appendChild(pop);
  openPopover = pop;
  setTimeout(() => document.addEventListener('click', onDocClick, true), 10);
}

/**
 * Turn a plain string into an interactive entity mention: a subtle chip that
 * opens the preview on click. Falls back to plain text if the entity is unknown.
 * @param {string} name
 * @param {object} [opts] { preferType, label }
 */
export function entityMention(name, opts = {}) {
  const label = opts.label || name;
  const ent = resolveEntity(name, opts.preferType);
  if (!ent) return h('span', {}, label);
  return h('button', {
    class: 'entity-mention',
    type: 'button',
    title: `Preview ${ent.name}`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); showEntityPreview(ent.id, e.currentTarget); },
  },
    h('span', { class: 'entity-mention__dot', style: { background: ent.color || 'var(--accent-primary)' } }),
    label,
  );
}
