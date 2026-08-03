/**
 * LoreForge Planner - Expandable Text Field
 * Creates text inputs/textareas with an expand button that opens a
 * full-screen editor popup for comfortable editing.
 */

import { h } from '../core/renderer.js';

/**
 * Create an expandable text field (textarea with expand button)
 * @param {object} opts - { placeholder, value, label, oninput, rows }
 * @returns {HTMLElement}
 */
export function expandableText(opts = {}) {
  const {
    placeholder = 'Enter text...',
    value = '',
    label = 'Edit Text',
    oninput = () => {},
    rows = 3,
  } = opts;

  let currentValue = value;

  const textarea = h('textarea', {
    class: 'input',
    placeholder,
    style: { minHeight: `${rows * 24}px`, paddingRight: '36px' },
    oninput: (e) => { currentValue = e.target.value; oninput(e); },
  });
  if (value) textarea.value = value;

  const expandBtn = h('button', {
    class: 'input-expandable__expand',
    title: 'Expand to full editor',
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExpandedEditor(label, currentValue, (newVal) => {
        currentValue = newVal;
        textarea.value = newVal;
        // Trigger the oninput callback
        oninput({ target: { value: newVal } });
      });
    },
  }, '⤢');

  const wrapper = h('div', { class: 'input-expandable' },
    textarea,
    expandBtn,
  );

  return wrapper;
}

/**
 * Open the full-screen text editor popup
 */
function openExpandedEditor(title, initialValue, onSave) {
  const existing = document.querySelector('.text-expand-overlay');
  if (existing) existing.remove();

  let currentValue = initialValue || '';

  const textarea = h('textarea', {
    class: 'text-expand-editor__textarea',
    placeholder: 'Type here...',
    oninput: (e) => {
      currentValue = e.target.value;
      updateCount();
    },
  });
  textarea.value = currentValue;

  const charCount = h('span', { class: 'text-expand-editor__count' }, `${currentValue.length} characters`);

  function updateCount() {
    charCount.textContent = `${currentValue.length} characters • ${currentValue.split(/\s+/).filter(Boolean).length} words`;
  }
  updateCount();

  const overlay = h('div', {
    class: 'text-expand-overlay',
    onclick: (e) => { if (e.target === overlay) { onSave(currentValue); overlay.remove(); } }
  },
    h('div', { class: 'text-expand-editor' },
      h('div', { class: 'text-expand-editor__header' },
        h('span', { class: 'text-expand-editor__title' }, `📝 ${title}`),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => { onSave(currentValue); overlay.remove(); } }, '✕'),
      ),
      h('div', { class: 'text-expand-editor__body' }, textarea),
      h('div', { class: 'text-expand-editor__footer' },
        charCount,
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button', { class: 'btn', onclick: () => { onSave(initialValue); overlay.remove(); } }, 'Cancel'),
          h('button', { class: 'btn btn--primary', onclick: () => { onSave(currentValue); overlay.remove(); } }, 'Done'),
        ),
      ),
    )
  );

  document.body.appendChild(overlay);

  // Focus textarea
  setTimeout(() => textarea.focus(), 50);
}

/**
 * Create an expandable single-line input that opens a popup on expand
 */
export function expandableInput(opts = {}) {
  const {
    placeholder = 'Enter text...',
    value = '',
    label = 'Edit Text',
    oninput = () => {},
  } = opts;

  let currentValue = value;

  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder,
    style: { paddingRight: '36px' },
    oninput: (e) => { currentValue = e.target.value; oninput(e); },
  });
  if (value) input.value = value;

  const expandBtn = h('button', {
    class: 'input-expandable__expand',
    title: 'Expand to full editor',
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExpandedEditor(label, currentValue, (newVal) => {
        currentValue = newVal;
        input.value = newVal;
        oninput({ target: { value: newVal } });
      });
    },
  }, '⤢');

  const wrapper = h('div', { class: 'input-expandable' },
    input,
    expandBtn,
  );

  return wrapper;
}
