/**
 * LoreForge Planner - Insights Hub (§14)
 *
 * A calm landing page for the app's advanced analysis, so those powerful tools
 * are available without competing with writing. It opens with a quick,
 * on-device story health-check (core/ai.getInsights → deterministic
 * analyzeProject, enriched by the model when a key is set), then presents the
 * individual insight tools as cards that route to their existing modules.
 * No analysis logic is duplicated — this only composes and routes.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { getInsights } from '../core/ai.js';

const go = (id) => appStore.setState({ activeModule: id });

const TOOLS = [
  { icon: '🎢', title: 'Story Analytics', desc: 'Tension curves and faction power over the story.', module: 'story-analytics' },
  { icon: '🕸️', title: 'Knowledge Graph', desc: 'How every character, faction and place connects.', module: 'knowledge-graph' },
  { icon: '🕵️', title: 'Knowledge & Setups', desc: 'Who knows what, and which setups still need a payoff.', module: 'secrets-matrix' },
  { icon: '📈', title: 'Character Arcs', desc: 'How each character rises and falls, scene by scene.', module: 'knowledge-matrix' },
  { icon: '🎭', title: 'Word & POV', desc: 'Word counts by phase and whose eyes carry each scene.', module: 'pov-analytics' },
  { icon: '📊', title: 'Analytics', desc: 'Project-wide totals and completeness.', module: 'analytics' },
];

const SEV_ICON = { high: '🔴', medium: '🟡', low: '🟢' };

export function renderInsightsHub(container) {
  const root = h('div', { class: 'insights-hub' },
    h('div', { class: 'insights-hub__head' },
      h('h1', { class: 'insights-hub__title' }, 'Story Insights'),
      h('p', { class: 'insights-hub__subtitle' }, 'A quiet place to check the health of your story — available when you want it, out of the way while you write.'),
    ),

    // Quick health-check (populated async).
    h('div', { class: 'insights-hub__section' },
      h('h2', { class: 'insights-hub__section-title' }, 'Story health check'),
      h('div', { id: 'insights-summary', class: 'card' },
        h('div', { class: 'insights-hub__loading' }, h('span', { class: 'insights-spinner' }), 'Analyzing your story…'),
      ),
    ),

    // Tool cards.
    h('div', { class: 'insights-hub__section' },
      h('h2', { class: 'insights-hub__section-title' }, 'Explore in depth'),
      h('div', { class: 'insights-hub__grid' },
        ...TOOLS.map((t) => h('button', {
          class: 'card card--interactive insights-card',
          onclick: () => go(t.module),
          title: `Open ${t.title}`,
        },
          h('span', { class: 'insights-card__icon' }, t.icon),
          h('span', { class: 'insights-card__title' }, t.title),
          h('span', { class: 'insights-card__desc' }, t.desc),
        )),
      ),
    ),
  );
  container.appendChild(root);

  // Run the analysis after paint; getInsights is offline-first (deterministic
  // analyzeProject, enriched by the model only if a key is configured).
  getInsights().then(({ insights, usedAI }) => {
    const box = document.getElementById('insights-summary');
    if (!box) return; // navigated away
    box.innerHTML = '';
    if (!insights.length) {
      box.appendChild(h('div', { class: 'insights-hub__ok' }, '✅ No structural issues detected. Keep writing!'));
      return;
    }
    const issues = insights.filter((i) => i.kind === 'issue');
    const suggestions = insights.filter((i) => i.kind !== 'issue');
    box.appendChild(h('div', { class: 'insights-hub__summary-line' },
      `${issues.length} issue${issues.length === 1 ? '' : 's'} · ${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`,
      usedAI ? h('span', { class: 'insights-hub__badge' }, '✨ AI-enriched') : null,
    ));
    box.appendChild(h('div', { class: 'insights-hub__list' },
      ...insights.slice(0, 6).map((i) => h('div', { class: 'insights-hub__item' },
        h('span', { class: 'insights-hub__item-icon' }, i.icon || (i.kind === 'issue' ? SEV_ICON[i.severity] || '⚠️' : '💡')),
        h('div', {},
          h('div', { class: 'insights-hub__item-title' }, i.title),
          i.detail ? h('div', { class: 'insights-hub__item-detail' }, i.detail) : null,
        ),
      )),
    ));
  }).catch(() => {
    const box = document.getElementById('insights-summary');
    if (box) { box.innerHTML = ''; box.appendChild(h('div', { class: 'insights-hub__ok' }, 'Analysis unavailable right now.')); }
  });
}
