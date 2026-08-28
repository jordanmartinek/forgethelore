/**
 * LoreForge Planner - AI Settings Panel
 *
 * A small modal to configure the optional Bring-Your-Own-Key AI provider.
 * Emphasizes that AI is optional and the key stays local.
 */

import { h } from '../core/renderer.js';
import { openModal } from './modal.js';
import { toastSuccess, toastInfo } from './toast.js';
import { getAISettings, saveAISettings, clearAISettings } from '../core/ai-settings.js';
import { PROVIDERS } from '../core/ai.js';

export function openAISettings() {
  const current = getAISettings();
  const state = { provider: current.provider || '', apiKey: current.apiKey || '', model: current.model || '' };

  const providerSelect = h('select', { class: 'input', onchange: (e) => { state.provider = e.target.value; updateModelPlaceholder(); } },
    h('option', { value: '' }, 'Off (use offline analysis only)'),
    h('option', { value: 'openai', ...(state.provider === 'openai' ? { selected: 'selected' } : {}) }, 'OpenAI (ChatGPT)'),
    h('option', { value: 'anthropic', ...(state.provider === 'anthropic' ? { selected: 'selected' } : {}) }, 'Anthropic (Claude)'),
  );

  const keyInput = h('input', {
    class: 'input', type: 'password', placeholder: 'Paste your API key (stored locally)',
    value: state.apiKey, oninput: (e) => { state.apiKey = e.target.value; },
  });

  const modelInput = h('input', {
    class: 'input', type: 'text', placeholder: 'Model (optional)',
    value: state.model, oninput: (e) => { state.model = e.target.value; },
  });

  function updateModelPlaceholder() {
    const cfg = PROVIDERS[state.provider];
    modelInput.placeholder = cfg ? `Model (default: ${cfg.defaultModel})` : 'Model (optional)';
  }
  updateModelPlaceholder();

  const field = (label, control, hint) => h('div', { style: { marginBottom: '14px' } },
    h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label),
    control,
    hint ? h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' } }, hint) : null,
  );

  const content = h('div', {},
    h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px' } },
      'AI is ', h('strong', {}, 'optional'), '. Without a key, LoreForge still analyzes your board for consistency issues and strategic gaps entirely offline. ',
      'Add a key to get richer, model-generated suggestions. Your key is stored only in this browser and sent only to the provider you choose.',
    ),
    field('Provider', providerSelect),
    field('API Key', keyInput, 'Never leaves your device except to call the provider directly.'),
    field('Model', modelInput, 'Leave blank to use a fast, inexpensive default.'),
  );

  openModal({
    title: '🧠 AI Settings',
    content,
    actions: [
      { label: 'Clear Key', variant: 'ghost', onClick: () => { clearAISettings(); toastInfo('AI disabled — using offline analysis.'); } },
      { label: 'Cancel', variant: '' },
      {
        label: 'Save',
        variant: 'primary',
        onClick: () => {
          saveAISettings({ provider: state.provider, apiKey: state.apiKey.trim(), model: state.model.trim() });
          if (state.provider && state.apiKey.trim()) toastSuccess(`AI enabled via ${state.provider}.`);
          else toastInfo('AI is off — offline analysis is active.');
        },
      },
    ],
  });
}
