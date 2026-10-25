/**
 * LoreForge Planner - AI Record module (external AI brainstorming library)
 *
 * A reference library for brainstorming you did with OTHER AI tools. Paste a
 * session in, tag it, and it lives beside your universe so you can search it and
 * draw inspiration later. Nothing here is pushed into your canon automatically —
 * it is deliberately a scrapbook. When a record sparks something, "Send to
 * Brainstorm" hands it to the Brainstorm module where the app's existing
 * tag → push-to-modules flow can fold it into characters, places, factions, etc.
 *
 * Layout mirrors the Brainstorm module (searchable list ‹ reader/editor) for a
 * familiar feel. All persistence goes through the shared namespaced localStorage
 * layer, so records are captured by export/import and cloud sync automatically.
 */

import { h } from '../core/renderer.js';
import { generateId } from '../core/objects.js';
import { loadData, persistState } from '../core/persist.js';
import { list, Collections } from '../core/repo.js';
import { events } from '../core/events.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';
import { expandableText } from '../ui/expandable-text.js';
import { toastSuccess, toastError, toastWarning } from '../ui/toast.js';
import { appStore } from '../core/store.js';
import {
  AI_RECORD_KEY,
  AI_RECORD_FOCUS_KEY,
  AI_RECORDS_CHANGED,
  AI_SOURCES,
  sourceMeta,
  makeRecord,
  normalizeRecords,
  queryRecords,
  recordFacets,
  recordWordCount,
  recordToText,
  linkCount,
  isAIEnabled,
  summarizeRecord,
} from '../core/ai-record.js';
import { parseAIExport } from '../core/ai-record-import.js';

// ─── State ───────────────────────────────────────────────────────────────────

let records = [];
let activeId = null;
let filter = { search: '', source: '', tag: '' };

function load() {
  records = normalizeRecords(loadData(AI_RECORD_KEY, []));
  // Honor a focus hint set by the always-on review checklist (click a record
  // there → open it here). Consume it so it only applies once.
  try {
    const focusId = localStorage.getItem(AI_RECORD_FOCUS_KEY);
    if (focusId) {
      localStorage.removeItem(AI_RECORD_FOCUS_KEY);
      if (records.find((r) => r.id === focusId)) activeId = focusId;
    }
  } catch (_) { /* ignore */ }
  if (activeId && !records.find((r) => r.id === activeId)) activeId = null;
}

function save() {
  const ok = persistState(AI_RECORD_KEY, records);
  // Notify the always-on review checklist (and any other listener) so it can
  // refresh without being tightly coupled to this module.
  events.emit(AI_RECORDS_CHANGED, { count: records.length });
  return ok;
}

// ─── Main render ───────────────────────────────────────────────────────────

export function renderAIRecord(container) {
  load();

  const wrapper = h('div', { style: { position: 'absolute', inset: '0', display: 'flex', overflow: 'hidden' } },
    renderListPanel(),
    renderReader(),
  );
  container.appendChild(wrapper);
  updateSidebar();
}

// ─── List panel (left) ───────────────────────────────────────────────────────

