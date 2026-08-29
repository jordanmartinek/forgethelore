/**
 * LoreForge Planner - Optional AI Layer (Bring Your Own Key)
 *
 * PHASE 3 (#4/#5). The app's identity is offline-first, so AI is strictly
 * optional and additive:
 *   - No key configured  -> everything runs through the deterministic engine
 *                           (core/analysis.js). The user loses nothing.
 *   - Key configured     -> we send a COMPACT, structured summary of the
 *                           project to the user's chosen provider and merge the
 *                           model's suggestions with the deterministic ones.
 *   - Any network/parse error -> silently fall back to deterministic output so
 *                           the feature never breaks the app.
 *
 * Keys are stored locally (never sent anywhere except the provider the user
 * chose). Supported providers use an OpenAI-compatible or Anthropic messages
 * API shape. NOTE: the live network path cannot be exercised in the offline
 * sandbox; it is implemented against the documented request/response shapes and
 * the deterministic fallback is fully tested.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';
import { analyzeProject } from './analysis.js';
import { getAISettings } from './ai-settings.js';

const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    buildBody: (model, system, user) => ({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }),
    extractText: (json) => json?.choices?.[0]?.message?.content ?? '',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-haiku-latest',
    buildBody: (model, system, user) => ({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Allow calls directly from the browser (user opted in with their key).
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    extractText: (json) => (Array.isArray(json?.content) ? json.content.map((c) => c.text || '').join('') : ''),
  },
};

/** Is an AI provider configured with a key? */
export function isAIEnabled() {
  const s = getAISettings();
  return Boolean(s.provider && s.apiKey && PROVIDERS[s.provider]);
}

/**
 * Build a compact, privacy-conscious summary of the project for the model.
 * We send names, roles, goals, and relationships — the structural skeleton the
 * model needs to reason about story logic — not full prose.
 */
function buildProjectSummary() {
  const pieces = repo.list(Collections.PIECES).map((p) => ({
    name: p.name, role: p.role, faction: p.faction, momentum: p.momentum,
    goal: p.goal, hiddenGoal: p.hiddenGoal || undefined,
  }));
  const factions = repo.list(Collections.BOARD_FACTIONS).map((f) => ({
    name: f.name, goal: f.goal, progress: f.goalProgress,
  }));
  const scenes = repo.list(Collections.SCENES)
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((s) => ({ order: s.order, title: s.title, type: s.conflictType, outcome: s.outcome, status: s.status }));
  const conflicts = repo.list(Collections.CONFLICT_LINES).map((l) => ({ from: l.from, to: l.to, type: l.type }));
  return JSON.stringify({ factions, characters: pieces, scenes, conflicts });
}

const SYSTEM_PROMPT =
  'You are a story-structure analyst for a fiction worldbuilding tool. Given a JSON summary of a project (factions, characters, scenes, conflicts), identify concrete consistency problems and strategic suggestions to improve narrative tension and balance. ' +
  'Respond ONLY with JSON of the form {"insights":[{"kind":"issue"|"suggestion","icon":"<one emoji>","title":"<short>","detail":"<one or two sentences>","severity":"high"|"medium"|"low"}]}. Return 4-8 insights. Be specific and reference names from the data.';

/**
 * Produce insights. Always returns deterministic insights immediately-usable;
 * when AI is enabled, also attempts the model and merges its insights on top.
 *
 * @returns {Promise<{ insights: import('./analysis.js').Insight[], usedAI: boolean }>}
 */
export async function getInsights() {
  const deterministic = analyzeProject();

  if (!isAIEnabled()) return { insights: deterministic, usedAI: false };

  try {
    const aiInsights = await requestAIInsights();
    if (!aiInsights.length) return { insights: deterministic, usedAI: false };
    // Never let AI output crowd out our deterministic consistency ISSUES (they
    // catch continuity/dangling-reference bugs the model may miss). Order:
    //   deterministic issues -> AI insights -> deterministic suggestions.
    const detIssues = deterministic.filter((i) => i.kind === 'issue');
    const detSuggestions = deterministic.filter((i) => i.kind !== 'issue');
    const merged = [
      ...detIssues,
      ...aiInsights.map((i) => ({ ...i, source: 'ai' })),
      ...detSuggestions,
    ];
    return { insights: dedupe(merged), usedAI: true };
  } catch (err) {
    console.warn('[LoreForge] AI request failed, using deterministic analysis:', err.message);
    return { insights: deterministic, usedAI: false };
  }
}

/** Low-level: call the configured provider and parse insights. */
async function requestAIInsights() {
  const { provider, apiKey, model } = getAISettings();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: cfg.headers(apiKey),
      body: JSON.stringify(cfg.buildBody(model || cfg.defaultModel, SYSTEM_PROMPT, buildProjectSummary())),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = cfg.extractText(json);
    return parseInsights(text);
  } finally {
    clearTimeout(timeout);
  }
}

/** Parse the model's JSON reply defensively. */
export function parseInsights(text) {
  if (!text || typeof text !== 'string') return [];
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (_) {
    // Some models wrap JSON in prose or fences; extract the first {...} block.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try { obj = JSON.parse(match[0]); } catch (_) { return []; }
  }
  const arr = Array.isArray(obj) ? obj : obj.insights;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((i) => i && typeof i.title === 'string')
    .slice(0, 8)
    .map((i) => ({
      kind: i.kind === 'issue' ? 'issue' : 'suggestion',
      icon: typeof i.icon === 'string' && i.icon ? i.icon : (i.kind === 'issue' ? '⚠️' : '💡'),
      title: String(i.title),
      detail: typeof i.detail === 'string' ? i.detail : '',
      severity: ['high', 'medium', 'low'].includes(i.severity) ? i.severity : 'medium',
    }));
}

function dedupe(insights) {
  const seen = new Set();
  return insights.filter((i) => {
    const key = i.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { PROVIDERS };
