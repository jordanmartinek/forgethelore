/**
 * LoreForge Planner - Daily Writing Planner
 * Scans project data and generates prioritized daily tasks based on
 * what's missing, incomplete, or imbalanced.
 */

import { h } from '../core/renderer.js';
import { loadData, saveData, getActiveProjectId } from '../core/persist.js';
import { appStore } from '../core/store.js';

// ─── Data ────────────────────────────────────────────────────────────────────

let completedToday = loadData('dailyPlannerCompleted', []);
let lastResetDate = loadData('dailyPlannerDate', '');

// Reset completed tasks if it's a new day
const today = new Date().toISOString().slice(0, 10);
if (lastResetDate !== today) {
  completedToday = [];
  lastResetDate = today;
  saveData('dailyPlannerCompleted', []);
  saveData('dailyPlannerDate', today);
}

function markComplete(taskId) {
  if (!completedToday.includes(taskId)) completedToday.push(taskId);
  saveData('dailyPlannerCompleted', completedToday);
  rerender();
}

function isComplete(taskId) {
  return completedToday.includes(taskId);
}

// ─── Analysis Engine ─────────────────────────────────────────────────────────

function analyzeProject() {
  const characters = loadData('characters', []);
  const factionData = loadData('factionData', []);
  const locations = loadData('locations', []);
  const religions = loadData('religions', []);
  const languages = loadData('languages', []);
  const species = loadData('species', []);
  const technologies = loadData('technologies', []);
  const militaryForces = loadData('militaryForces', []);
  const mysteries = loadData('mysteries', []);
  const politicalEntities = loadData('politicalEntities', []);
  const organizations = loadData('organizations', []);
  const manuscriptScenes = loadData('manuscriptScenes', {});
  const resources = loadData('resources', []);
  const relationships = loadData('relationships', []);

  const tasks = [];
  let totalFields = 0;
  let filledFields = 0;

  // ─── Character Analysis ──────────────────────────────────────────────
  const charFields = ['description', 'biography', 'personality', 'traits', 'flaws', 'fears', 'goals', 'needs', 'motivations', 'arc', 'secrets', 'lies', 'internalConflict', 'appearance', 'skills'];
  
  characters.forEach(char => {
    const empty = charFields.filter(f => !char[f] || char[f].trim() === '');
    totalFields += charFields.length;
    filledFields += charFields.length - empty.length;

    if (empty.includes('biography')) {
      tasks.push({ id: `char_bio_${char.id}`, priority: 'high', icon: '👤', text: `Write ${char.name}'s biography`, detail: 'Core character field — backstory is essential for motivation.', module: 'characters' });
    }
    if (empty.includes('goals')) {
      tasks.push({ id: `char_goals_${char.id}`, priority: 'high', icon: '🎯', text: `Define ${char.name}'s goals`, detail: 'What does this character want? This drives their scenes.', module: 'characters' });
    }
    if (empty.includes('arc')) {
      tasks.push({ id: `char_arc_${char.id}`, priority: 'medium', icon: '📈', text: `Plan ${char.name}'s character arc`, detail: 'How do they change from start to end?', module: 'characters' });
    }
    if (empty.includes('flaws')) {
      tasks.push({ id: `char_flaws_${char.id}`, priority: 'medium', icon: '💔', text: `Define ${char.name}'s flaws`, detail: 'Flaws create conflict and drive growth.', module: 'characters' });
    }
    if (empty.includes('secrets')) {
      tasks.push({ id: `char_secrets_${char.id}`, priority: 'low', icon: '🤫', text: `Add secrets for ${char.name}`, detail: 'Secrets create dramatic irony and reveal opportunities.', module: 'characters' });
    }
    if (empty.length > 10) {
      tasks.push({ id: `char_dev_${char.id}`, priority: 'high', icon: '⚠️', text: `${char.name} is barely developed (${charFields.length - empty.length}/${charFields.length} fields)`, detail: 'This character needs significant work.', module: 'characters' });
    }
  });

  // ─── Faction Analysis ────────────────────────────────────────────────
  factionData.forEach(fac => {
    totalFields += 3;
    if (fac.description) filledFields++;
    if (fac.goal) filledFields++;
    if (fac.territory) filledFields++;

    if (!fac.description || fac.description.length < 20) {
      tasks.push({ id: `fac_desc_${fac.id}`, priority: 'medium', icon: '⚔️', text: `Detail the ${fac.name} faction`, detail: 'Add a full description of their culture, methods, and philosophy.', module: 'factions' });
    }
  });

  // Faction imbalance check
  if (factionData.length > 1) {
    const lengths = factionData.map(f => (f.description || '').length);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    if (max > 100 && min < 30) {
      const weakest = factionData[lengths.indexOf(min)];
      tasks.push({ id: `fac_imbalance`, priority: 'medium', icon: '⚖️', text: `${weakest.name} is underdeveloped compared to other factions`, detail: 'Balance your world — all factions should feel real.', module: 'factions' });
    }
  }

  // ─── Location Analysis ───────────────────────────────────────────────
  if (locations.length === 0 && characters.length > 0) {
    tasks.push({ id: 'loc_none', priority: 'medium', icon: '📍', text: 'Create your first locations', detail: 'Your characters need places to exist. Where does the story happen?', module: 'locations' });
  }
  locations.forEach(loc => {
    totalFields += 1;
    if (loc.description && loc.description.length > 10) filledFields++;
    else {
      tasks.push({ id: `loc_desc_${loc.id}`, priority: 'low', icon: '📍', text: `Describe ${loc.name}`, detail: 'What does this place look, feel, and smell like?', module: 'locations' });
    }
  });

  // ─── Manuscript Analysis ─────────────────────────────────────────────
  const TOTAL_STEPS = 22;
  const filledSteps = Object.keys(manuscriptScenes).filter(k => manuscriptScenes[k] && manuscriptScenes[k].length > 0).length;
  totalFields += TOTAL_STEPS;
  filledFields += filledSteps;

  if (filledSteps === 0 && characters.length > 0) {
    tasks.push({ id: 'ms_start', priority: 'high', icon: '📖', text: 'Start your manuscript structure', detail: 'Add scene cards to at least Step 1, 4, and 19 (beginning, inciting event, battle).', module: 'manuscript' });
  } else if (filledSteps < 5) {
    // Find first empty critical step
    const criticalSteps = [1, 4, 7, 14, 19, 22];
    const emptyImportant = criticalSteps.find(s => !manuscriptScenes[s] || manuscriptScenes[s].length === 0);
    if (emptyImportant) {
      tasks.push({ id: `ms_step_${emptyImportant}`, priority: 'high', icon: '📖', text: `Add scene cards to Manuscript Step ${emptyImportant}`, detail: 'Key structural step — the story needs this.', module: 'manuscript' });
    }
  }

  // Scene cards without character wants
  Object.entries(manuscriptScenes).forEach(([step, cards]) => {
    if (!cards) return;
    cards.forEach(card => {
      if (!card.characterWants) {
        tasks.push({ id: `ms_wants_${card.id}`, priority: 'low', icon: '🎭', text: `Define character wants in "${card.title}"`, detail: 'What does each character in this scene want?', module: 'manuscript' });
      }
    });
  });

  // ─── Module Emptiness ────────────────────────────────────────────────
  if (religions.length === 0 && factionData.length > 0) {
    tasks.push({ id: 'rel_none', priority: 'low', icon: '🕯️', text: 'Consider adding religions/belief systems', detail: 'Beliefs shape culture, conflict, and motivation.', module: 'religions' });
  }
  if (languages.length === 0 && species.length > 0) {
    tasks.push({ id: 'lang_none', priority: 'low', icon: '🗣️', text: 'Create languages for your species/factions', detail: 'Language defines identity and can drive conflict.', module: 'languages' });
  }
  if (mysteries.length === 0 && characters.length > 2) {
    tasks.push({ id: 'mys_none', priority: 'medium', icon: '🔍', text: 'Plan at least one mystery', detail: 'Mysteries give the audience a reason to keep reading.', module: 'mysteries' });
  }
  if (resources.length === 0 && factionData.length > 1) {
    tasks.push({ id: 'res_none', priority: 'low', icon: '📊', text: 'Define contested resources', detail: 'What are factions fighting over? Power, territory, knowledge?', module: 'resources' });
  }

  // ─── Relationship Check ──────────────────────────────────────────────
  if (characters.length > 2 && relationships.length === 0) {
    tasks.push({ id: 'rel_empty', priority: 'medium', icon: '💫', text: 'Create character relationships', detail: 'No relationships defined — characters exist in isolation.', module: 'relationships' });
  }

  // ─── Calculate completeness ──────────────────────────────────────────
  // Add module counts to total
  totalFields += factionData.length > 0 ? 1 : 0;
  totalFields += locations.length > 0 ? 1 : 0;
  totalFields += religions.length > 0 ? 1 : 0;
  totalFields += languages.length > 0 ? 1 : 0;
  totalFields += mysteries.length > 0 ? 1 : 0;
  totalFields += resources.length > 0 ? 1 : 0;
  filledFields += factionData.length > 0 ? 1 : 0;
  filledFields += locations.length > 0 ? 1 : 0;
  filledFields += religions.length > 0 ? 1 : 0;
  filledFields += languages.length > 0 ? 1 : 0;
  filledFields += mysteries.length > 0 ? 1 : 0;
  filledFields += resources.length > 0 ? 1 : 0;

  const completeness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

  return { tasks, completeness, totalFields, filledFields };
}

