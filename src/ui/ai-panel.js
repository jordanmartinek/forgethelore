/**
 * LoreForge Planner - Story AI Panel (⌘J)
 *
 * §12: a lightweight, story-aware AI side panel — a writing partner, not a
 * generic chatbot. It presents the contextual STORY_ACTIONS and a free-text
 * "ask" box, shows which story context it can see, and renders responses from
 * core/story-ai.getStoryResponse (model-backed when a key is set, deterministic
 * on-device otherwise). A quiet slide-in panel rather than a full page, so the
 * writer stays in flow.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { STORY_ACTIONS, getStoryResponse, buildStoryContext, isAIEnabled } from '../core/story-ai.js';
import { openAISettings } from './ai-settings-panel.js';

let panelEl = null;

/** Is the panel currently open? */
export function isAIPanelOpen() {
  return Boolean(panelEl && panelEl.isConnected);
}

/** Close the panel if open. */
export function closeAIPanel() {
  if (panelEl) { panelEl.remove(); panelEl = null; document.removeEventListener('keydown', onKey, true); }
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeAIPanel(); }
}

/** Toggle the panel. */
export function toggleAIPanel() {
  if (isAIPanelOpen()) { closeAIPanel(); return; }
  openAIPanel();
}

/** Render a response body (plain text w/ simple bullets + line breaks). */
function renderBody(body) {
  const lines = String(body || '').split('\n');
  const nodes = [];
  let bullets = null;
  const flush = () => { if (bullets) { nodes.push(h('ul', { class: 'ai-panel__bullets' }, ...bullets)); bullets = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith('- ')) {
      (bullets = bullets || []).push(h('li', {}, t.slice(2)));
    } else {
      flush();
      nodes.push(h('p', { class: 'ai-panel__p' }, t));
    }
  }
  flush();
  return h('div', {}, ...nodes);
}

function setResult(node) {
  const out = panelEl && panelEl.querySelector('.ai-panel__result');
  if (!out) return;
  out.innerHTML = '';
  out.appendChild(node);
}

async function run(action, input) {
  setResult(h('div', { class: 'ai-panel__loading' }, h('span', { class: 'ai-panel__spinner' }), 'Thinking…'));
  const activeModule = appStore.getState().activeModule;
  let res;
  try {
    res = await getStoryResponse(action, input, { activeModule });
  } catch (_) {
    res = { title: '', body: 'Something went wrong. Please try again.', usedAI: false };
  }
  if (!isAIPanelOpen()) return;
  setResult(h('div', { class: 'ai-panel__response card' },
    res.title ? h('div', { class: 'ai-panel__response-title' }, res.title) : null,
    renderBody(res.body),
    h('div', { class: 'ai-panel__source' }, res.usedAI ? '✨ Written by your AI model' : '⚙ On-device suggestion'),
  ));
}

export function openAIPanel() {
  closeAIPanel();
  const ctx = buildStoryContext();
  const aiOn = isAIEnabled();

  // A quiet summary of what the assistant can "see".
  const contextChips = [
    ctx.characters.length ? `${ctx.characters.length} characters` : null,
    ctx.locations.length ? `${ctx.locations.length} places` : null,
    ctx.factions.length ? `${ctx.factions.length} factions` : null,
    ctx.manuscript.totalWords ? `${ctx.manuscript.totalWords.toLocaleString()} words` : null,
  ].filter(Boolean);

  const askInput = h('input', {
    class: 'input ai-panel__ask', type: 'text',
    placeholder: 'Ask about your world, or type a request…',
    onkeydown: (e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) run('ask', e.currentTarget.value.trim()); },
  });

  panelEl = h('aside', { class: 'ai-panel', role: 'dialog', 'aria-label': 'Story AI assistant' },
    h('div', { class: 'ai-panel__header' },
      h('div', { class: 'ai-panel__title' }, h('span', { 'aria-hidden': 'true' }, '✨'), ' Story AI'),
      h('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'Close', onclick: closeAIPanel }, '✕'),
    ),

    // Context strip
    contextChips.length
      ? h('div', { class: 'ai-panel__context' },
          h('span', { class: 'ai-panel__context-label' }, 'Knows about:'),
          ...contextChips.map((c) => h('span', { class: 'ai-panel__chip' }, c)),
        )
      : h('div', { class: 'ai-panel__context ai-panel__context--empty' }, 'Add characters or write a scene to give the assistant context.'),

    // Ask box
    h('div', { class: 'ai-panel__ask-row' },
      askInput,
      h('button', { class: 'btn btn--primary btn--sm', onclick: () => { if (askInput.value.trim()) run('ask', askInput.value.trim()); } }, 'Ask'),
    ),

    // Action buttons
    h('div', { class: 'ai-panel__actions' },
      ...STORY_ACTIONS.filter((a) => !a.freeform).map((a) =>
        h('button', { class: 'ai-panel__action', title: a.hint, onclick: () => run(a.id, '') },
          h('span', { class: 'ai-panel__action-icon' }, a.icon),
          h('span', { class: 'ai-panel__action-label' }, a.label),
        )),
    ),

    // Result area
    h('div', { class: 'ai-panel__result' },
      h('div', { class: 'ai-panel__hint' }, 'Pick an action or ask a question. Responses are grounded in your story.'),
    ),

    // Footer: key status
    h('div', { class: 'ai-panel__footer' },
      aiOn
        ? h('span', { class: 'ai-panel__footer-on' }, '✨ Using your configured AI model')
        : h('button', { class: 'btn btn--ghost btn--sm', onclick: () => openAISettings() }, 'Add an AI key for richer replies →'),
    ),
  );

  document.body.appendChild(panelEl);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => askInput.focus(), 30);
}