function renderListPanel() {
  const facets = recordFacets(records);
  const visible = queryRecords(records, filter);

  return h('div', { style: { width: '300px', minWidth: '300px', borderRight: '1px solid var(--border-subtle)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
    // Header
    h('div', { style: { padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
      h('span', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' } }, `AI Records${facets.total ? ` · ${facets.total}` : ''}`),
      h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { class: 'btn btn--ghost btn--sm', title: 'Import a ChatGPT / Claude export file', onclick: () => openImport() }, '⬆ Import'),
        h('button', { class: 'btn btn--primary btn--sm', onclick: () => openEditor() }, '+ Add'),
      ),
    ),

    // Search + filters
    h('div', { style: { padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('input', {
        class: 'input', type: 'search', value: filter.search,
        placeholder: 'Search records…', style: { fontSize: '12px' },
        oninput: (e) => { filter.search = e.target.value; rerenderList(); },
      }),
      h('div', { style: { display: 'flex', gap: '6px' } },
        h('select', { class: 'input', style: { fontSize: '12px', flex: '1' }, onchange: (e) => { filter.source = e.target.value; rerenderList(); } },
          h('option', { value: '', selected: filter.source === '' ? 'selected' : undefined }, 'All sources'),
          ...AI_SOURCES.filter((s) => facets.bySource[s.id]).map((s) =>
            h('option', { value: s.id, selected: filter.source === s.id ? 'selected' : undefined }, `${s.icon} ${s.label} (${facets.bySource[s.id]})`)),
        ),
        filter.tag
          ? h('button', { class: 'btn btn--ghost btn--sm', title: 'Clear tag filter', onclick: () => { filter.tag = ''; rerenderList(); } }, `#${filter.tag} ✕`)
          : null,
      ),
      // Tag chips (top tags)
      facets.tags.length
        ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
            ...facets.tags.slice(0, 8).map((t) => h('button', {
              class: 'btn btn--ghost btn--sm',
              style: { fontSize: '10px', padding: '2px 7px', borderRadius: 'var(--radius-full)', background: filter.tag.toLowerCase() === t.tag.toLowerCase() ? 'var(--bg-active)' : 'var(--surface-2)' },
              onclick: () => { filter.tag = filter.tag.toLowerCase() === t.tag.toLowerCase() ? '' : t.tag; rerenderList(); },
            }, `#${t.tag} ${t.count}`)))
        : null,
    ),

    // The list
    h('div', { class: 'ai-record-list', style: { flex: '1', overflowY: 'auto', padding: '6px' } },
      renderListItems(visible),
    ),
  );
}

function renderListItems(visible) {
  if (!records.length) {
    return h('div', { style: { padding: '20px 14px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', lineHeight: '1.6' } },
      'No records yet. Paste a brainstorming session from ChatGPT, Claude, Gemini or any AI with “+ Add”.');
  }
  if (!visible.length) {
    return h('div', { style: { padding: '20px 14px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' } }, 'No records match your filters.');
  }
  return h('div', {}, ...visible.map((r) => {
    const meta = sourceMeta(r.source);
    const isActive = r.id === activeId;
    return h('div', {
      style: { padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: isActive ? 'var(--bg-active)' : 'transparent', border: isActive ? '1px solid var(--border-accent)' : '1px solid transparent' },
      onclick: () => { activeId = r.id; rerender(); },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' } },
        r.pinned ? h('span', { title: 'Pinned', style: { fontSize: '10px' } }, '📌') : null,
        h('span', { style: { fontSize: '11px' } }, meta.icon),
        h('span', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1' } }, r.title),
      ),
      h('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `${meta.label}${r.model ? ` · ${r.model}` : ''} · ${formatDate(r.updatedAt)}`),
      r.content ? h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.content.slice(0, 70)) : null,
      (r.tags.length || linkCount(r) || (r.summary && r.summary.trim()) || r.reviewed) ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px', alignItems: 'center' } },
        ...r.tags.slice(0, 3).map((t) => h('span', { style: { fontSize: '9px', padding: '1px 5px', borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', color: 'var(--text-secondary)' } }, `#${t}`)),
        linkCount(r) ? h('span', { style: { fontSize: '9px', color: 'var(--text-muted)' }, title: `${linkCount(r)} linked entit${linkCount(r) === 1 ? 'y' : 'ies'}` }, `🔗${linkCount(r)}`) : null,
        (r.summary && r.summary.trim()) ? h('span', { style: { fontSize: '9px', color: 'var(--text-muted)' }, title: 'Has a summary' }, '✨') : null,
        r.reviewed ? h('span', { style: { fontSize: '9px', color: 'var(--success)' }, title: 'Reviewed' }, '✓') : null,
      ) : null,
    );
  }));
}

// ─── Reader / detail (right) ─────────────────────────────────────────────────

function renderReader() {
  const record = records.find((r) => r.id === activeId);

  if (!record) {
    return h('div', { style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '0' } },
      h('div', { style: { textAlign: 'center', color: 'var(--text-muted)', maxWidth: '440px', padding: '24px' } },
        h('div', { style: { fontSize: '48px', marginBottom: '16px', opacity: '0.5' } }, '🤖'),
        h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'AI Record'),
        h('div', { style: { fontSize: '13px', lineHeight: '1.7', marginBottom: '16px' } },
          'Keep brainstorming sessions from any AI (ChatGPT, Claude, Gemini…) right beside your universe. Capture ideas, tag them, search them, and draw inspiration as you build — your records are saved locally and included in export & sync.'),
        h('button', { class: 'btn btn--primary', onclick: () => openEditor() }, '+ Add your first record'),
      ),
    );
  }

  const meta = sourceMeta(record.source);

  return h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: '0' } },
    // Toolbar
    h('div', { style: { padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexShrink: '0' } },
      h('div', { style: { minWidth: '0' } },
        h('div', { style: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', overflow: 'hidden', textOverflow: 'ellipsis' } }, record.title),
        h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } },
          `${meta.icon} ${meta.label}${record.model ? ` · ${record.model}` : ''} · ${recordWordCount(record)} words · ${formatDate(record.createdAt)}`),
      ),
      h('div', { style: { display: 'flex', gap: '6px', flexShrink: '0' } },
        h('button', {
          class: `btn btn--sm ${record.reviewed ? 'btn--ghost' : 'btn--primary'}`,
          title: record.reviewed ? 'Reviewed — click to move back to the review list' : 'Mark as reviewed (checks it off the review list)',
          onclick: () => toggleReviewed(record),
        }, record.reviewed ? '✓ Reviewed' : 'Mark reviewed'),
        h('button', { class: 'btn btn--ghost btn--sm', title: record.pinned ? 'Unpin' : 'Pin to top', onclick: () => togglePin(record) }, record.pinned ? '📌' : '📍'),
        h('button', { class: 'btn btn--ghost btn--sm', title: 'Copy full record', onclick: () => copyRecord(record) }, '📋'),
        h('button', { class: 'btn btn--ghost btn--sm', title: 'Send to Brainstorm to work it into your story', onclick: () => sendToBrainstorm(record) }, '💭'),
        h('button', { class: 'btn btn--ghost btn--sm', onclick: () => openEditor(record) }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--sm', style: { color: 'var(--danger)' }, onclick: () => deleteRecord(record) }, '🗑️'),
      ),
    ),

    // Tags strip
    record.tags.length
      ? h('div', { style: { padding: '8px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '5px', flexShrink: '0' } },
          ...record.tags.map((t) => h('span', {
            style: { fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', color: 'var(--text-secondary)', cursor: 'pointer' },
            title: `Filter by #${t}`,
            onclick: () => { filter.tag = t; rerender(); },
          }, `#${t}`)))
      : null,

    // Linked entities strip
    renderLinkedEntities(record),

    // Summary panel
    renderSummaryPanel(record),

    // Body (prompt + content)
    h('div', { style: { flex: '1', overflowY: 'auto', padding: '18px', minHeight: '0' } },
      record.prompt && record.prompt.trim()
        ? h('div', { style: { marginBottom: '18px' } },
            h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '6px' } }, 'Prompt'),
            h('div', { style: { fontSize: '13px', lineHeight: '1.7', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px' } }, record.prompt),
          )
        : null,
      h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '6px' } }, record.prompt && record.prompt.trim() ? 'Response' : 'Session'),
      record.content && record.content.trim()
        ? h('div', { style: { fontSize: '14px', lineHeight: '1.8', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)' } }, record.content)
        : h('div', { style: { fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'This record has no content yet. Use ✏️ to add the session text.'),
    ),
  );
}

// ─── Summary panel ───────────────────────────────────────────────────────────

function renderSummaryPanel(record) {
  const hasSummary = record.summary && record.summary.trim();
  return h('div', { style: { padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-1)', flexShrink: '0' } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: hasSummary ? '8px' : '0' } },
      h('div', { style: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, '✨ Summary'),
      h('button', {
        class: 'btn btn--ghost btn--sm', id: 'ai-record-summarize-btn',
        title: isAIEnabled() ? 'Summarize with your AI model' : 'Summarize on-device (add an AI key for a richer summary)',
        onclick: () => summarizeActive(record),
      }, hasSummary ? '↻ Re-summarize' : (isAIEnabled() ? '✨ Summarize' : '⚙ Summarize')),
    ),
    hasSummary
      ? h('div', { id: 'ai-record-summary-body', style: { fontSize: '13px', lineHeight: '1.7', color: 'var(--text-secondary)' } }, renderSummaryText(record.summary))
      : h('div', { id: 'ai-record-summary-body', style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } },
          record.content && record.content.trim() ? 'No summary yet — click Summarize.' : 'Add session content first, then summarize.'),
  );
}

/** Render a summary string (paragraph(s) + "- " bullets) into nodes. */
function renderSummaryText(text) {
  const lines = String(text || '').split('\n');
  const nodes = [];
  let bullets = null;
  const flush = () => { if (bullets) { nodes.push(h('ul', { style: { margin: '6px 0 0 18px' } }, ...bullets)); bullets = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith('- ')) { (bullets = bullets || []).push(h('li', { style: { marginBottom: '2px' } }, t.slice(2))); }
    else { flush(); nodes.push(h('p', { style: { margin: '0 0 6px' } }, t)); }
  }
  flush();
  return h('div', {}, ...nodes);
}

async function summarizeActive(record) {
  const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('ai-record-summarize-btn'));
  const body = document.getElementById('ai-record-summary-body');
  if (!record.content || !record.content.trim()) { toastWarning('Add session content first.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Summarizing…'; }
  if (body) { body.innerHTML = ''; body.appendChild(h('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Summarizing…')); }
  let res;
  try { res = await summarizeRecord(record); }
  catch (_) { res = { summary: '', usedAI: false }; }
  if (!res.summary) { toastError('Could not summarize this record.'); if (btn) { btn.disabled = false; } rerender(); return; }
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx !== -1) { records[idx] = makeRecord({ ...records[idx], summary: res.summary, updatedAt: records[idx].updatedAt }); }
  save();
  toastSuccess(res.usedAI ? '✨ Summarized with your AI model.' : '⚙ Summarized on-device.');
  rerender();
}

// ─── Linked entities ─────────────────────────────────────────────────────────

function renderLinkedEntities(record) {
  const chars = list(Collections.CHARACTERS);
  const locs = list(Collections.LOCATIONS);
  const linkedChars = (record.linkedCharacterIds || []).map((id) => chars.find((c) => c.id === id)).filter(Boolean);
  const linkedLocs = (record.linkedLocationIds || []).map((id) => locs.find((l) => l.id === id)).filter(Boolean);
  if (!linkedChars.length && !linkedLocs.length) return null;

  const chip = (icon, name, moduleId) => h('button', {
    class: 'btn btn--ghost btn--sm',
    style: { fontSize: '11px', padding: '2px 9px', borderRadius: 'var(--radius-full)', background: 'var(--surface-2)' },
    title: `Open ${name}`,
    onclick: () => { appStore.setState({ activeModule: moduleId }); },
  }, `${icon} ${name}`);

  return h('div', { style: { padding: '8px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', flexShrink: '0' } },
    h('span', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, '🔗 Linked:'),
    ...linkedChars.map((c) => chip('👤', c.name || 'Unnamed', 'character-hub')),
    ...linkedLocs.map((l) => chip('📍', l.name || 'Unnamed', 'locations')),
  );
}

/** A multi-select chip picker for linking entities, used in the editor modal. */
function renderLinkPicker(label, entities, selectedIds) {
  if (!entities.length) {
    return formField(label, h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } }, `No ${label.toLowerCase().replace('link to ', '')} yet — create some first.`));
  }
  const wrap = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
  entities.forEach((ent) => {
    const btn = h('button', {
      type: 'button',
      class: 'btn btn--sm',
      style: chipStyle(selectedIds.includes(ent.id)),
      onclick: () => {
        const i = selectedIds.indexOf(ent.id);
        if (i === -1) selectedIds.push(ent.id); else selectedIds.splice(i, 1);
        btn.style.cssText = Object.entries(chipStyle(selectedIds.includes(ent.id))).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';');
      },
    }, ent.name || 'Unnamed');
    wrap.appendChild(btn);
  });
  return formField(label, wrap);
}

function chipStyle(active) {
  return {
    fontSize: '12px', padding: '3px 10px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
    background: active ? 'var(--bg-active)' : 'var(--surface-2)',
    border: active ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  };
}

// ─── Add / edit modal ────────────────────────────────────────────────────────

function openEditor(existing) {
  const editing = Boolean(existing);
  const state = {
    title: existing?.title || '',
    source: existing?.source || 'chatgpt',
    model: existing?.model || '',
    prompt: existing?.prompt || '',
    content: existing?.content || '',
    tags: existing ? existing.tags.join(', ') : '',
    linkedCharacterIds: existing ? [...(existing.linkedCharacterIds || [])] : [],
    linkedLocationIds: existing ? [...(existing.linkedLocationIds || [])] : [],
  };

  const sourceSelect = h('select', { class: 'input', onchange: (e) => { state.source = e.target.value; } },
    ...AI_SOURCES.map((s) => h('option', { value: s.id, selected: s.id === state.source ? 'selected' : undefined }, `${s.icon} ${s.label}`)));

  const content = h('div', {},
    formField('Title', h('input', { class: 'input', value: state.title, placeholder: 'e.g. "Villain motivations — ideas from Claude"', oninput: (e) => { state.title = e.target.value; } })),
    h('div', { style: { display: 'flex', gap: '10px' } },
      h('div', { style: { flex: '1' } }, formField('AI source', sourceSelect)),
      h('div', { style: { flex: '1' } }, formField('Model (optional)', h('input', { class: 'input', value: state.model, placeholder: 'e.g. GPT-4o, Claude 3.5', oninput: (e) => { state.model = e.target.value; } }))),
    ),
    formField('Prompt you used (optional)', expandableText({ value: state.prompt, placeholder: 'Paste the prompt that produced this session…', label: 'Prompt', oninput: (e) => { state.prompt = e.target.value; } })),
    formField('Session content', expandableText({ value: state.content, placeholder: 'Paste the AI’s response / the brainstorming session here…', label: 'Session content', oninput: (e) => { state.content = e.target.value; } })),
    formField('Tags (comma-separated)', h('input', { class: 'input', value: state.tags, placeholder: 'e.g. magic-system, villains, worldbuilding', oninput: (e) => { state.tags = e.target.value; } })),
    renderLinkPicker('Link to characters', list(Collections.CHARACTERS), state.linkedCharacterIds),
    renderLinkPicker('Link to places', list(Collections.LOCATIONS), state.linkedLocationIds),
  );

  showModal(editing ? 'Edit AI Record' : 'Add AI Record', content, () => {
    if (!state.title.trim() && !state.content.trim()) { toastWarning('Add a title or some content first.'); return; }
    if (editing) {
      const idx = records.findIndex((r) => r.id === existing.id);
      if (idx !== -1) {
        // Bump updatedAt explicitly: makeRecord now preserves an existing one.
        // Keep any existing summary — editing links/tags shouldn't discard it.
        records[idx] = makeRecord({ ...existing, ...state, tags: state.tags, updatedAt: Date.now() });
        activeId = existing.id;
      }
    } else {
      const rec = makeRecord(state);
      records.unshift(rec);
      activeId = rec.id;
    }
    save();
    rerender();
    toastSuccess(editing ? 'Record updated.' : 'Record saved.');
  });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function togglePin(record) {
  record.pinned = !record.pinned;
  record.updatedAt = Date.now();
  save();
  rerender();
}

function toggleReviewed(record) {
  record.reviewed = !record.reviewed;
  record.updatedAt = Date.now();
  save(); // emits AI_RECORDS_CHANGED → the always-on checklist refreshes
  toastSuccess(record.reviewed ? 'Checked off — removed from the review list.' : 'Moved back to the review list.');
  rerender();
}

async function deleteRecord(record) {
  const ok = await confirmDialog({ title: `Delete “${record.title}”?`, message: 'This AI record will be permanently removed.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx !== -1) records.splice(idx, 1);
  if (activeId === record.id) activeId = null;
  save();
  rerender();
}

function copyRecord(record) {
  const text = recordToText(record);
  const done = () => toastSuccess('Record copied to clipboard.');
  const fail = () => toastError('Could not copy — open the record and copy manually.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { if (fallbackCopy(text)) done(); else fail(); });
  } else if (fallbackCopy(text)) { done(); } else { fail(); }
}

/**
 * Hand a record to the Brainstorm module as a new session, then navigate there.
 * Brainstorm already knows how to tag content and push it into characters,
 * places, factions, etc., so this is the bridge from "reference" to "canon".
 */
function sendToBrainstorm(record) {
  try {
    const sessions = loadData('brainstormSessions', []);
    const list = Array.isArray(sessions) ? sessions : [];
    const meta = sourceMeta(record.source);
    list.unshift({
      id: generateId(),
      title: `From ${meta.label}: ${record.title}`.slice(0, 80),
      content: recordToText(record),
      createdAt: Date.now(),
    });
    const ok = persistState('brainstormSessions', list);
    if (!ok) { toastError('Could not hand off — storage may be full.'); return; }
    toastSuccess('Added to Brainstorm — opening it now.');
    appStore.setState({ activeModule: 'brainstorm' });
  } catch (_) {
    toastError('Could not send to Brainstorm.');
  }
}

// ─── Import (ChatGPT / Claude / generic export) ──────────────────────────────

function openImport() {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  const dropHint = h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' } },
    'Import brainstorming from another AI. Export your chats as JSON, then choose the file:',
    h('ul', { style: { margin: '8px 0 0 18px', fontSize: '12px', color: 'var(--text-muted)' } },
      h('li', {}, 'ChatGPT → Settings → Data controls → Export (use conversations.json)'),
      h('li', {}, 'Claude → Settings → export your data (conversations.json)'),
      h('li', {}, 'Other tools: any JSON with a messages / role+content list'),
    ),
  );

  const resultSlot = h('div', { style: { marginTop: '14px' } });

  // State holds parsed drafts + which are selected.
  const importState = { drafts: [], selected: new Set() };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    resultSlot.innerHTML = '';
    resultSlot.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, `Reading ${file.name}…`));
    let text;
    try { text = await file.text(); }
    catch (_) { resultSlot.innerHTML = ''; resultSlot.appendChild(errLine('Could not read that file.')); return; }

    const parsed = parseAIExport(text);
    importState.drafts = parsed.drafts || [];
    importState.selected = new Set(importState.drafts.map((_, i) => i)); // all selected by default
    renderImportResult(parsed, importState, resultSlot);
  });

  const content = h('div', {},
    dropHint,
    h('button', { class: 'btn btn--primary', style: { marginTop: '12px' }, onclick: () => fileInput.click() }, '📂 Choose export file'),
    fileInput,
    resultSlot,
  );

  showModal('Import AI sessions', content, () => {
    const chosen = importState.drafts.filter((_, i) => importState.selected.has(i));
    if (!chosen.length) { toastWarning('No sessions selected to import.'); return; }
    let imported = 0;
    chosen.forEach((d) => { records.unshift(makeRecord(d)); imported++; });
    const ok = save();
    if (!ok) { toastError('Could not save imported records — storage may be full.'); return; }
    activeId = records[0]?.id || null;
    toastSuccess(`Imported ${imported} session${imported === 1 ? '' : 's'}.`);
    rerender();
  });
}

