/**
 * LoreForge Planner - Cloud Sync Settings Panel (Bring Your Own Backend)
 *
 * Configure optional cloud sync. Emphasizes that the app stays local-first:
 * writes always save locally first; sync is best-effort in the background.
 */

import { h } from '../core/renderer.js';
import { openModal } from './modal.js';
import { toastSuccess, toastInfo } from './toast.js';
import { getSyncSettings, saveSyncSettings, clearSyncSettings } from '../core/sync/sync-settings.js';
import { initSync, syncNow, setConflictResolver } from '../core/sync/sync-init.js';

export function openSyncSettings() {
  const current = getSyncSettings();
  const state = { ...current };

  const modeSelect = h('select', { class: 'input', onchange: (e) => { state.mode = e.target.value; toggleRestFields(); } },
    h('option', { value: 'rest', ...(state.mode === 'rest' ? { selected: 'selected' } : {}) }, 'My backend (REST / Supabase / Firebase)'),
    h('option', { value: 'local', ...(state.mode === 'local' ? { selected: 'selected' } : {}) }, 'This browser only (demo — not cross-device)'),
  );

  const urlInput = h('input', { class: 'input', type: 'text', placeholder: 'https://your-backend.example.com/loreforge', value: state.baseUrl, oninput: (e) => { state.baseUrl = e.target.value; } });
  const keyInput = h('input', { class: 'input', type: 'password', placeholder: 'API key / token (optional)', value: state.apiKey, oninput: (e) => { state.apiKey = e.target.value; } });
  const restFields = h('div', {},
    field('Backend URL', urlInput, 'Endpoints: GET/PUT {url}/{projectId}. Any small key-value backend works.'),
    field('API Key', keyInput, 'Sent as a Bearer token. Stored only in this browser.'),
  );

  function toggleRestFields() {
    restFields.style.display = state.mode === 'rest' ? '' : 'none';
  }

  const autoToggle = h('input', { type: 'checkbox', checked: state.autoSync, onchange: (e) => { state.autoSync = e.target.checked; } });

  const content = h('div', {},
    h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px' } },
      'Cloud sync is ', h('strong', {}, 'optional'), '. Your work always saves locally first and the app keeps working offline. ',
      'When enabled, each project is synced as a whole snapshot with conflict detection, so you can pick up on another device.',
    ),
    field('Mode', modeSelect),
    restFields,
    h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' } },
      autoToggle, 'Sync automatically as I edit (recommended)'),
  );
  toggleRestFields();

  // Ensure the UI-driven conflict resolver is installed whenever settings open.
  setConflictResolver(promptConflict);

  openModal({
    title: '☁️ Cloud Sync',
    content,
    actions: [
      { label: 'Turn Off', variant: 'ghost', onClick: () => { clearSyncSettings(); initSync(); toastInfo('Cloud sync turned off — your data stays local.'); } },
      { label: 'Cancel', variant: '' },
      {
        label: 'Enable & Sync',
        variant: 'primary',
        onClick: async () => {
          if (state.mode === 'rest' && !state.baseUrl.trim()) { toastInfo('Enter a backend URL, or choose demo mode.'); return false; }
          saveSyncSettings({ ...state, enabled: true, baseUrl: state.baseUrl.trim(), apiKey: state.apiKey.trim() });
          initSync();
          toastSuccess('Cloud sync enabled.');
          const r = await syncNow();
          if (r.ok && r.res && r.res.conflicts && r.res.conflicts.length) toastInfo('Sync completed with a conflict — resolved per your choice.');
        },
      },
    ],
  });
}

/**
 * UI conflict resolver invoked by the sync engine. Presents a clear choice
 * between the two versions. Returns 'local' | 'remote' | 'cancel'.
 */
export function promptConflict(local, remote) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const localWhen = local?._meta?.exportDate ? new Date(local._meta.exportDate).toLocaleString() : 'this device';
    const remoteWhen = remote?.updatedAt ? new Date(remote.updatedAt).toLocaleString() : 'the cloud';

    openModal({
      title: '⚠️ Sync Conflict',
      content: h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' } },
        h('p', {}, 'This project changed both on this device and in the cloud since the last sync. Which version should win?'),
        h('ul', { style: { marginTop: '8px', paddingLeft: '18px' } },
          h('li', {}, h('strong', {}, 'Keep this device'), ` — your local edits (${localWhen}). The cloud will be overwritten.`),
          h('li', { style: { marginTop: '4px' } }, h('strong', {}, 'Keep cloud'), ` — the cloud version (${remoteWhen}). Your unsynced local edits will be replaced.`),
        ),
      ),
      actions: [
        { label: 'Cancel', variant: '', onClick: () => done('cancel') },
        { label: 'Keep Cloud', variant: '', onClick: () => done('remote') },
        { label: 'Keep This Device', variant: 'primary', onClick: () => done('local') },
      ],
      onClose: () => done('cancel'),
    });
  });
}

function field(label, control, hint) {
  return h('div', { style: { marginBottom: '14px' } },
    h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label),
    control,
    hint ? h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' } }, hint) : null,
  );
}
