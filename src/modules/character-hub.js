/**
 * LoreForge Planner - Character Hub (unified character experience)
 *
 * PRIORITY 3 of the redesign (§9): make a character a single, rich story entity
 * instead of forcing the writer across five separate modules to understand one
 * person. This hub COMPOSES the existing, battle-tested renderers rather than
 * reimplementing them:
 *
 *   Overview      → renderCharacterDetailContent(char)   (character-planner.js)
 *   Arc           → renderArcDetailContent(piece)        (character-arc.js)
 *   Relationships → progression.getRelationshipsFor(pieceId) + a light list
 *   Notes         → the planner record's free-text notes field
 *
 * The character-planner `characters` records are name-based; the arc/relationship
 * engines key on board `pieces`. We reconcile a character to its matching board
 * piece BY NAME (entities.resolveIdByName), exactly as character-interview does,
 * and degrade gracefully (with a link to the underlying tool) when there's no
 * match. Creating/editing a character routes to the existing Characters module,
 * so this hub adds no duplicate CRUD.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';
import { buildEntityMap, resolveIdByName, getPieces, getBoardFactions, getFactionData } from '../core/entities.js';
import { getRelationshipsFor, RELATIONSHIP_DIMENSIONS } from '../core/progression.js';
import { renderCharacterDetailContent } from './character-planner.js';
import { renderArcDetailContent } from './character-arc.js';
import { entityMention } from '../ui/entity-preview.js';

// Session UI state (not persisted).
let selectedId = null;
let activeTab = 'overview';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'arc', label: 'Arc', icon: '📈' },
  { id: 'relationships', label: 'Relationships', icon: '💫' },
  { id: 'notes', label: 'Notes', icon: '📝' },
];

function characters() {
  return repo.list(Collections.CHARACTERS);
}

/** All faction sources, for the roster's color dots. */
function factionColorMap() {
  const map = {};
  [...getBoardFactions(), ...getFactionData()].forEach((f) => { map[f.name] = f.color; });
  return map;
}

/** Reconcile a character record to its board piece (by name). */
function pieceForCharacter(char) {
  if (!char) return null;
  const map = buildEntityMap();
  const id = resolveIdByName(map, char.name, 'piece');
  return id ? getPieces().find((p) => p.id === id) || null : null;
}

const go = (id) => appStore.setState({ activeModule: id });

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
export function renderCharacterHub(container) {
  const chars = characters();
  if (selectedId && !chars.some((c) => c.id === selectedId)) selectedId = null;
  if (!selectedId && chars.length) selectedId = chars[0].id;

  if (!chars.length) {
    container.appendChild(renderEmptyState());
    return;
  }

  container.appendChild(
    h('div', { class: 'character-planner' },
      renderRoster(chars),
      renderDetail(chars.find((c) => c.id === selectedId) || chars[0]),
    ),
  );
}

/** Empty state — teaches what the feature is for (§21). */
function renderEmptyState() {
  return h('div', { class: 'character-detail', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    h('div', { class: 'hub-empty' },
      h('div', { class: 'hub-empty__icon' }, '👤'),
      h('div', { class: 'hub-empty__title' }, 'Your story\u2019s people will live here'),
      h('div', { class: 'hub-empty__body' }, 'Create a character to see their overview, arc, relationships and notes together in one place.'),
      h('button', { class: 'btn btn--primary', onclick: () => go('characters') }, '+ Create Character'),
      h('div', { class: 'hub-empty__hint' }, 'Or capture an idea in Brainstorm and turn it into a character later.'),
    ),
  );
}

// ─── Roster ──────────────────────────────────────────────────────────────────
function renderRoster(chars) {
  const colors = factionColorMap();
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px' } },
      h('input', {
        class: 'input', placeholder: 'Search characters…', style: { fontSize: '12px' },
        oninput: (e) => {
          const q = e.target.value.toLowerCase();
          list.querySelectorAll('.character-card').forEach((card) => {
            card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
          });
        },
      }),
    ),
  );

  chars.forEach((char) => {
    const color = colors[char.faction] || char.color || 'var(--accent-primary)';
    list.appendChild(h('div', {
      class: `character-card ${char.id === selectedId ? 'character-card--active' : ''}`,
      onclick: () => { selectedId = char.id; activeTab = 'overview'; rerender(); },
    },
      h('div', { class: 'character-card__avatar', style: { background: color, color: 'white' } }, (char.name || '?')[0]),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, char.name || 'Unnamed'),
        h('div', { class: 'character-card__role' }, `${char.role || 'Character'}${char.faction ? ` • ${char.faction}` : ''}`),
      ),
    ));
  });

  list.appendChild(h('div', { style: { padding: '8px' } },
    h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: () => go('characters') }, '+ New Character'),
  ));

  return list;
}

