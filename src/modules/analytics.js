/**
 * LoreForge Planner - Analytics Dashboard
 * Project health monitoring and issue detection
 */

import { h } from '../core/renderer.js';

const projectStats = [
  { label: 'Total Objects', value: '847', trend: '+12 this week', icon: '📦' },
  { label: 'Characters', value: '42', trend: '3 incomplete', icon: '👤' },
  { label: 'Relationships', value: '186', trend: '8 unverified', icon: '🔗' },
  { label: 'Mysteries', value: '12', trend: '2 unresolved', icon: '🔍' },
  { label: 'Timeline Events', value: '94', trend: '5 gaps detected', icon: '⏳' },
  { label: 'Canon Entries', value: '67', trend: '12 under review', icon: '📜' },
];

const issues = [
  { severity: 'critical', icon: '🔴', message: 'Mystery "Colony Theta-9" has no planned reveal', module: 'Mysteries' },
  { severity: 'critical', icon: '🔴', message: 'Captain Sera has declining momentum with no recovery arc', module: 'Characters' },
  { severity: 'warning', icon: '🟡', message: 'The Swarm faction has no internal opposition', module: 'Conflict Board' },
  { severity: 'warning', icon: '🟡', message: 'Timeline gap: 15-year period between FTL and First Contact', module: 'Timeline' },
  { severity: 'warning', icon: '🟡', message: '3 technologies have no inventor assigned', module: 'Technology' },
  { severity: 'warning', icon: '🟡', message: 'Sector 7 has no named locations', module: 'World Builder' },
  { severity: 'info', icon: '🔵', message: 'Senator Vex and Captain Sera have never interacted', module: 'Relationships' },
  { severity: 'info', icon: '🔵', message: '5 characters have identical "unknown" backstory status', module: 'Characters' },
  { severity: 'info', icon: '🔵', message: 'Void Energy technology has 0 dependencies', module: 'Technology' },
  { severity: 'info', icon: '🔵', message: 'Free Colonies faction goal progress is stagnant', module: 'Conflict Board' },
];

const balanceMetrics = [
  { label: 'Faction Power Balance', values: [
    { name: 'Dominion', value: 85, color: '#ef4444' },
    { name: 'Machinae', value: 65, color: '#3b82f6' },
    { name: 'Swarm', value: 70, color: '#22c55e' },
    { name: 'Free Colonies', value: 30, color: '#f59e0b' },
  ]},
  { label: 'Narrative Tension', values: [
    { name: 'Political', value: 75, color: '#a855f7' },
    { name: 'Military', value: 90, color: '#ef4444' },
    { name: 'Personal', value: 45, color: '#ec4899' },
    { name: 'Mystery', value: 60, color: '#06b6d4' },
  ]},
];

export function renderAnalytics(container) {
  const analytics = h('div', { class: 'analytics' },
    h('div', { style: { marginBottom: '24px' } },
      h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '4px' } }, '📊 Project Health Dashboard'),
      h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, 'Real-time analysis of your universe\'s planning health, balance, and completeness.'),
    ),
    
    // Stats Grid
    h('div', { class: 'analytics__grid', style: { marginBottom: '24px' } },
      ...projectStats.map(stat => 
        h('div', { class: 'analytics-card' },
          h('div', { class: 'analytics-card__header' },
            h('span', { style: { fontSize: '20px' } }, stat.icon),
          ),
          h('div', { class: 'analytics-card__value' }, stat.value),
          h('div', { style: { fontSize: '13px', fontWeight: '500' } }, stat.label),
          h('div', { class: 'analytics-card__subtitle' }, stat.trend),
        )
      )
    ),
    
    // Issues
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
      // Left: Issues list
      h('div', { class: 'analytics-card' },
        h('div', { class: 'analytics-card__header' },
          h('span', { class: 'analytics-card__title' }, '⚠️ Issues & Warnings'),
          h('span', { class: 'tag tag--warning' }, `${issues.length} issues`),
        ),
        h('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
          ...issues.map(issue => 
            h('div', { class: 'analytics-issue' },
              h('span', { class: 'analytics-issue__icon' }, issue.icon),
              h('span', { style: { flex: 1 } }, issue.message),
              h('span', { class: 'tag', style: { fontSize: '9px' } }, issue.module),
            )
          )
        ),
      ),
      
      // Right: Balance metrics
      h('div', { class: 'analytics-card' },
        h('div', { class: 'analytics-card__header' },
          h('span', { class: 'analytics-card__title' }, '⚖️ Balance Analysis'),
        ),
        ...balanceMetrics.map(metric => 
          h('div', { style: { marginBottom: '16px' } },
            h('div', { style: { fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)' } }, metric.label),
            ...metric.values.map(v => 
              h('div', { style: { marginBottom: '6px' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' } },
                  h('span', { style: { color: 'var(--text-secondary)' } }, v.name),
                  h('span', { style: { fontWeight: '600' } }, `${v.value}%`),
                ),
                h('div', { class: 'progress' },
                  h('div', { class: 'progress__bar', style: { width: `${v.value}%`, background: v.color } })
                ),
              )
            )
          )
        ),
        
        // AI Balance Summary
        h('div', { class: 'ai-suggestion', style: { marginTop: '12px' } },
          '🧠 The Dominion is significantly overpowered (85%) compared to the Free Colonies (30%). Consider introducing a resource loss or political setback for the Dominion, or provide the Free Colonies with a strategic advantage.'
        ),
      ),
    ),
  );
  
  container.appendChild(analytics);
  updateAnalyticsSidebar();
}

function updateAnalyticsSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  
  sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' } }, 'Quick Links'));
  
  const links = [
    { icon: '🔴', label: 'Critical Issues (2)' },
    { icon: '🟡', label: 'Warnings (4)' },
    { icon: '🔵', label: 'Suggestions (4)' },
    { icon: '⚖️', label: 'Balance Analysis' },
    { icon: '📈', label: 'Growth Metrics' },
    { icon: '🕳️', label: 'Coverage Gaps' },
  ];
  
  links.forEach(link => {
    sidebar.appendChild(
      h('div', { class: 'sidebar-item' },
        h('span', { class: 'sidebar-item__icon' }, link.icon),
        h('span', { class: 'sidebar-item__label' }, link.label),
      )
    );
  });
}
