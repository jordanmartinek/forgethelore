/**
 * LoreForge Planner - Writing Sprint
 * Timed writing sessions with goal checklists displayed alongside the editor.
 * 
 * Features:
 *   - Configurable timer (5, 10, 15, 20, 25, 30, 45, 60 min or custom)
 *   - Goal checklist (add items before or during sprint)
 *   - Live countdown timer visible while writing
 *   - Word count tracking (start vs current)
 *   - Sprint history with stats
 */

import { h } from '../core/renderer.js';
import { loadData, persistState } from '../core/persist.js';
import { confirmDialog } from '../ui/modal.js';
import { generateId } from '../core/objects.js';

// ─── State ───────────────────────────────────────────────────────────────────

let sprints = [];
let currentSprint = null;   // The active sprint object
let timerInterval = null;   // setInterval reference
let timeRemaining = 0;      // seconds left
let startWordCount = 0;     // word count when sprint started

function loadSprints() {
  sprints = loadData('writingSprints', []);
}

function saveSprints() {
  persistState('writingSprints', sprints);
}

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderWritingSprint(container) {
  loadSprints();

  // If there's an active sprint in progress, show the sprint view
  if (currentSprint && currentSprint.status === 'running') {
    container.appendChild(renderSprintActive());
  } else {
    container.appendChild(renderSprintSetup());
  }
}

// ─── Setup View (Configure a new sprint) ─────────────────────────────────────

