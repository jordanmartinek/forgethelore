/**
 * LoreForge Planner - Manuscript Planner
 * Based on John Truby's 22-Step Story Structure.
 * Each step contains draggable scene cards that can be added, edited, moved, deleted.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { generateId } from '../core/objects.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';
import { expandableText } from '../ui/expandable-text.js';

// ─── Truby's 22 Steps ───────────────────────────────────────────────────────

const TRUBY_STEPS = [
  { num: 1, title: 'Self-Revelation, Need, & Desire', phase: 'Setup', description: 'Define what the hero will learn by the end. What is their psychological and moral weakness? What do they consciously want?', color: '#6366f1' },
  { num: 2, title: 'Ghost & Story World', phase: 'Setup', description: 'Establish the backstory event that haunts the hero and the world they inhabit at the start. What shaped them before the story begins?', color: '#6366f1' },
  { num: 3, title: 'Weakness & Need', phase: 'Setup', description: 'The hero has a psychological weakness (hurting themselves) and a moral weakness (hurting others). They are unaware of both.', color: '#6366f1' },
  { num: 4, title: 'Inciting Event', phase: 'Setup', description: 'Something happens that disrupts the hero\'s equilibrium. An outside event forces them into action and creates a desire.', color: '#8b5cf6' },
  { num: 5, title: 'Desire', phase: 'Setup', description: 'The hero forms a concrete goal. This is what they want — it drives the external plot forward. It may or may not align with what they need.', color: '#8b5cf6' },
  { num: 6, title: 'Allies', phase: 'Development', description: 'The hero meets companions who help them on their journey. Each ally should have their own desire and potentially challenge the hero.', color: '#06b6d4' },
  { num: 7, title: 'Opponent / Mystery', phase: 'Development', description: 'Introduce the main opponent who wants the same goal or directly blocks the hero. The opponent should be a dark mirror of the hero.', color: '#ef4444' },
  { num: 8, title: 'Fake-Ally Opponent', phase: 'Development', description: 'Someone who appears to be a friend but is actually working against the hero. Creates dramatic irony and future betrayal.', color: '#ef4444' },
  { num: 9, title: 'First Revelation & Decision', phase: 'Development', description: 'The hero learns something that changes their understanding. They make a decision that alters or intensifies their desire.', color: '#f59e0b' },
  { num: 10, title: 'Plan', phase: 'Development', description: 'The hero devises a strategy to achieve their goal. The plan gives the story structure and creates audience expectations.', color: '#f59e0b' },
  { num: 11, title: 'Opponent\'s Plan', phase: 'Development', description: 'The opponent also has a plan. The conflict intensifies as both plans move forward and inevitably collide.', color: '#ef4444' },
  { num: 12, title: 'Drive', phase: 'Intensification', description: 'A series of actions where hero and opponent maneuver against each other. Escalating conflict, attacks, and counter-attacks.', color: '#f97316' },
  { num: 13, title: 'Attack by Ally', phase: 'Intensification', description: 'An ally confronts the hero about their moral weakness. This is the internal pressure that forces growth alongside external conflict.', color: '#f97316' },
  { num: 14, title: 'Apparent Defeat', phase: 'Intensification', description: 'The hero suffers what seems like a catastrophic loss. Their plan has failed. All hope seems lost. This is the low point.', color: '#dc2626' },
  { num: 15, title: 'Second Revelation & Decision', phase: 'Intensification', description: 'A new piece of information changes everything. The hero realizes something fundamental and makes a critical new choice.', color: '#f59e0b' },
  { num: 16, title: 'Audience Revelation', phase: 'Intensification', description: 'Information revealed to the audience (but not necessarily the hero) that reframes everything they\'ve seen. Creates dramatic irony.', color: '#a855f7' },
  { num: 17, title: 'Third Revelation & Decision', phase: 'Climax', description: 'The final piece falls into place. The hero sees the full truth and commits to their final course of action.', color: '#f59e0b' },
  { num: 18, title: 'Gate, Gauntlet, Visit to Death', phase: 'Climax', description: 'The hero must pass through a narrow space (literal or metaphorical) that strips away everything except their essential self.', color: '#dc2626' },
  { num: 19, title: 'Battle', phase: 'Climax', description: 'The final confrontation between hero and opponent. Both fight with everything they have. The conflict reaches its maximum intensity.', color: '#dc2626' },
  { num: 20, title: 'Self-Revelation', phase: 'Resolution', description: 'The hero finally sees themselves clearly — their weakness, their need, the truth they\'ve been avoiding. This is the moment of transformation.', color: '#22c55e' },
  { num: 21, title: 'Moral Decision', phase: 'Resolution', description: 'The hero must make a choice that proves their transformation. They act from their new self, not their old weaknesses.', color: '#22c55e' },
  { num: 22, title: 'New Equilibrium', phase: 'Resolution', description: 'The world settles into a new normal. The hero occupies a different position than where they started — changed by the journey.', color: '#22c55e' },
];

const PHASES = [
  { name: 'Setup', color: '#6366f1', steps: [1,2,3,4,5] },
  { name: 'Development', color: '#06b6d4', steps: [6,7,8,9,10,11] },
  { name: 'Intensification', color: '#f97316', steps: [12,13,14,15,16] },
  { name: 'Climax', color: '#dc2626', steps: [17,18,19] },
  { name: 'Resolution', color: '#22c55e', steps: [20,21,22] },
];

// ─── Scene Card Data ─────────────────────────────────────────────────────────

const _isDemo = getActiveProjectId() === 'proj1';
const DEFAULT_SCENE_CARDS = {
  1: [{ id: 'ms1', title: 'Opening Image', content: 'Sera alone on the observation deck, watching Dominion ships pass — powerless.', color: '#6366f1' }],
  4: [{ id: 'ms2', title: 'The Broadcast', content: 'Aurelian announces Conduit seizure. Sera realizes diplomacy has failed.', color: '#8b5cf6' }],
  7: [{ id: 'ms3', title: 'Aurelian Revealed', content: 'We see Aurelian\'s ruthlessness firsthand — he orders a colony destroyed as an example.', color: '#ef4444' }],
  14: [{ id: 'ms4', title: 'Senate Betrayal', content: 'Vex publicly humiliates Sera. All political options gone. She is alone.', color: '#dc2626' }],
  19: [{ id: 'ms5', title: 'The Final Stand', content: 'Sera leads the combined colonial-Machinae fleet against the Dominion at the Breach.', color: '#dc2626' }],
  22: [{ id: 'ms6', title: 'New Dawn', content: 'The Conduit belongs to no one. Sera establishes the first inter-faction council.', color: '#22c55e' }],
};

let sceneCards = loadData('manuscriptScenes', _isDemo ? DEFAULT_SCENE_CARDS : {});

function save() {
  saveData('manuscriptScenes', sceneCards);
  appStore.setState({ saveStatus: 'saving' });
  setTimeout(() => appStore.setState({ saveStatus: 'saved' }), 300);
}

// ─── State ───────────────────────────────────────────────────────────────────

let activeStepNum = null;
let dragCard = null;
let dragFromStep = null;

// ─── Main Render ─────────────────────────────────────────────────────────────

export function renderManuscriptPlanner(container) {
  const planner = h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
    renderHeader(),
    renderBody(),
  );
  container.appendChild(planner);
  updateManuscriptSidebar();
}

function renderHeader() {
  const totalCards = Object.values(sceneCards).reduce((sum, arr) => sum + arr.length, 0);
  const filledSteps = Object.keys(sceneCards).filter(k => sceneCards[k].length > 0).length;

  return h('div', { style: { padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: '0' } },
    h('div', {},
      h('h2', { style: { fontSize: '18px', fontWeight: '700', marginBottom: '2px' } }, '📖 Manuscript Structure'),
      h('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, `John Truby's 22 Steps • ${totalCards} scene cards • ${filledSteps}/22 steps filled`),
    ),
    h('div', { style: { display: 'flex', gap: '8px' } },
      // Phase legend
      ...PHASES.map(p => h('span', { style: { fontSize: '10px', padding: '3px 8px', borderRadius: '10px', background: p.color + '20', color: p.color, fontWeight: '500' } }, p.name)),
    ),
  );
}

function renderBody() {
  return h('div', { style: { flex: '1', overflowY: 'auto', padding: '24px', minHeight: '0' } },
    ...PHASES.map(phase => renderPhase(phase)),
  );
}

// ─── Phase Rendering ─────────────────────────────────────────────────────────

function renderPhase(phase) {
  const steps = TRUBY_STEPS.filter(s => phase.steps.includes(s.num));

  return h('div', { style: { marginBottom: '32px' } },
    // Phase header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' } },
      h('div', { style: { width: '4px', height: '20px', borderRadius: '2px', background: phase.color } }),
      h('h3', { style: { fontSize: '14px', fontWeight: '700', color: phase.color, textTransform: 'uppercase', letterSpacing: '1px' } }, phase.name),
      h('div', { style: { flex: '1', height: '1px', background: phase.color + '30' } }),
    ),
    // Steps grid
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' } },
      ...steps.map(step => renderStep(step)),
    ),
  );
}

// ─── Step Rendering ──────────────────────────────────────────────────────────

function renderStep(step) {
  const cards = sceneCards[step.num] || [];
  const isActive = activeStepNum === step.num;

  return h('div', {
    style: { background: 'var(--surface-1)', borderRadius: '12px', border: `1px solid ${isActive ? step.color : 'var(--border-subtle)'}`, padding: '14px', transition: 'all 0.15s ease', minHeight: '120px' },
    ondragover: (e) => { e.preventDefault(); e.currentTarget.style.borderColor = step.color; e.currentTarget.style.background = step.color + '08'; },
    ondragleave: (e) => { e.currentTarget.style.borderColor = isActive ? step.color : 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--surface-1)'; },
    ondrop: (e) => handleDropOnStep(e, step.num),
  },
    // Step header
    h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' } },
      h('div', {},
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
          h('span', { style: { fontSize: '10px', fontWeight: '700', color: step.color, background: step.color + '20', padding: '2px 6px', borderRadius: '4px' } }, `${step.num}`),
          h('span', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' } }, step.title),
        ),
        h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5', maxHeight: isActive ? 'none' : '32px', overflow: 'hidden' } }, step.description),
      ),
      h('button', { class: 'btn btn--ghost btn--sm', style: { fontSize: '14px', flexShrink: '0' }, title: 'Add scene card', onclick: () => openAddCardModal(step.num) }, '+'),
    ),

    // Scene cards
    cards.length > 0
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' } },
          ...cards.map((card, idx) => renderSceneCard(card, step.num, idx))
        )
      : h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '8px', borderRadius: '6px', border: '1px dashed var(--border-subtle)' } }, 'Drop or add scene cards here'),
  );
}

// ─── Scene Card Rendering ────────────────────────────────────────────────────

function renderSceneCard(card, stepNum, index) {
  const hasExtras = card.expectations || card.subversion || card.characterWants;
  return h('div', {
    style: { padding: '10px 12px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'grab', borderLeft: `3px solid ${card.color || 'var(--accent-primary)'}`, transition: 'all 0.1s ease' },
    draggable: 'true',
    ondragstart: (e) => { dragCard = card; dragFromStep = stepNum; e.target.style.opacity = '0.5'; },
    ondragend: (e) => { e.target.style.opacity = '1'; dragCard = null; dragFromStep = null; },
  },
    h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' } },
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '3px' } }, card.title),
        card.content ? h('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical' } }, card.content) : null,
        hasExtras ? h('div', { style: { display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' } },
          card.expectations ? h('span', { style: { fontSize: '9px', padding: '2px 5px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6' } }, '👁️ Expectations') : null,
          card.subversion ? h('span', { style: { fontSize: '9px', padding: '2px 5px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444' } }, '🔀 Subversion') : null,
          card.characterWants ? h('span', { style: { fontSize: '9px', padding: '2px 5px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' } }, '🎭 Wants') : null,
        ) : null,
      ),
      h('div', { style: { display: 'flex', gap: '2px', flexShrink: '0' } },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Edit', onclick: (e) => { e.stopPropagation(); openEditCardModal(card, stepNum); } }, '✏️'),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteCard(card, stepNum); } }, '🗑️'),
      ),
    ),
  );
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

function handleDropOnStep(e, targetStepNum) {
  e.preventDefault();
  e.currentTarget.style.borderColor = 'var(--border-subtle)';
  e.currentTarget.style.background = 'var(--surface-1)';

  if (!dragCard || dragFromStep === null) return;

  // Remove from source step
  const sourceCards = sceneCards[dragFromStep] || [];
  const idx = sourceCards.findIndex(c => c.id === dragCard.id);
  if (idx !== -1) sourceCards.splice(idx, 1);

  // Add to target step
  if (!sceneCards[targetStepNum]) sceneCards[targetStepNum] = [];
  sceneCards[targetStepNum].push(dragCard);

  dragCard = null;
  dragFromStep = null;
  save();
  rerender();
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

function openAddCardModal(stepNum) {
  const step = TRUBY_STEPS.find(s => s.num === stepNum);
  const state = { title: '', content: '', color: step.color, expectations: '', subversion: '', characterWants: '' };

  const CARD_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#f97316'];

  const content = h('div', {},
    formField('Scene Title', h('input', { class: 'input', placeholder: 'e.g. "The Betrayal at the Senate"', oninput: (e) => state.title = e.target.value })),
    formField('Scene Content', expandableText({ placeholder: 'What happens in this scene? Key beats, dialogue notes, emotional tone...', label: `Scene Card — Step ${stepNum}: ${step.title}`, oninput: (e) => state.content = e.target.value })),
    formField('👁️ Audience Expectations', expandableText({ placeholder: 'What does the audience expect to happen here? What assumptions have you built?', label: 'Audience Expectations', oninput: (e) => state.expectations = e.target.value })),
    formField('🔀 How to Subvert Expectations', expandableText({ placeholder: 'How will you surprise the audience? What twist or reversal defies their prediction?', label: 'Subversion', oninput: (e) => state.subversion = e.target.value })),
    formField('🎭 What Characters Want in This Scene', expandableText({ placeholder: 'List each character in the scene and what they want:\n• Aurelian: wants to secure the vote\n• Sera: wants to expose the corruption\n• Vex: wants to maintain control...', label: 'Character Wants', oninput: (e) => state.characterWants = e.target.value })),
    formField('Color Label', h('div', { style: { display: 'flex', gap: '6px' } },
      ...CARD_COLORS.map(c => h('div', {
        style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
        onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; }
      }))
    )),
  );

  showModal(`Add Scene Card — Step ${stepNum}: ${step.title}`, content, () => {
    if (!state.title.trim()) return;
    if (!sceneCards[stepNum]) sceneCards[stepNum] = [];
    sceneCards[stepNum].push({ id: generateId(), title: state.title, content: state.content, color: state.color, expectations: state.expectations, subversion: state.subversion, characterWants: state.characterWants });
    save();
    rerender();
  });
}

function openEditCardModal(card, stepNum) {
  const step = TRUBY_STEPS.find(s => s.num === stepNum);
  const state = { title: card.title, content: card.content, color: card.color, expectations: card.expectations || '', subversion: card.subversion || '', characterWants: card.characterWants || '' };

  const CARD_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#f97316'];

  const content = h('div', {},
    formField('Scene Title', h('input', { class: 'input', value: state.title, oninput: (e) => state.title = e.target.value })),
    formField('Scene Content', expandableText({ placeholder: 'What happens in this scene?', value: state.content, label: `Scene Card — Step ${stepNum}: ${step.title}`, oninput: (e) => state.content = e.target.value })),
    formField('👁️ Audience Expectations', expandableText({ placeholder: 'What does the audience expect to happen here?', value: state.expectations, label: 'Audience Expectations', oninput: (e) => state.expectations = e.target.value })),
    formField('🔀 How to Subvert Expectations', expandableText({ placeholder: 'How will you surprise them? What twist defies prediction?', value: state.subversion, label: 'Subversion', oninput: (e) => state.subversion = e.target.value })),
    formField('🎭 What Characters Want in This Scene', expandableText({ placeholder: '• Character A: wants...\n• Character B: wants...', value: state.characterWants, label: 'Character Wants', oninput: (e) => state.characterWants = e.target.value })),
    formField('Color Label', h('div', { style: { display: 'flex', gap: '6px' } },
      ...CARD_COLORS.map(c => h('div', {
        style: { width: '24px', height: '24px', borderRadius: '6px', background: c, cursor: 'pointer', border: c === state.color ? '2px solid white' : '2px solid transparent' },
        onclick: (e) => { state.color = c; e.currentTarget.parentElement.querySelectorAll('div').forEach(d => d.style.border = '2px solid transparent'); e.currentTarget.style.border = '2px solid white'; }
      }))
    )),
  );

  showModal(`Edit Scene Card`, content, () => {
    Object.assign(card, { title: state.title, content: state.content, color: state.color, expectations: state.expectations, subversion: state.subversion, characterWants: state.characterWants });
    save();
    rerender();
  });
}

function deleteCard(card, stepNum) {
  if (!confirm(`Delete "${card.title}"?`)) return;
  const cards = sceneCards[stepNum] || [];
  const idx = cards.findIndex(c => c.id === card.id);
  if (idx !== -1) cards.splice(idx, 1);
  save();
  rerender();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderManuscriptPlanner(container); }
}

function formField(label, input) {
  return h('div', { style: { marginBottom: '12px' } },
    h('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' } }, label),
    input
  );
}

function showModal(title, content, onSave) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal__header' }, h('span', { class: 'modal__title' }, title), h('button', { class: 'btn btn--ghost btn--icon', onclick: () => overlay.remove() }, '✕')),
      h('div', { class: 'modal__body' }, content),
      h('div', { class: 'modal__footer' }, h('button', { class: 'btn', onclick: () => overlay.remove() }, 'Cancel'), h('button', { class: 'btn btn--primary', onclick: () => { onSave(); overlay.remove(); } }, 'Save')),
    )
  );
  document.body.appendChild(overlay);
}

function updateManuscriptSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  PHASES.forEach(phase => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: phase.color, marginTop: '8px' } }, phase.name));

    const steps = TRUBY_STEPS.filter(s => phase.steps.includes(s.num));
    steps.forEach(step => {
      const cards = sceneCards[step.num] || [];
      sidebar.appendChild(h('div', { class: 'sidebar-item', style: { fontSize: '11px' } },
        h('span', { style: { fontSize: '10px', fontWeight: '700', color: step.color, minWidth: '16px' } }, `${step.num}`),
        h('span', { class: 'sidebar-item__label', style: { fontSize: '11px' } }, step.title),
        cards.length > 0 ? h('span', { class: 'sidebar-item__count' }, String(cards.length)) : null,
      ));
    });
  });
}
