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
import { showModal, formField, confirmDialog } from '../ui/modal.js';
import { expandableText } from '../ui/expandable-text.js';
import { toastSuccess, toastError, toastWarning } from '../ui/toast.js';
import { appStore } from '../core/store.js';
import {
  AI_RECORD_KEY,
  AI_SOURCES,
  sourceMeta,
  makeRecord,
  normalizeRecords,
  queryRecords,
  recordFacets,
  recordWordCount,
  recordToText,
} from '../core/ai-record.js';

// ─── State ───────────────────────────────────────────────────────────────────

let records = [];
let activeId = null;
let filter = { search: '', source: '', tag: '' };

function load() {
  records = normalizeRecords(loadData(AI_RECORD_KEY, []));
  if (activeId && !records.find((r) => r.id === activeId)) activeId = null;
}

function save() {
  persistState(AI_RECORD_KEY, records);
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
      h('button', { class: 'btn btn--primary btn--sm', onclick: () => openEditor() }, '+ Add'),
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
      r.tags.length ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' } },
        ...r.tags.slice(0, 4).map((t) => h('span', { style: { fontSize: '9px', padding: '1px 5px', borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', color: 'var(--text-secondary)' } }, `#${t}`))) : null,
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
  );

  showModal(editing ? 'Edit AI Record' : 'Add AI Record', content, () => {
    if (!state.title.trim() && !state.content.trim()) { toastWarning('Add a title or some content first.'); return; }
    if (editing) {
      const idx = records.findIndex((r) => r.id === existing.id);
      if (idx !== -1) {
        // Bump updatedAt explicitly: makeRecord now preserves an existing one.
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