// ─── Detail (header + tabs) ──────────────────────────────────────────────────
function renderDetail(char) {
  const colors = factionColorMap();
  const color = colors[char.faction] || char.color || 'var(--accent-primary)';
  const piece = pieceForCharacter(char);

  const panel = h('div', { class: 'hub-panel', id: 'hub-panel' });
  renderTabInto(panel, char, piece);

  return h('div', { class: 'character-detail' },
    // Header (rendered once; tabs only swap the panel below)
    h('div', { class: 'hub-header' },
      h('div', { class: 'hub-header__avatar', style: { background: color } }, (char.name || '?')[0]),
      h('div', { class: 'hub-header__id' },
        h('h2', { class: 'hub-header__name' }, char.name || 'Unnamed'),
        h('div', { class: 'hub-header__meta' }, `${char.role || 'Character'}${char.faction ? ` • ${char.faction}` : ''}`),
        h('div', { class: 'hub-header__tags' },
          h('span', { class: 'tag tag--accent' }, char.status || 'active'),
          char.archetype ? h('span', { class: 'tag' }, char.archetype) : null,
          piece ? h('span', { class: `tag tag--${piece.momentum === 'rising' ? 'success' : piece.momentum === 'falling' ? 'danger' : 'accent'}` }, `momentum: ${piece.momentum}`) : null,
        ),
      ),
      // Deep tools that remain their own workspaces.
      h('div', { class: 'hub-header__actions' },
        h('button', { class: 'btn btn--ghost btn--sm', title: 'Edit full profile', onclick: () => go('characters') }, '✎ Edit'),
        h('button', { class: 'btn btn--ghost btn--sm', title: 'Build traits & appearance', onclick: () => go('character-builder') }, '🪪 Traits'),
        h('button', { class: 'btn btn--ghost btn--sm', title: 'Interview this character', onclick: () => go('character-interview') }, '💬 Interview'),
      ),
    ),

    // Tabs
    h('div', { class: 'hub-tabs', role: 'tablist' },
      ...TABS.map((t) => h('button', {
        class: `hub-tab ${t.id === activeTab ? 'hub-tab--active' : ''}`,
        role: 'tab',
        'aria-selected': t.id === activeTab ? 'true' : 'false',
        onclick: () => {
          activeTab = t.id;
          document.querySelectorAll('.hub-tab').forEach((b) => b.classList.remove('hub-tab--active'));
          const btn = document.querySelector(`.hub-tab[data-tab="${t.id}"]`);
          if (btn) btn.classList.add('hub-tab--active');
          const p = document.getElementById('hub-panel');
          if (p) renderTabInto(p, char, piece);
        },
        dataset: { tab: t.id },
      }, h('span', { 'aria-hidden': 'true' }, t.icon), ` ${t.label}`)),
    ),

    panel,
  );
}

/** Render the active tab's content into the panel element. */
function renderTabInto(panel, char, piece) {
  panel.innerHTML = '';
  let content;
  switch (activeTab) {
    case 'arc': content = renderArcTab(char, piece); break;
    case 'relationships': content = renderRelationshipsTab(char, piece); break;
    case 'notes': content = renderNotesTab(char); break;
    case 'overview':
    default: content = renderCharacterDetailContent(char); break;
  }
  panel.appendChild(content);
}