// ─── Render ──────────────────────────────────────────────────────────────────

export function renderDailyPlanner(container) {
  const { tasks, completeness } = analyzeProject();

  const highTasks = tasks.filter(t => t.priority === 'high' && !isComplete(t.id));
  const medTasks = tasks.filter(t => t.priority === 'medium' && !isComplete(t.id));
  const lowTasks = tasks.filter(t => t.priority === 'low' && !isComplete(t.id));
  const doneTasks = tasks.filter(t => isComplete(t.id));

  const totalActive = highTasks.length + medTasks.length + lowTasks.length;

  const wrapper = h('div', { style: { width: '100%', height: '100%', overflowY: 'auto', padding: 'var(--space-xl)' } });

  const panel = h('div', { style: { maxWidth: '700px', margin: '0 auto' } },
    // Header
    h('div', { style: { marginBottom: '28px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        h('div', {},
          h('h2', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, `📋 Daily Writing Planner`),
          h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${today} • ${totalActive} tasks remaining • ${doneTasks.length} completed today`),
        ),
        // Completeness ring
        h('div', { style: { textAlign: 'center' } },
          h('div', { style: { fontSize: '24px', fontWeight: '700', color: completeness > 70 ? 'var(--success)' : completeness > 40 ? 'var(--warning)' : 'var(--danger)' } }, `${completeness}%`),
          h('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, 'Project Complete'),
        ),
      ),
    ),

    // Empty state
    totalActive === 0 && doneTasks.length === 0
      ? h('div', { style: { textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' } },
          h('div', { style: { fontSize: '48px', marginBottom: '12px' } }, '✨'),
          h('div', { style: { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' } }, 'Nothing to suggest!'),
          h('div', { style: { fontSize: '13px' } }, 'Your project is either empty (add some data first) or fully developed. Great work!'),
        )
      : null,

    // High priority
    highTasks.length > 0 ? renderTaskSection('🔴 HIGH PRIORITY', 'Focus on these first — they\'re essential.', highTasks, '#ef4444') : null,

    // Medium priority
    medTasks.length > 0 ? renderTaskSection('🟡 MEDIUM PRIORITY', 'Important for depth and balance.', medTasks, '#f59e0b') : null,

    // Low priority
    lowTasks.length > 0 ? renderTaskSection('🟢 SUGGESTED', 'Would enrich your world but not urgent.', lowTasks.slice(0, 5), '#22c55e') : null,

    // Completed
    doneTasks.length > 0
      ? h('div', { style: { marginTop: '24px', padding: '16px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--border-subtle)' } },
          h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--success)', marginBottom: '8px' } }, `✅ COMPLETED TODAY (${doneTasks.length})`),
          ...doneTasks.map(task =>
            h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', padding: '4px 0', textDecoration: 'line-through' } }, `${task.icon} ${task.text}`)
          ),
        )
      : null,

    // Estimated time
    totalActive > 0 ? h('div', { style: { marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' } },
      `⏱️ Estimated time: ~${Math.max(15, totalActive * 8)} minutes`
    ) : null,
  );

  wrapper.appendChild(panel);
  container.appendChild(wrapper);
  updateDailyPlannerSidebar(tasks);
}

function renderTaskSection(title, subtitle, tasks, color) {
  return h('div', { style: { marginBottom: '20px', padding: '16px', background: 'var(--surface-1)', borderRadius: '12px', border: `1px solid ${color}25` } },
    h('div', { style: { fontSize: '12px', fontWeight: '700', color, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, title),
    h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' } }, subtitle),
    ...tasks.map(task =>
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' } },
        h('button', {
          style: { width: '20px', height: '20px', borderRadius: '4px', border: '2px solid var(--border-strong)', background: 'transparent', cursor: 'pointer', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' },
          onclick: () => markComplete(task.id),
          title: 'Mark as done',
        }, ''),
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' } }, `${task.icon} ${task.text}`),
          h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' } }, task.detail),
        ),
        h('span', { style: { fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-3)', color: 'var(--text-muted)', flexShrink: '0' } }, task.module),
      )
    ),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rerender() {
  const container = document.querySelector('.main-content');
  if (container) { container.innerHTML = ''; renderDailyPlanner(container); }
}

function updateDailyPlannerSidebar(tasks) {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const high = tasks.filter(t => t.priority === 'high' && !isComplete(t.id)).length;
  const med = tasks.filter(t => t.priority === 'medium' && !isComplete(t.id)).length;
  const low = tasks.filter(t => t.priority === 'low' && !isComplete(t.id)).length;
  const done = tasks.filter(t => isComplete(t.id)).length;

  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Today\'s Tasks'));
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { style: { color: '#ef4444' } }, '🔴'), h('span', { class: 'sidebar-item__label' }, 'High Priority'), h('span', { class: 'sidebar-item__count' }, String(high))));
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { style: { color: '#f59e0b' } }, '🟡'), h('span', { class: 'sidebar-item__label' }, 'Medium Priority'), h('span', { class: 'sidebar-item__count' }, String(med))));
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', { style: { color: '#22c55e' } }, '🟢'), h('span', { class: 'sidebar-item__label' }, 'Suggested'), h('span', { class: 'sidebar-item__count' }, String(low))));
  sidebar.appendChild(h('div', { class: 'sidebar-item' }, h('span', {}, '✅'), h('span', { class: 'sidebar-item__label' }, 'Done Today'), h('span', { class: 'sidebar-item__count' }, String(done))));
}