function renderImportResult(parsed, importState, slot) {
  slot.innerHTML = '';
  if (!importState.drafts.length) {
    slot.appendChild(errLine(parsed.error || 'No conversations found in that file.'));
    return;
  }
  const fmtLabel = { chatgpt: 'ChatGPT', claude: 'Claude', generic: 'Generic' }[parsed.format] || 'Unknown';
  slot.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 10px' } },
    `Detected ${fmtLabel} export · ${importState.drafts.length} session${importState.drafts.length === 1 ? '' : 's'} found. Pick which to import:`));

  const listWrap = h('div', { style: { maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' } });
  importState.drafts.forEach((d, i) => {
    const row = h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: '8px', cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: importState.selected.has(i) ? 'checked' : undefined, onchange: (e) => { if (e.target.checked) importState.selected.add(i); else importState.selected.delete(i); } }),
      h('div', { style: { minWidth: '0', flex: '1' } },
        h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, d.title || 'Untitled'),
        h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (d.content || '').slice(0, 90)),
      ),
    );
    listWrap.appendChild(row);
  });
  slot.appendChild(listWrap);
}

function errLine(msg) {
  return h('div', { style: { fontSize: '12px', color: 'var(--danger)', padding: '8px 0' } }, `⚠ ${msg}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Re-render just the list column (cheap) after a filter change. */
function rerenderList() {
  const listEl = document.querySelector('.ai-record-list');
  if (!listEl) { rerender(); return; }
  listEl.innerHTML = '';
  listEl.appendChild(renderListItems(queryRecords(records, filter)));
}

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderAIRecord(container); }
}

function updateSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'AI Records'));
  const visible = queryRecords(records, filter);
  if (!visible.length) {
    sidebar.appendChild(h('div', { style: { padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'None yet'));
    return;
  }
  visible.slice(0, 20).forEach((r) => {
    const meta = sourceMeta(r.source);
    sidebar.appendChild(h('div', { class: `sidebar-item ${r.id === activeId ? 'sidebar-item--active' : ''}`, onclick: () => { activeId = r.id; rerender(); } },
      h('span', { class: 'sidebar-item__icon' }, meta.icon),
      h('span', { class: 'sidebar-item__label', style: { fontSize: '11px' } }, r.title),
    ));
  });
}