// ─── Arc tab ─────────────────────────────────────────────────────────────────
function renderArcTab(char, piece) {
  if (!piece) {
    return needsBoardPiece(char, 'arc',
      'Character arcs track how resources and momentum shift scene by scene on the Strategic Board.');
  }
  // The arc detail renderer already includes a header for the piece; wrap it so
  // it sits cleanly inside the tab panel.
  return h('div', {}, renderArcDetailContent(piece));
}

// ─── Relationships tab ───────────────────────────────────────────────────────
function renderRelationshipsTab(char, piece) {
  if (!piece) {
    return needsBoardPiece(char, 'relationships',
      'Relationships connect characters that exist as actors on the Strategic Board.');
  }
  const rels = getRelationshipsFor(piece.id);
  const pcs = getPieces();

  if (!rels.length) {
    return h('div', { class: 'hub-tab-empty' },
      h('p', {}, `${char.name} has no tracked relationships yet.`),
      h('button', { class: 'btn btn--sm', onclick: () => go('relationships') }, 'Open Relationships'),
    );
  }

  const strongestDim = (rel) => {
    const entries = Object.entries(rel.dimensions || {});
    if (!entries.length) return null;
    return entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  };

  return h('div', { class: 'hub-rels' },
    h('div', { class: 'hub-tab-head' },
      h('span', {}, `${rels.length} relationship${rels.length === 1 ? '' : 's'}`),
      h('button', { class: 'btn btn--ghost btn--sm', onclick: () => go('relationships') }, 'Open full view →'),
    ),
    ...rels.map((rel) => {
      const otherId = rel.sourceId === piece.id ? rel.targetId : rel.sourceId;
      const other = pcs.find((p) => p.id === otherId);
      const top = strongestDim(rel);
      const dimMeta = top ? RELATIONSHIP_DIMENSIONS[top[0]] : null;
      return h('div', { class: 'card hub-rel', style: { marginBottom: 'var(--space-sm)' } },
        h('div', { class: 'hub-rel__top' },
          // The related character's name is an interactive entity mention:
          // click it for a contextual preview + Open.
          h('span', { class: 'hub-rel__name' }, other ? entityMention(other.name, { preferType: 'piece' }) : 'Unknown'),
          h('span', { class: 'tag' }, rel.type),
        ),
        top ? h('div', { class: 'hub-rel__dim' },
          h('span', {}, `${dimMeta ? dimMeta.icon + ' ' : ''}${top[0]}`),
          h('div', { class: 'progress', style: { flex: '1' } },
            h('div', { class: 'progress__bar', style: { width: `${top[1]}%`, background: dimMeta ? dimMeta.color : 'var(--accent-primary)' } }),
          ),
          h('span', { class: 'hub-rel__pct' }, `${top[1]}%`),
        ) : null,
      );
    }),
  );
}

// ─── Notes tab ───────────────────────────────────────────────────────────────
function renderNotesTab(char) {
  const fields = [
    ['Secrets', char.secrets],
    ['Notes', char.notes],
    ['Internal conflict', char.internalConflict],
    ['Lies they believe', char.lies],
  ].filter(([, v]) => v && String(v).trim());

  if (!fields.length) {
    return h('div', { class: 'hub-tab-empty' },
      h('p', {}, 'No notes or secrets recorded yet.'),
      h('button', { class: 'btn btn--sm', onclick: () => go('characters') }, 'Add notes'),
    );
  }

  return h('div', {},
    ...fields.map(([label, value]) => h('div', { style: { marginBottom: 'var(--space-lg)' } },
      h('h4', { class: 'hub-notes__label' }, label),
      h('p', { class: 'hub-notes__text' }, value),
    )),
  );
}

/** Shared "this tab needs a Strategic Board actor" state. */
function needsBoardPiece(char, tab, explanation) {
  return h('div', { class: 'hub-tab-empty' },
    h('p', {}, `${char.name} isn\u2019t on the Strategic Board yet.`),
    h('p', { class: 'hub-tab-empty__sub' }, explanation),
    h('button', { class: 'btn btn--sm', onclick: () => go('conflict-board') }, 'Open Strategic Board'),
  );
}

function rerender() {
  const container = document.querySelector('.main-content') || document.getElementById('main-content');
  if (!container) return;
  container.innerHTML = '';
  renderCharacterHub(container);
}
