/**
 * LoreForge Planner - Shared Modal & Form Primitives
 *
 * A single, accessible modal implementation used across all modules. Previously
 * `showModal` and `formField` were re-defined inside almost every module, and
 * none of them were accessible. Consolidating here means:
 *   - one place to fix bugs and styling
 *   - built-in accessibility (role="dialog", aria-modal, labelled title,
 *     focus trapping, Escape to close, focus restore on close)
 *
 * Also provides confirm/prompt replacements so modules can stop using the
 * blocking native alert()/confirm()/prompt() dialogs.
 */

import { h } from '../core/renderer.js';

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Open an accessible modal dialog.
 *
 * @param {object} opts
 * @param {string} opts.title        Dialog title (announced to screen readers).
 * @param {Node|Node[]} opts.content Body content.
 * @param {Array<object>} [opts.actions] Footer buttons:
 *        { label, variant?: 'primary'|'ghost'|'', onClick?: (close)=>void, closeOnClick?: boolean }
 *        If omitted, a single "Close" button is shown.
 * @param {() => void} [opts.onClose] Called after the dialog is dismissed.
 * @returns {{ close: () => void, root: HTMLElement }}
 */
export function openModal(opts = {}) {
  const { title = '', content = null, actions = null, onClose = null } = opts;

  // Remove any stale overlay so we never stack two dialogs.
  document.querySelectorAll('.modal-overlay').forEach((n) => n.remove());

  const titleId = nextId('modal-title');
  const previouslyFocused = document.activeElement;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    // Restore focus to whatever launched the modal for keyboard users.
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus(); } catch (_) { /* element gone */ }
    }
    if (typeof onClose === 'function') onClose();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      trapFocus(e);
    }
  }

  function trapFocus(e) {
    const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusables.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const footerButtons = (actions && actions.length
    ? actions
    : [{ label: 'Close', variant: 'primary' }]
  ).map((action) =>
    h('button', {
      class: `btn ${action.variant === 'primary' ? 'btn--primary' : action.variant === 'ghost' ? 'btn--ghost' : ''}`,
      type: 'button',
      onclick: () => {
        const result = typeof action.onClick === 'function' ? action.onClick(close) : undefined;
        // Close by default unless the handler explicitly opts out or returns false.
        if (action.closeOnClick !== false && result !== false) close();
      },
    }, action.label)
  );

  const dialog = h('div', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    tabindex: '-1',
  },
    h('div', { class: 'modal__header' },
      h('span', { class: 'modal__title', id: titleId }, title),
      h('button', {
        class: 'btn btn--ghost btn--icon',
        type: 'button',
        'aria-label': 'Close dialog',
        onclick: () => close(),
      }, '✕'),
    ),
    h('div', { class: 'modal__body' }, content),
    h('div', { class: 'modal__footer' }, ...footerButtons),
  );

  const overlay = h('div', {
    class: 'modal-overlay',
    onclick: (e) => { if (e.target === overlay) close(); },
  }, dialog);

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeydown, true);

  // Move focus into the dialog: first field if present, else the dialog itself.
  setTimeout(() => {
    const firstField = dialog.querySelector('input, textarea, select, button.btn--primary');
    (firstField || dialog).focus();
  }, 20);

  return { close, root: overlay };
}

/**
 * Backwards-compatible helper matching the old per-module `showModal(title,
 * content, onSave)` signature, but powered by the accessible modal above.
 */
export function showModal(title, content, onSave) {
  return openModal({
    title,
    content,
    actions: [
      { label: 'Cancel', variant: '' },
      {
        label: 'Save',
        variant: 'primary',
        onClick: () => { if (typeof onSave === 'function') onSave(); },
      },
    ],
  });
}

/**
 * A labelled form field wrapper. `label` is associated with the control via
 * htmlFor/id so screen readers announce it.
 */
export function formField(label, inputEl) {
  const fieldId = nextId('field');
  if (inputEl && !inputEl.id) inputEl.id = fieldId;
  return h('div', { class: 'form-field', style: { marginBottom: '12px' } },
    h('label', {
      for: inputEl ? inputEl.id : fieldId,
      style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' },
    }, label),
    inputEl,
  );
}

/**
 * Accessible confirmation dialog. Replacement for window.confirm.
 * @returns {Promise<boolean>} resolves true if confirmed.
 */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolve(value); } };
    openModal({
      title,
      content: h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' } }, message),
      actions: [
        { label: cancelLabel, variant: '', onClick: () => settle(false) },
        { label: confirmLabel, variant: danger ? '' : 'primary', onClick: () => settle(true) },
      ],
      onClose: () => settle(false),
    });
  });
}

/**
 * Accessible single-field prompt. Replacement for window.prompt.
 * @returns {Promise<string|null>} resolves the entered value, or null if cancelled.
 */
export function promptDialog({ title = 'Enter a value', label = '', placeholder = '', defaultValue = '', confirmLabel = 'OK' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolve(value); } };

    const input = h('input', { class: 'input', type: 'text', placeholder, value: defaultValue });
    const field = label ? formField(label, input) : input;

    const { close } = openModal({
      title,
      content: field,
      actions: [
        { label: 'Cancel', variant: '', onClick: () => settle(null) },
        {
          label: confirmLabel,
          variant: 'primary',
          onClick: () => settle(input.value.trim() ? input.value.trim() : null),
        },
      ],
      onClose: () => settle(null),
    });

    // Enter submits the prompt.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        settle(input.value.trim() ? input.value.trim() : null);
        close();
      }
    });
  });
}