function renderSprintSetup() {
  // Temp state for setup form
  const setupState = {
    duration: 15,
    customDuration: '',
    goals: [],
    newGoalText: '',
  };

  const presets = [5, 10, 15, 20, 25, 30, 45, 60];

  const wrapper = h('div', { class: 'sprint-setup' },
    // Left: Setup form
    h('div', { class: 'sprint-setup__form' },
      h('div', { class: 'sprint-setup__header' },
        h('h1', { class: 'sprint-setup__title' }, '⏱️ Writing Sprint'),
        h('p', { class: 'sprint-setup__subtitle' }, 'Set your timer, define your goals, and write with focus.'),
      ),

      // Timer selection
      h('div', { class: 'sprint-setup__section' },
        h('label', { class: 'sprint-setup__label' }, 'Sprint Duration'),
        h('div', { class: 'sprint-setup__presets' },
          ...presets.map(mins =>
            h('button', {
              class: `sprint-setup__preset ${mins === setupState.duration ? 'sprint-setup__preset--active' : ''}`,
              onclick: (e) => {
                setupState.duration = mins;
                setupState.customDuration = '';
                e.currentTarget.parentElement.querySelectorAll('.sprint-setup__preset').forEach(b => b.classList.remove('sprint-setup__preset--active'));
                e.currentTarget.classList.add('sprint-setup__preset--active');
                // Clear custom input
                const customInput = document.getElementById('sprint-custom-duration');
                if (customInput) customInput.value = '';
              },
            }, `${mins}m`)
          ),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' } },
          h('input', {
            id: 'sprint-custom-duration',
            class: 'input',
            type: 'number',
            min: '1',
            max: '180',
            placeholder: 'Custom (min)',
            style: { width: '120px' },
            oninput: (e) => {
              const val = parseInt(e.target.value);
              if (val > 0) {
                setupState.duration = val;
                setupState.customDuration = val;
                // Deselect presets
                document.querySelectorAll('.sprint-setup__preset').forEach(b => b.classList.remove('sprint-setup__preset--active'));
              }
            }
          }),
          h('span', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'minutes'),
        ),
      ),

      // Goals
      h('div', { class: 'sprint-setup__section' },
        h('label', { class: 'sprint-setup__label' }, 'Sprint Goals (optional)'),
        h('p', { style: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' } }, 'Add checklist items to track during your sprint.'),
        h('div', { id: 'sprint-goals-list', class: 'sprint-setup__goals' }),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('input', {
            id: 'sprint-new-goal',
            class: 'input',
            placeholder: 'e.g. Write opening scene, Describe the throne room...',
            style: { flex: '1' },
            onkeydown: (e) => {
              if (e.key === 'Enter') {
                addGoalToSetup(setupState);
              }
            }
          }),
          h('button', { class: 'btn btn--primary btn--sm', onclick: () => addGoalToSetup(setupState) }, '+ Add'),
        ),
      ),

      // Start button
      h('div', { style: { marginTop: '24px' } },
        h('button', {
          class: 'btn btn--primary',
          style: { width: '100%', padding: '12px', fontSize: '15px', fontWeight: '700' },
          onclick: () => startSprint(setupState),
        }, `🚀 Start ${setupState.duration}-Minute Sprint`),
      ),
    ),

    // Right: Sprint History
    h('div', { class: 'sprint-setup__history' },
      h('h3', { class: 'sprint-setup__history-title' }, '📜 Sprint History'),
      sprints.length === 0
        ? h('div', { class: 'sprint-setup__history-empty' }, 'No sprints yet. Complete your first one!')
        : h('div', { class: 'sprint-setup__history-list' },
            ...sprints.slice(0, 15).map(sprint => renderSprintHistoryItem(sprint))
          ),
    ),
  );

  return wrapper;
}

function addGoalToSetup(setupState) {
  const input = document.getElementById('sprint-new-goal');
  const text = input.value.trim();
  if (!text) return;

  setupState.goals.push({ id: generateId(), text, completed: false });
  input.value = '';

  // Re-render goal list
  const list = document.getElementById('sprint-goals-list');
  if (list) {
    list.innerHTML = '';
    setupState.goals.forEach((goal, idx) => {
      list.appendChild(
        h('div', { class: 'sprint-goal-item sprint-goal-item--setup' },
          h('span', { class: 'sprint-goal-item__text' }, goal.text),
          h('button', {
            class: 'btn btn--ghost btn--sm',
            style: { color: 'var(--danger)', fontSize: '11px' },
            onclick: () => {
              setupState.goals.splice(idx, 1);
              addGoalToSetup.__rerender(setupState);
            }
          }, '✕'),
        )
      );
    });
  }
}
// Attach re-render helper
addGoalToSetup.__rerender = function(setupState) {
  const list = document.getElementById('sprint-goals-list');
  if (list) {
    list.innerHTML = '';
    setupState.goals.forEach((goal, idx) => {
      list.appendChild(
        h('div', { class: 'sprint-goal-item sprint-goal-item--setup' },
          h('span', { class: 'sprint-goal-item__text' }, goal.text),
          h('button', {
            class: 'btn btn--ghost btn--sm',
            style: { color: 'var(--danger)', fontSize: '11px' },
            onclick: () => {
              setupState.goals.splice(idx, 1);
              addGoalToSetup.__rerender(setupState);
            }
          }, '✕'),
        )
      );
    });
  }
};

// ─── Active Sprint View ──────────────────────────────────────────────────────

function renderSprintActive() {
  const sprint = currentSprint;

  const wrapper = h('div', { class: 'sprint-active' },
    // Left: Writing area
    h('div', { class: 'sprint-active__editor' },
      // Timer bar at top
      h('div', { class: 'sprint-active__timer-bar' },
        h('div', { class: 'sprint-active__timer-display', id: 'sprint-timer' }, formatTime(timeRemaining)),
        h('div', { class: 'sprint-active__timer-progress' },
          h('div', { class: 'sprint-active__timer-fill', id: 'sprint-timer-fill', style: { width: `${(timeRemaining / (sprint.duration * 60)) * 100}%` } }),
        ),
        h('div', { class: 'sprint-active__timer-meta' },
          h('span', { id: 'sprint-wordcount' }, `${countWords(sprint.content || '')} words`),
          h('span', { id: 'sprint-words-added' }, `+${countWords(sprint.content || '') - startWordCount} this sprint`),
        ),
        h('div', { class: 'sprint-active__timer-actions' },
          h('button', { class: 'btn btn--ghost btn--sm', onclick: pauseSprint, id: 'sprint-pause-btn' }, '⏸ Pause'),
          h('button', { class: 'btn btn--ghost btn--sm', style: { color: 'var(--danger)' }, onclick: endSprintEarly }, '⏹ End'),
        ),
      ),

      // Textarea
      h('textarea', {
        class: 'sprint-active__textarea',
        id: 'sprint-textarea',
        placeholder: 'Start writing... Let the words flow freely.\n\nYour goals are on the right — check them off as you go.',
        value: sprint.content || '',
        oninput: (e) => {
          sprint.content = e.target.value;
          updateSprintWordCount();
          saveSprints();
        },
        autofocus: true,
      }),
    ),

    // Right: Goals sidebar
    h('div', { class: 'sprint-active__sidebar' },
      h('div', { class: 'sprint-active__sidebar-header' },
        h('h3', {}, '🎯 Goals'),
        h('span', { class: 'sprint-active__goals-progress', id: 'sprint-goals-progress' },
          `${sprint.goals.filter(g => g.completed).length}/${sprint.goals.length}`
        ),
      ),
      h('div', { class: 'sprint-active__goals', id: 'sprint-goals-container' },
        sprint.goals.length === 0
          ? h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' } }, 'No goals set — just write freely!')
          : null,
        ...sprint.goals.map((goal, idx) => renderGoalCheckbox(goal, idx)),
      ),
      // Add goal during sprint
      h('div', { class: 'sprint-active__add-goal' },
        h('input', {
          id: 'sprint-live-goal-input',
          class: 'input',
          placeholder: 'Add a goal...',
          style: { fontSize: '12px' },
          onkeydown: (e) => {
            if (e.key === 'Enter') addGoalDuringSprint();
          }
        }),
        h('button', { class: 'btn btn--ghost btn--sm', onclick: addGoalDuringSprint }, '+'),
      ),
      // Sprint info
      h('div', { class: 'sprint-active__info' },
        h('div', { class: 'sprint-active__info-item' },
          h('span', {}, '⏱️ Duration'),
          h('span', {}, `${sprint.duration} min`),
        ),
        h('div', { class: 'sprint-active__info-item' },
          h('span', {}, '📝 Start Words'),
          h('span', {}, `${startWordCount}`),
        ),
        h('div', { class: 'sprint-active__info-item' },
          h('span', {}, '🏁 Started'),
          h('span', {}, new Date(sprint.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        ),
      ),
    ),
  );

  return wrapper;
}

function renderGoalCheckbox(goal, idx) {
  return h('label', {
    class: `sprint-goal-check ${goal.completed ? 'sprint-goal-check--done' : ''}`,
    dataset: { goalIdx: String(idx) },
  },
    h('input', {
      type: 'checkbox',
      checked: goal.completed,
      onchange: (e) => {
        goal.completed = e.target.checked;
        const label = e.target.closest('.sprint-goal-check');
        if (goal.completed) {
          label.classList.add('sprint-goal-check--done');
        } else {
          label.classList.remove('sprint-goal-check--done');
        }
        updateGoalsProgress();
        saveSprints();
      }
    }),
    h('span', { class: 'sprint-goal-check__text' }, goal.text),
  );
}

// ─── Sprint Lifecycle ────────────────────────────────────────────────────────

function startSprint(setupState) {
  const duration = setupState.duration;
  if (!duration || duration < 1) return;

  currentSprint = {
    id: generateId(),
    duration,
    goals: setupState.goals.map(g => ({ ...g })),
    content: '',
    startedAt: Date.now(),
    endedAt: null,
    status: 'running',
    wordsWritten: 0,
  };

  timeRemaining = duration * 60;
  startWordCount = 0;

  // Save to history
  sprints.unshift(currentSprint);
  saveSprints();

  // Start timer
  startTimer();

  // Re-render
  rerender();

  // Auto-focus textarea after render
  setTimeout(() => {
    const textarea = document.getElementById('sprint-textarea');
    if (textarea) textarea.focus();
  }, 50);
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeRemaining--;

    if (timeRemaining <= 0) {
      timeRemaining = 0;
      completeSprint();
      return;
    }

    // Update timer display
    const timerEl = document.getElementById('sprint-timer');
    if (timerEl) timerEl.textContent = formatTime(timeRemaining);

    // Update progress bar
    const fillEl = document.getElementById('sprint-timer-fill');
    if (fillEl && currentSprint) {
      fillEl.style.width = `${(timeRemaining / (currentSprint.duration * 60)) * 100}%`;
    }

    // Pulse effect when under 60 seconds
    if (timerEl && timeRemaining <= 60) {
      timerEl.classList.add('sprint-active__timer-display--urgent');
    }
  }, 1000);
}

function pauseSprint() {
  const btn = document.getElementById('sprint-pause-btn');
  if (!currentSprint) return;

  if (currentSprint.status === 'running') {
    currentSprint.status = 'paused';
    clearInterval(timerInterval);
    timerInterval = null;
    if (btn) btn.textContent = '▶ Resume';
  } else if (currentSprint.status === 'paused') {
    currentSprint.status = 'running';
    startTimer();
    if (btn) btn.textContent = '⏸ Pause';
  }
}

async function endSprintEarly() {
  const ok = await confirmDialog({ title: 'End this sprint early?', message: 'The sprint will be stopped and its results recorded now.', confirmLabel: 'End Sprint' });
  if (!ok) return;
  completeSprint();
}

function completeSprint() {
  clearInterval(timerInterval);
  timerInterval = null;

  // Guard against double-completion: the (non-blocking) "end early" dialog can
  // be open while the countdown timer fires, so both paths may call this.
  if (!currentSprint || currentSprint.status === 'completed') return;

  currentSprint.status = 'completed';
  currentSprint.endedAt = Date.now();
  currentSprint.wordsWritten = countWords(currentSprint.content || '') - startWordCount;

  saveSprints();

  // Show completion modal
  showCompletionModal();
}

function showCompletionModal() {
  const sprint = currentSprint;
  const wordsWritten = sprint.wordsWritten;
  const goalsCompleted = sprint.goals.filter(g => g.completed).length;
  const totalGoals = sprint.goals.length;
  const duration = sprint.duration;
  const actualMins = Math.round((sprint.endedAt - sprint.startedAt) / 60000);
  const wpm = actualMins > 0 ? Math.round(wordsWritten / actualMins) : 0;

  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) { overlay.remove(); resetAfterSprint(); } } },
    h('div', { class: 'modal', style: { maxWidth: '480px' } },
      h('div', { class: 'modal__header' },
        h('span', { class: 'modal__title' }, '🏁 Sprint Complete!'),
        h('button', { class: 'btn btn--ghost btn--icon', onclick: () => { overlay.remove(); resetAfterSprint(); } }, '✕'),
      ),
      h('div', { class: 'modal__body' },
        h('div', { class: 'sprint-complete__stats' },
          h('div', { class: 'sprint-complete__stat' },
            h('div', { class: 'sprint-complete__stat-value' }, String(wordsWritten)),
            h('div', { class: 'sprint-complete__stat-label' }, 'Words Written'),
          ),
          h('div', { class: 'sprint-complete__stat' },
            h('div', { class: 'sprint-complete__stat-value' }, `${actualMins}m`),
            h('div', { class: 'sprint-complete__stat-label' }, 'Time Spent'),
          ),
          h('div', { class: 'sprint-complete__stat' },
            h('div', { class: 'sprint-complete__stat-value' }, String(wpm)),
            h('div', { class: 'sprint-complete__stat-label' }, 'Words/Min'),
          ),
          totalGoals > 0 ? h('div', { class: 'sprint-complete__stat' },
            h('div', { class: 'sprint-complete__stat-value' }, `${goalsCompleted}/${totalGoals}`),
            h('div', { class: 'sprint-complete__stat-label' }, 'Goals Done'),
          ) : null,
        ),
        wordsWritten > 0
          ? h('p', { style: { textAlign: 'center', color: 'var(--text-secondary)', marginTop: '16px', fontSize: '13px' } }, '🎉 Great work! Your writing has been saved.')
          : h('p', { style: { textAlign: 'center', color: 'var(--text-muted)', marginTop: '16px', fontSize: '13px' } }, 'No words written this sprint — maybe next time!'),
      ),
      h('div', { class: 'modal__footer' },
        h('button', { class: 'btn', onclick: () => { overlay.remove(); resetAfterSprint(); } }, 'Done'),
        h('button', { class: 'btn btn--primary', onclick: () => { overlay.remove(); resetAfterSprint(); /* Will show setup for new sprint */ } }, '🔄 Sprint Again'),
      ),
    )
  );

  document.body.appendChild(overlay);
}

