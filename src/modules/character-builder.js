/**
 * LoreForge Planner - Character Builder
 *
 * A brainstorming workspace (sibling to the World Builder) for figuring out WHO
 * a character is and WHAT THEY LOOK LIKE by dragging traits onto them. The left
 * rail is a searchable, collapsible "trait tray" (personality + appearance
 * halves) sourced from the pure `trait-catalog.js`. The center is the selected
 * character's card with two drop zones — Personality and Appearance — that hold
 * removable trait chips. Traits persist on the character record as
 * `char.traitTags = [{ id, label, category, group }]` via the repo layer, so
 * they coexist with the existing Character Planner's free-form fields.
 *
 * Extras for brainstorming: 🎲 randomize a whole character, and reroll a single
 * category, plus a "Generate AI Prompt" action that assembles the traits into a
 * copy-pasteable prompt (writing + image styles) for an AI of the user's choice.
 */

import { h } from '../core/renderer.js';
import * as repo from '../core/repo.js';
import { openModal, confirmDialog, promptDialog } from '../ui/modal.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';
import {
  TRAIT_SETS, TRAIT_GROUPS, filterTraits, traitById,
  randomCharacterTraits, randomHalfTraits,
} from '../core/trait-catalog.js';
import { buildWritingPrompt, buildImagePrompt } from '../core/character-prompt.js';

const COLLECTION = 'characters';

// ── Session UI state (not persisted) ─────────────────────────────────────────
let selectedId = null;                 // currently open character
let activeHalf = 'personality';        // which trait-tray half is showing
let trayFilter = '';                   // trait search query
const collapsedCats = new Set();       // collapsed category labels in the tray

/** Read the live character list. */
function characters() {
  return repo.list(COLLECTION);
}

