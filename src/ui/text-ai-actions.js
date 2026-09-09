/**
 * LoreForge Planner - Selection AI Actions (§12)
 *
 * Attaches contextual, story-aware AI actions to a writing <textarea>. When the
 * writer selects a passage, a small ✨ button appears; clicking it opens a menu
 * of transforms (Improve, Rewrite, More atmospheric, Increase tension, Shorten,
 * Add description, Continue from here). The result is shown with Apply / Insert
 * / Copy — Apply replaces the selection (or inserts after it) and writes back
 * through the textarea's existing input/save handlers by dispatching a synthetic
 * `input` event, so no editor save logic needs to change.
 *
 * Offline-first: the underlying core/story-ai.getSelectionResponse falls back to
 * an on-device transform when no AI key is configured.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { SELECTION_ACTIONS, getSelectionResponse } from '../core/story-ai.js';
import { toastSuccess, toastError } from './toast.js';

const MIN_SELECTION = 2; // chars; below this we don't offer actions

/**
 * Attach selection AI actions to a textarea.
 * @param {HTMLTextAreaElement} textarea
 * @returns {() => void} detach function
 */
export function attachTextAIActions(textarea) {
  if (!textarea || textarea.dataset.aiActions === 'on') return () => {};
  textarea.dataset.aiActions = 'on';

  let trigger = null;   // the floating ✨ button
  let menu = null;      // the action menu / result popover
  let sel = null;       // { start, end, text }

  const removeTrigger = () => { if (trigger) { trigger.remove(); trigger = null; } };
  const removeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  const teardown = () => { removeTrigger(); removeMenu(); sel = null; };

  /** Current selection in the textarea, or null. */
  function currentSelection() {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (end - start < MIN_SELECTION) return null;
    return { start, end, text: textarea.value.slice(start, end) };
  }

  /** Position the floating trigger near the end of the selection. */
  function showTrigger() {
    removeTrigger();
    const rect = textarea.getBoundingClientRect();
    trigger = h('button', {
      class: 'text-ai-trigger',
      type: 'button',
      title: 'AI actions for selection',
      'aria-label': 'AI actions for selection',
      // Anchor to the top-right of the textarea viewport — simple, robust, and
      // never covers the caret (exact caret coords aren't available for a
      // textarea without heavy measurement).
      style: { position: 'fixed', top: `${rect.top + 8}px`, left: `${rect.right - 44}px` },
      // Use mousedown so the textarea doesn't lose its selection to a blur first.
      onmousedown: (e) => { e.preventDefault(); openMenu(); },
    }, '✨');
    document.body.appendChild(trigger);
  }

  function openMenu() {
    if (!sel) return;
    removeMenu();
    const rect = textarea.getBoundingClientRect();
    menu = h('div', {
      class: 'text-ai-menu',
      style: { position: 'fixed', top: `${rect.top + 40}px`, left: `${Math.max(8, rect.right - 240)}px` },
      onmousedown: (e) => e.preventDefault(), // keep selection
    },
      h('div', { class: 'text-ai-menu__head' }, '✨ AI actions'),
      h('div', { class: 'text-ai-menu__actions' },
        ...SELECTION_ACTIONS.map((a) => h('button', {
          class: 'text-ai-menu__action', type: 'button',
          onclick: () => runAction(a),
        }, h('span', { 'aria-hidden': 'true' }, a.icon), ` ${a.label}`)),
      ),
    );
    document.body.appendChild(menu);
  }

  async function runAction(action) {
    if (!sel) return;
    // Show a loading state inside the menu.
    if (menu) {
      menu.innerHTML = '';
      menu.appendChild(h('div', { class: 'text-ai-menu__loading' }, h('span', { class: 'text-ai-spinner' }), `${action.label}…`));
    }
    let res;
    try {
      res = await getSelectionResponse(action.id, sel.text, { activeModule: appStore.getState().activeModule });
    } catch (_) {
      res = { text: sel.text, mode: action.mode, usedAI: false, note: 'Something went wrong.' };
    }
    if (!menu) return; // dismissed while awaiting
    showResult(action, res);
  }

  function showResult(action, res) {
    removeMenu();
    const rect = textarea.getBoundingClientRect();
    const applyLabel = res.mode === 'insert' ? 'Insert after' : 'Replace selection';

    const apply = () => {
      const val = textarea.value;
      if (res.mode === 'insert') {
        const at = sel.end;
        const insertText = (res.text.startsWith(' ') || res.text.startsWith('\n')) ? res.text : ` ${res.text}`;
        textarea.value = val.slice(0, at) + insertText + val.slice(at);
        textarea.setSelectionRange(at, at + insertText.length);
      } else {
        textarea.value = val.slice(0, sel.start) + res.text + val.slice(sel.end);
        textarea.setSelectionRange(sel.start, sel.start + res.text.length);
      }
      // Write back through the editor's own save path. A bubbling 'input' event
      // triggers the existing oninput handlers (they only read target.value).
      textarea.dispatchEvent(new CustomEvent('input', { bubbles: true }));
      textarea.focus();
      toastSuccess('Applied.');
      teardown();
    };

    const copy = () => {
      try {
        navigator.clipboard.writeText(res.text);
        toastSuccess('Copied.');
      } catch (_) { toastError('Could not copy.'); }
    };

    menu = h('div', {
      class: 'text-ai-menu text-ai-result',
      style: { position: 'fixed', top: `${rect.top + 40}px`, left: `${Math.max(8, rect.right - 320)}px` },
      onmousedown: (e) => e.preventDefault(),
    },
      h('div', { class: 'text-ai-menu__head' }, `✨ ${action.label}`),
      h('div', { class: 'text-ai-result__body' }, res.text && res.text.trim() ? res.text : '(no change)'),
      res.note ? h('div', { class: 'text-ai-result__note' }, res.note) : null,
      h('div', { class: 'text-ai-result__actions' },
        h('button', { class: 'btn btn--primary btn--sm', onclick: apply }, applyLabel),
        h('button', { class: 'btn btn--sm', onclick: copy }, 'Copy'),
        h('button', { class: 'btn btn--ghost btn--sm', onclick: teardown }, 'Dismiss'),
      ),
      h('div', { class: 'text-ai-result__source' }, res.usedAI ? '✨ Your AI model' : '⚙ On-device'),
    );
    document.body.appendChild(menu);
  }

  // ── Wire selection detection ────────────────────────────────────────────
  const onSelect = () => {
    // Don't disturb an open menu (user is interacting with results).
    if (menu) return;
    sel = currentSelection();
    if (sel) showTrigger(); else removeTrigger();
  };
  const onScrollOrResize = () => teardown();

  textarea.addEventListener('mouseup', onSelect);
  textarea.addEventListener('keyup', onSelect);
  textarea.addEventListener('blur', () => { /* keep trigger; menu interactions use mousedown */ });
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return () => {
    teardown();
    textarea.dataset.aiActions = '';
    textarea.removeEventListener('mouseup', onSelect);
    textarea.removeEventListener('keyup', onSelect);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  };
}