function resetAfterSprint() {
  currentSprint = null;
  timeRemaining = 0;
  startWordCount = 0;
  rerender();
}

// ─── Live Updates During Sprint ──────────────────────────────────────────────

function updateSprintWordCount() {
  if (!currentSprint) return;
  const currentWords = countWords(currentSprint.content || '');
  const added = currentWords - startWordCount;

  const wcEl = document.getElementById('sprint-wordcount');
  if (wcEl) wcEl.textContent = `${currentWords} words`;

  const addedEl = document.getElementById('sprint-words-added');
  if (addedEl) addedEl.textContent = `+${added} this sprint`;
}

function updateGoalsProgress() {
  if (!currentSprint) return;
  const completed = currentSprint.goals.filter(g => g.completed).length;
  const total = currentSprint.goals.length;

  const el = document.getElementById('sprint-goals-progress');
  if (el) el.textContent = `${completed}/${total}`;
}

function addGoalDuringSprint() {
  const input = document.getElementById('sprint-live-goal-input');
  if (!input || !currentSprint) return;
  const text = input.value.trim();
  if (!text) return;

  const goal = { id: generateId(), text, completed: false };
  currentSprint.goals.push(goal);
  input.value = '';

  // Add to DOM
  const container = document.getElementById('sprint-goals-container');
  if (container) {
    // Remove "no goals" message if present
    const emptyMsg = container.querySelector('[style*="italic"]');
    if (emptyMsg) emptyMsg.remove();
    container.appendChild(renderGoalCheckbox(goal, currentSprint.goals.length - 1));
  }

  updateGoalsProgress();
  saveSprints();
}

// ─── Sprint History Item ─────────────────────────────────────────────────────

function renderSprintHistoryItem(sprint) {
  const date = new Date(sprint.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = new Date(sprint.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const goalsText = sprint.goals.length > 0
    ? `${sprint.goals.filter(g => g.completed).length}/${sprint.goals.length} goals`
    : 'No goals';

  return h('div', { class: 'sprint-history-item' },
    h('div', { class: 'sprint-history-item__header' },
      h('span', { class: 'sprint-history-item__date' }, `${date} ${time}`),
      h('span', { class: `sprint-history-item__status sprint-history-item__status--${sprint.status}` },
        sprint.status === 'completed' ? '✓' : sprint.status === 'running' ? '⏱' : '—'
      ),
    ),
    h('div', { class: 'sprint-history-item__stats' },
      h('span', {}, `${sprint.wordsWritten || 0} words`),
      h('span', {}, `${sprint.duration}m`),
      h('span', {}, goalsText),
    ),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function rerender() {
  const container = document.getElementById('main-content');
  if (container) {
    container.innerHTML = '';
    renderWritingSprint(container);
  }
}
