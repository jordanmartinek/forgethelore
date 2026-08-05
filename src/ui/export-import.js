/**
 * LoreForge Planner - Export / Import
 * Download all project data as a JSON file, or import from a file.
 * Works fully offline — no backend needed.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';

/**
 * Export the current project's data as a downloadable JSON file
 */
export function exportProject() {
  const state = appStore.getState();
  const projectId = state.activeProjectId;
  const project = state.projects.find(p => p.id === projectId);
  const projectName = project ? project.name : 'LoreForge Project';

  // Gather all localStorage keys for this project
  const prefix = `loreforge_${projectId}_`;
  const data = {};
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(prefix)) {
      const shortKey = key.slice(prefix.length);
      try {
        data[shortKey] = JSON.parse(localStorage.getItem(key));
      } catch (e) {
        data[shortKey] = localStorage.getItem(key);
      }
    }
  }

  // Include project metadata
  const exportPayload = {
    _meta: {
      appName: 'LoreForge Planner',
      version: '1.0',
      exportDate: new Date().toISOString(),
      projectId,
      projectName: project?.name || 'Unknown',
      projectIcon: project?.icon || '📖',
      projectDescription: project?.description || '',
    },
    data,
  };

  // Create and download the file
  const json = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.loreforge.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Toast
  showToast(`✅ "${projectName}" exported successfully`);
}

/**
 * Import project data from a JSON file
 * Creates a new project or overwrites the current one
 */
export function importProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.loreforge.json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        
        if (!payload._meta || !payload.data) {
          alert('Invalid file format. Please select a valid LoreForge export file.');
          return;
        }

        const meta = payload._meta;
        const importMode = confirm(
          `Import "${meta.projectName}"?\n\n` +
          `Exported: ${new Date(meta.exportDate).toLocaleString()}\n` +
          `Data keys: ${Object.keys(payload.data).length}\n\n` +
          `OK = Create as new project\n` +
          `Cancel = Abort import`
        );

        if (!importMode) return;

        // Create a new project for the imported data
        const newProjectId = `proj_${Date.now()}`;
        const state = appStore.getState();
        
        // Add to project list
        state.projects.push({
          id: newProjectId,
          name: meta.projectName || 'Imported Project',
          icon: meta.projectIcon || '📥',
          lastOpened: Date.now(),
          description: meta.projectDescription || `Imported on ${new Date().toLocaleDateString()}`,
        });
        localStorage.setItem('loreforge_projects', JSON.stringify(state.projects));

        // Write all data under the new project's namespace
        const prefix = `loreforge_${newProjectId}_`;
        for (const [key, value] of Object.entries(payload.data)) {
          localStorage.setItem(prefix + key, JSON.stringify(value));
        }

        // Switch to the imported project
        localStorage.setItem('loreforge_activeProjectId', newProjectId);
        
        showToast(`✅ "${meta.projectName}" imported! Reloading...`);
        
        // Reload to pick up the new project
        setTimeout(() => window.location.reload(), 1000);
        
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

/**
 * Render the Export/Import panel (accessible from settings or command palette)
 */
export function renderExportImport(container) {
  const state = appStore.getState();
  const project = state.projects.find(p => p.id === state.activeProjectId);

  const panel = h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    h('div', { style: { maxWidth: '500px', width: '100%', padding: '32px' } },
      h('div', { style: { textAlign: 'center', marginBottom: '32px' } },
        h('div', { style: { fontSize: '48px', marginBottom: '12px' } }, '💾'),
        h('h2', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '8px' } }, 'Export & Import'),
        h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' } }, 'Transfer your universe between devices. Export downloads a .json file with all your project data. Import loads it on any device.'),
      ),

      // Export section
      h('div', { style: { padding: '20px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '16px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' } },
          h('span', { style: { fontSize: '24px' } }, '⬇️'),
          h('div', {},
            h('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' } }, 'Export Current Project'),
            h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, project ? `"${project.name}" — all data as a .json file` : 'No project selected'),
          ),
        ),
        h('button', { class: 'btn btn--primary', style: { width: '100%' }, onclick: exportProject }, '⬇️ Download Project File'),
      ),

      // Import section
      h('div', { style: { padding: '20px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '16px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' } },
          h('span', { style: { fontSize: '24px' } }, '⬆️'),
          h('div', {},
            h('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' } }, 'Import Project'),
            h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Load a .loreforge.json file from another device'),
          ),
        ),
        h('button', { class: 'btn', style: { width: '100%' }, onclick: importProject }, '⬆️ Choose File to Import'),
      ),

      // Info
      h('div', { style: { padding: '16px', background: 'rgba(99,102,241,0.05)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' } },
        h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.7' } },
          h('strong', { style: { color: 'var(--text-primary)' } }, 'How to sync between devices:'),
          h('br', {}),
          '1. Export your project on Device A',
          h('br', {}),
          '2. Transfer the .json file (email, USB, cloud drive)',
          h('br', {}),
          '3. Import on Device B',
          h('br', {}),
          h('br', {}),
          h('strong', { style: { color: 'var(--text-primary)' } }, 'Offline changes:'),
          h('br', {}),
          'Export captures everything in localStorage, including changes made offline. Import creates a new project so it never overwrites existing data.',
        ),
      ),
    ),
  );

  container.appendChild(panel);
}

function showToast(message) {
  const toast = h('div', { style: { position: 'fixed', bottom: '20px', right: '20px', padding: '12px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: '9999', fontSize: '13px', color: 'var(--text-primary)', animation: 'slideUp 0.3s ease' } }, message);
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