/** Normalize a character's trait list to an array. */
function traitTagsOf(char) {
  return Array.isArray(char && char.traitTags) ? char.traitTags : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
export function renderCharacterBuilder(container) {
  const chars = characters();
  if (selectedId && !chars.some((c) => c.id === selectedId)) selectedId = null;
  if (!selectedId && chars.length) selectedId = chars[0].id;

  container.appendChild(
    h('div', { class: 'charb' },
      renderRoster(chars),
      renderStage(chars),
      renderTray(),
    ),
  );
}

/** Full re-render into the module's root container. */
function refresh() {
  const root = document.querySelector('.charb');
  const host = root ? root.parentElement : document.querySelector('.main-content');
  if (!host) return;
  host.innerHTML = '';
  renderCharacterBuilder(host);
}

/** Re-render only the trait tray body, preserving search focus/caret. */
function refreshTrayOnly() {
  const body = document.getElementById('charb-tray-body');
  if (!body) return;
  const active = document.activeElement;
  const wasSearch = active && active.classList && active.classList.contains('charb-tray__search');
  body.innerHTML = '';
  body.appendChild(trayBody());
  if (wasSearch) {
    const box = body.parentElement.querySelector('.charb-tray__search');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Left rail: character roster
// ─────────────────────────────────────────────────────────────────────────────
function renderRoster(chars) {
  const list = h('div', { class: 'charb-roster__list' });
  if (!chars.length) {
    list.appendChild(h('div', { class: 'charb-roster__empty' }, 'No characters yet.'));
  } else {
    chars.forEach((c) => {
      const count = traitTagsOf(c).length;
      list.appendChild(
        h('button', {
          class: `charb-roster__item ${c.id === selectedId ? 'is-active' : ''}`,
          onclick: () => { selectedId = c.id; refresh(); },
        },
          h('span', { class: 'charb-roster__dot', style: { background: c.color || '#6366f1' } }),
          h('span', { class: 'charb-roster__name' }, c.name || 'Unnamed'),
          count ? h('span', { class: 'charb-roster__count', title: `${count} traits` }, String(count)) : null,
        ),
      );
    });
  }

  return h('div', { class: 'charb-roster' },
    h('div', { class: 'charb-roster__head' }, 'Characters'),
    list,
    h('button', { class: 'btn btn--primary charb-roster__add', onclick: addCharacter }, '+ New Character'),
  );
}

async function addCharacter() {
  const name = await promptDialog({ title: 'New Character', label: 'Name', placeholder: 'e.g. Kaela Voss' });
  if (!name) return;
  const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record = { id, name, role: '', faction: '', color: randomColor(), status: 'active', traitTags: [] };
  const { ok } = repo.upsert(COLLECTION, record);
  if (!ok) { toastError('Could not save the new character (storage may be full).'); return; }
  selectedId = id;
  toastSuccess(`Created “${name}”.`);
  refresh();
}

function randomColor() {
  const palette = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899'];
  return palette[Math.floor(Math.random() * palette.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Center: the selected character's card + drop zones
// ─────────────────────────────────────────────────────────────────────────────
function renderStage(chars) {
  const char = chars.find((c) => c.id === selectedId) || null;

  if (!char) {
    return h('div', { class: 'charb-stage charb-stage--empty' },
      h('div', { class: 'charb-stage__placeholder' },
        h('div', { class: 'charb-stage__icon' }, '🪪'),
        h('div', { class: 'charb-stage__title' }, 'Pick or create a character'),
        h('div', { class: 'charb-stage__hint' }, 'Then drag traits from the right onto them to brainstorm who they are and how they look.'),
      ),
    );
  }

  const tags = traitTagsOf(char);
  const personality = tags.filter((t) => t.group === 'personality');
  const appearance = tags.filter((t) => t.group === 'appearance');

  return h('div', { class: 'charb-stage' },
    // Header
    h('div', { class: 'charb-card__header' },
      h('span', { class: 'charb-card__swatch', style: { background: char.color || '#6366f1' } }),
      h('div', { class: 'charb-card__titles' },
        h('div', { class: 'charb-card__name' }, char.name || 'Unnamed'),
        h('div', { class: 'charb-card__sub' }, [char.role, char.faction].filter(Boolean).join(' · ') || 'No role set'),
      ),
      h('div', { class: 'charb-card__actions' },
        h('button', { class: 'btn btn--ghost', title: 'Roll a whole new character', onclick: () => surpriseMe(char) }, '🎲 Surprise me'),
        h('button', { class: 'btn btn--ghost', onclick: () => clearTraits(char) }, 'Clear'),
        h('button', { class: 'btn btn--primary', onclick: () => openPromptModal(char) }, '📋 Generate AI Prompt'),
      ),
    ),
    // Two drop zones
    h('div', { class: 'charb-zones' },
      dropZone(char, 'personality', 'Personality', personality),
      dropZone(char, 'appearance', 'Appearance', appearance),
    ),
  );
}

/** A labelled drop target that accepts trait chips of a given group. */
function dropZone(char, group, label, tags) {
  const grid = h('div', { class: 'charb-zone__chips' },
    ...(tags.length
      ? tags.map((t) => traitChip(char, t))
      : [h('div', { class: 'charb-zone__empty' }, `Drag ${label.toLowerCase()} traits here.`)]),
  );

  const zone = h('div', {
    class: `charb-zone charb-zone--${group}`,
    ondragover: (e) => { e.preventDefault(); zone.classList.add('is-over'); },
    ondragleave: () => zone.classList.remove('is-over'),
    ondrop: (e) => { zone.classList.remove('is-over'); handleDrop(e, char, group); },
  },
    h('div', { class: 'charb-zone__head' },
      h('span', {}, label),
      h('span', { class: 'charb-zone__count' }, String(tags.length)),
      h('button', {
        class: 'charb-zone__reroll', title: `Reroll ${label.toLowerCase()}`,
        onclick: () => rerollHalf(char, group),
      }, '🎲'),
    ),
    grid,
  );
  return zone;
}

/** A removable trait chip shown on a character. */
function traitChip(char, tag) {
  return h('span', { class: `tag charb-chip charb-chip--${tag.group}`, title: tag.category },
    h('span', { class: 'charb-chip__label' }, tag.label),
    h('button', {
      class: 'charb-chip__x', 'aria-label': `Remove ${tag.label}`,
      onclick: () => removeTrait(char, tag.id),
    }, '×'),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right rail: the searchable, collapsible trait tray
// ─────────────────────────────────────────────────────────────────────────────
function renderTray() {
  return h('div', { class: 'charb-tray' },
    h('div', { class: 'charb-tray__head' }, 'Traits'),
    h('div', { class: 'charb-tray__tabs' },
      ...TRAIT_GROUPS.map((half) =>
        h('button', {
          class: `charb-tray__tab ${activeHalf === half ? 'is-active' : ''}`,
          onclick: () => { activeHalf = half; refreshTrayOnly(); },
        }, half === 'personality' ? 'Personality' : 'Appearance'),
      ),
    ),
    h('input', {
      class: 'input charb-tray__search', type: 'search', placeholder: 'Search traits…',
      value: trayFilter,
      oninput: (e) => { trayFilter = e.target.value; refreshTrayOnly(); },
    }),
    h('div', { id: 'charb-tray-body', class: 'charb-tray__scroll' }, trayBody()),
    h('div', { class: 'charb-tray__hint' }, 'Drag a trait onto a character, or double-click to add it.'),
  );
}

function trayBody() {
  const q = trayFilter.trim();
  if (q) {
    const hits = filterTraits(activeHalf, q);
    return hits.length
      ? h('div', { class: 'charb-tray__grid' }, ...hits.map(trayChip))
      : h('div', { class: 'charb-tray__none' }, `No traits match “${trayFilter}”.`);
  }
  // Grouped, collapsible sections.
  return h('div', {}, ...(TRAIT_SETS[activeHalf] || []).map((section) => {
    const open = !collapsedCats.has(section.category);
    return h('div', { class: 'charb-tray__group' },
      h('button', {
        class: 'charb-tray__group-head',
        onclick: () => { toggleCat(section.category); },
      },
        h('span', {}, `${open ? '▾' : '▸'} ${section.category}`),
        h('span', { class: 'charb-tray__group-count' }, String(section.items.length)),
      ),
      open
        ? h('div', { class: 'charb-tray__grid' },
            ...section.items.map((it) => trayChip({ id: it.id, label: it.label, category: section.category, group: activeHalf })),
          )
        : null,
    );
  }));
}

/** A draggable trait chip in the tray. */
function trayChip(trait) {
  return h('button', {
    class: `tag charb-tray__chip charb-tray__chip--${trait.group}`,
    draggable: 'true',
    title: `${trait.category} — drag onto a character`,
    ondragstart: (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify(trait));
    },
    ondblclick: () => addTraitToSelected(trait),
  }, trait.label);
}

function toggleCat(name) {
  if (collapsedCats.has(name)) collapsedCats.delete(name);
  else collapsedCats.add(name);
  refreshTrayOnly();
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations (persist via repo)
// ─────────────────────────────────────────────────────────────────────────────

/** Persist a character's trait list, replacing the whole array. */
function saveTraits(char, tags) {
  const { ok } = repo.upsert(COLLECTION, { id: char.id, traitTags: tags });
  if (!ok) { toastError('Could not save (storage may be full).'); return false; }
  return true;
}

/** Add a trait to a character (no duplicates by id). Returns true if added. */
function addTrait(char, trait, { silent = false } = {}) {
  const tags = traitTagsOf(char);
  if (tags.some((t) => t.id === trait.id)) {
    if (!silent) toastInfo(`${char.name || 'Character'} already has “${trait.label}”.`);
    return false;
  }
  const clean = { id: trait.id, label: trait.label, category: trait.category, group: trait.group };
  if (saveTraits(char, [...tags, clean])) return true;
  return false;
}

function addTraitToSelected(trait) {
  const char = characters().find((c) => c.id === selectedId);
  if (!char) { toastInfo('Select a character first.'); return; }
  if (addTrait(char, trait)) { toastSuccess(`Added “${trait.label}”.`); refresh(); }
}

function handleDrop(e, char, group) {
  e.preventDefault();
  let payload;
  try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); }
  catch (_) { return; }
  if (!payload || !payload.id) return;
  // Resolve the canonical trait from the catalog so a stored tag is always a
  // real, well-formed entry ({id,label,category,group}). Reject anything that
  // doesn't resolve — a fabricated/stale payload must not be persisted.
  const canonical = traitById(payload.id);
  if (!canonical) return;
  if (canonical.group !== group) {
    toastInfo(`“${canonical.label}” is a ${canonical.group} trait — drop it in the ${canonical.group} zone.`);
    return;
  }
  if (addTrait(char, canonical)) { toastSuccess(`Added “${canonical.label}”.`); refresh(); }
}

function removeTrait(char, traitId) {
  const tags = traitTagsOf(char).filter((t) => t.id !== traitId);
  if (saveTraits(char, tags)) refresh();
}

async function clearTraits(char) {
  if (!traitTagsOf(char).length) { toastInfo('No traits to clear.'); return; }
  const ok = await confirmDialog({
    title: 'Clear all traits?',
    message: `Remove every trait from “${char.name || 'this character'}”? This can’t be undone.`,
    confirmLabel: 'Clear', danger: true,
  });
  if (!ok) return;
  if (saveTraits(char, [])) { toastSuccess('Traits cleared.'); refresh(); }
}

// ── Brainstorming: randomize + reroll ────────────────────────────────────────
async function surpriseMe(char, rng = Math.random) {
  const has = traitTagsOf(char).length > 0;
  if (has) {
    const ok = await confirmDialog({
      title: 'Roll a new character?',
      message: `This replaces all of “${char.name || 'this character'}”’s current traits with a fresh random set.`,
      confirmLabel: 'Roll it', danger: true,
    });
    if (!ok) return;
  }
  const rolled = randomCharacterTraits(rng).map(cleanTag);
  if (saveTraits(char, rolled)) { toastSuccess('Rolled a fresh set of traits. 🎲'); refresh(); }
}

/** Reroll every trait in one half (personality or appearance). rng is
 * injectable so the behavior is testable and matches the whole-character roll. */
function rerollHalf(char, group, rng = Math.random) {
  const keep = traitTagsOf(char).filter((t) => t.group !== group);
  const fresh = randomHalfTraits(group, rng).map(cleanTag);
  if (saveTraits(char, [...keep, ...fresh])) {
    toastSuccess(`Rerolled ${group}. 🎲`);
    refresh();
  }
}

/** Normalize a catalog trait to the shape stored on a character. */
function cleanTag(t) {
  return { id: t.id, label: t.label, category: t.category, group: t.group };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-prompt generator modal
// ─────────────────────────────────────────────────────────────────────────────
function openPromptModal(char) {
  if (!traitTagsOf(char).length) {
    toastInfo('Add some traits first, then generate a prompt.');
    return;
  }

  let style = 'writing';
  const textarea = h('textarea', { class: 'input charb-prompt__text', rows: '14', readonly: 'true' });
  const hint = h('div', { class: 'charb-prompt__hint' });

  const render = () => {
    textarea.value = style === 'writing' ? buildWritingPrompt(char) : buildImagePrompt(char);
    hint.textContent = style === 'writing'
      ? 'Paste into a text AI (ChatGPT, Claude, …) to flesh out backstory, voice, and motivation.'
      : 'Paste into an image generator (Midjourney, DALL·E, Stable Diffusion, …).';
  };

  const tab = (id, label) => h('button', {
    class: `charb-prompt__tab ${style === id ? 'is-active' : ''}`,
    onclick: (e) => {
      style = id;
      e.currentTarget.parentElement.querySelectorAll('.charb-prompt__tab')
        .forEach((b) => b.classList.remove('is-active'));
      e.currentTarget.classList.add('is-active');
      render();
    },
  }, label);

  const body = h('div', { class: 'charb-prompt' },
    h('div', { class: 'charb-prompt__tabs' },
      tab('writing', '✍️ Character writing'),
      tab('image', '🖼️ Image generation'),
    ),
    hint,
    textarea,
  );
  render();

  openModal({
    title: `AI Prompt — ${char.name || 'Character'}`,
    content: body,
    actions: [
      { label: 'Close', variant: '' },
      {
        label: '📋 Copy', variant: 'primary', closeOnClick: false,
        onClick: () => { copyText(textarea.value); },
      },
    ],
  });
}

/** Copy helper with a clipboard fallback for non-secure contexts. */
function copyText(text) {
  const done = () => toastSuccess('Prompt copied to clipboard.');
  const fail = () => toastError('Could not copy — select the text and copy manually.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text) ? done() : fail());
  } else {
    fallbackCopy(text) ? done() : fail();
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}
