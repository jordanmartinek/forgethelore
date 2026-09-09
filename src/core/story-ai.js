/**
 * LoreForge Planner - Story-aware AI Assistant (contextual AI)
 *
 * §12 of the redesign: AI that behaves like a writing partner grounded in the
 * current story, not a generic chatbot bolted on. It assembles a compact,
 * privacy-conscious context (project name, characters, places, factions, recent
 * manuscript beats, established facts) and offers story-aware ACTIONS
 * (continue the scene, brainstorm the next event, develop a character, check for
 * contradictions, ask about the world…).
 *
 * Offline-first, exactly like core/ai.js and core/sprint-synthesis.js:
 *   - No key configured  -> a deterministic, on-device response (never empty).
 *   - Key configured     -> the user's provider is called with the story
 *                           context; on any network/parse error we fall back to
 *                           the deterministic response so the feature never
 *                           breaks the app.
 *
 * The heavy lifting (context building, prompt assembly, reply parsing,
 * deterministic responder) lives here as pure functions so it can be unit-tested
 * in Node; src/ui/ai-panel.js is a thin view over `getStoryResponse`.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';
import { getAISettings } from './ai-settings.js';
import { PROVIDERS } from './ai.js';
import { countWords } from './format.js';

/** Is an AI provider configured with a key? (mirrors core/ai.js) */
export function isAIEnabled() {
  const s = getAISettings();
  return Boolean(s.provider && s.apiKey && PROVIDERS[s.provider]);
}

/**
 * The contextual actions the assistant offers. `needsScene` actions read the
 * most recent manuscript prose; `input` actions take a free-text question.
 * @typedef {Object} StoryAction
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {string} hint       what the action does (shown in the panel)
 * @property {boolean} [freeform] true if it takes a user question
 */
export const STORY_ACTIONS = [
  { id: 'continue',     label: 'Continue the scene',    icon: '✍️', hint: 'Draft what happens next from your latest writing.' },
  { id: 'brainstorm',   label: 'Brainstorm next event', icon: '💡', hint: 'Suggest possible next beats for the story.' },
  { id: 'develop',      label: 'Develop a character',   icon: '👤', hint: 'Deepen a character\u2019s goals, flaws and secrets.' },
  { id: 'contradictions', label: 'Check contradictions', icon: '🔍', hint: 'Scan the story for continuity problems.' },
  { id: 'threads',      label: 'Find unresolved threads', icon: '🧵', hint: 'Surface setups and questions still open.' },
  { id: 'ask',          label: 'Ask about my world',    icon: '💬', hint: 'Ask anything about your story or world.', freeform: true },
];

const MAX_ITEMS = 24;         // cap list sizes sent to the model
const MAX_SCENE_CHARS = 1500; // cap the recent-prose excerpt

/** Flatten the manuscript step map into scenes with word counts, in step order. */
function manuscriptScenes() {
  const map = repo.readObject(Collections.MANUSCRIPT, {}) || {};
  const scenes = [];
  Object.keys(map)
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    .forEach((step) => {
      (Array.isArray(map[step]) ? map[step] : []).forEach((card) => {
        if (!card) return;
        scenes.push({ step, title: card.title || 'Untitled', content: card.content || '', words: countWords(card.content || '') });
      });
    });
  return scenes;
}

/**
 * Build a compact, privacy-conscious snapshot of the story for the model.
 * We send names/roles/goals and short recent prose — the skeleton needed to
 * reason in-context — not the whole manuscript.
 *
 * @param {object} [opts]
 * @param {string} [opts.activeModule] the module the writer is currently in.
 * @returns {object}
 */
export function buildStoryContext(opts = {}) {
  const characters = repo.list(Collections.CHARACTERS).slice(0, MAX_ITEMS).map((c) => ({
    name: c.name, role: c.role || undefined, faction: c.faction || undefined,
    goal: c.goals || undefined, secret: c.secrets || undefined,
  }));
  const pieces = repo.list(Collections.PIECES).slice(0, MAX_ITEMS).map((p) => ({
    name: p.name, role: p.role, faction: p.faction, momentum: p.momentum, goal: p.goal, hiddenGoal: p.hiddenGoal || undefined,
  }));
  const locations = repo.list(Collections.LOCATIONS).slice(0, MAX_ITEMS).map((l) => ({ name: l.name, type: l.type, region: l.region || undefined }));
  const factions = [...repo.list(Collections.BOARD_FACTIONS), ...repo.list(Collections.FACTIONS)].slice(0, MAX_ITEMS).map((f) => ({ name: f.name, goal: f.goal || undefined }));
  const mysteries = repo.list(Collections.MYSTERIES).slice(0, MAX_ITEMS).map((m) => ({ title: m.title || m.name, question: m.question || undefined }));

  const scenes = manuscriptScenes();
  const totalWords = scenes.reduce((s, x) => s + x.words, 0);
  const recent = scenes.filter((s) => s.content.trim()).slice(-1)[0] || null;

  return {
    activeModule: opts.activeModule || undefined,
    characters,
    boardActors: pieces,
    locations,
    factions,
    mysteries,
    manuscript: {
      sceneCount: scenes.length,
      totalWords,
      recentSceneTitle: recent ? recent.title : undefined,
      recentSceneExcerpt: recent ? recent.content.slice(-MAX_SCENE_CHARS) : undefined,
    },
  };
}

export const STORY_AI_SYSTEM_PROMPT =
  'You are a story-aware writing partner inside a fiction worldbuilding app. You are given a JSON snapshot of the writer\'s current story (characters, board actors, locations, factions, mysteries, and a recent manuscript excerpt) and a requested action. ' +
  'Respond as a concise, encouraging collaborator grounded ONLY in the provided story — never invent named characters, places, or events that are not present. ' +
  'For "continue", write 1-2 short prose paragraphs continuing from the recent excerpt in the story\'s voice. For "brainstorm"/"threads", give a short bulleted list. For "contradictions", list concrete continuity issues you can infer, or say none are apparent. For "develop", deepen the most relevant character. For "ask", answer the question directly. ' +
  'Respond ONLY with JSON of the form {"title":"<short heading>","body":"<markdown-ish plain text; use \\n for line breaks and - for bullets>"}.';

/**
 * Build the user message: the action, any free-text input, and the context.
 */
export function buildStoryPrompt(action, input, context) {
  return JSON.stringify({
    action,
    question: input || undefined,
    story: context,
  });
}

/**
 * Parse the model's JSON reply defensively (mirrors ai.js / sprint-synthesis).
 * @returns {null | { title:string, body:string }}
 */
export function parseStoryReply(text) {
  if (!text || typeof text !== 'string') return null;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      // Not JSON at all — treat the whole thing as a body if it has content.
      const trimmed = text.trim();
      return trimmed ? { title: '', body: trimmed } : null;
    }
    try { obj = JSON.parse(match[0]); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const body = typeof obj.body === 'string' ? obj.body.trim() : '';
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!body && !title) return null;
  return { title, body };
}

// ─── Deterministic responder (offline / fallback) ────────────────────────────

/**
 * Produce a genuinely useful on-device response with no network — used when no
 * key is configured or the model call fails. It reasons over the same context
 * so it never returns an empty or useless answer.
 *
 * @param {string} action
 * @param {string} input
 * @param {ReturnType<typeof buildStoryContext>} ctx
 * @returns {{ title:string, body:string }}
 */
export function deterministicStoryResponse(action, input, ctx) {
  const names = ctx.characters.map((c) => c.name).concat(ctx.boardActors.map((a) => a.name));
  const uniqueNames = [...new Set(names.filter(Boolean))];
  const lead = uniqueNames[0];
  const place = (ctx.locations[0] || {}).name;

  switch (action) {
    case 'continue': {
      const title = ctx.manuscript.recentSceneTitle ? `Continuing “${ctx.manuscript.recentSceneTitle}”` : 'Continue the scene';
      if (!ctx.manuscript.recentSceneExcerpt) {
        return { title, body: 'There\u2019s no recent manuscript prose to continue yet. Open the Manuscript or a Writing Sprint and draft an opening — then this will pick up from where you left off.' };
      }
      const beats = [
        lead ? `- Raise the stakes for ${lead}: force a choice that costs something.` : '- Force your point-of-view character into a costly choice.',
        place ? `- Use ${place} against them — turn the setting into pressure.` : '- Turn the setting into pressure rather than backdrop.',
        '- End the beat on a question the reader needs answered.',
      ];
      return { title, body: `A few ways to push the scene forward:\n${beats.join('\n')}` };
    }
    case 'brainstorm': {
      const seeds = [
        lead && uniqueNames[1] ? `- A confrontation between ${lead} and ${uniqueNames[1]} brings a buried conflict into the open.` : '- Bring a buried conflict between two characters into the open.',
        (ctx.mysteries[0]) ? `- Reveal a partial answer to “${ctx.mysteries[0].title}” that creates a bigger question.` : '- Plant a mystery whose partial answer creates a bigger question.',
        place ? `- Something at ${place} changes the balance of power.` : '- A shift of power at a key location forces everyone to react.',
      ];
      return { title: 'Possible next events', body: seeds.join('\n') };
    }
    case 'develop': {
      if (!lead) return { title: 'Develop a character', body: 'Add a character first, then this will suggest goals, flaws and secrets to deepen them.' };
      return { title: `Developing ${lead}`, body: [
        `- What does ${lead} want on the surface — and what do they actually need underneath?`,
        `- Give ${lead} a flaw that sabotages the very thing they want.`,
        `- What secret would be most damaging if it surfaced at the worst moment?`,
      ].join('\n') };
    }
    case 'contradictions': {
      const issues = [];
      // Characters with no faction while factions exist.
      if (ctx.factions.length && ctx.characters.some((c) => !c.faction)) {
        issues.push('- Some characters have no faction while factions are defined — confirm their allegiances.');
      }
      if (ctx.manuscript.sceneCount === 0) issues.push('- No manuscript scenes yet, so continuity can\u2019t be checked against prose.');
      if (uniqueNames.length < 2) issues.push('- Fewer than two named characters — hard to create meaningful conflict.');
      return {
        title: 'Continuity check',
        body: issues.length ? issues.join('\n') : 'No obvious structural contradictions detected on-device. Add an AI key for a deeper, prose-aware read.',
      };
    }
    case 'threads': {
      const threads = [];
      ctx.mysteries.forEach((m) => threads.push(`- Unresolved: “${m.title}”${m.question ? ` — ${m.question}` : ''}.`));
      ctx.boardActors.filter((a) => a.hiddenGoal).forEach((a) => threads.push(`- ${a.name}\u2019s hidden goal is still unpaid off.`));
      return {
        title: 'Open threads',
        body: threads.length ? threads.slice(0, 8).join('\n') : 'No tracked mysteries or hidden goals yet — add some to have threads to resolve.',
      };
    }
    case 'ask':
    default: {
      const q = (input || '').trim();
      const facts = [];
      if (lead) facts.push(`Your central figures include ${uniqueNames.slice(0, 3).join(', ')}.`);
      if (place) facts.push(`Key places include ${ctx.locations.slice(0, 3).map((l) => l.name).join(', ')}.`);
      if (ctx.manuscript.totalWords) facts.push(`You\u2019ve written about ${ctx.manuscript.totalWords.toLocaleString()} words so far.`);
      const summary = facts.length ? facts.join(' ') : 'Your story is still a blank page — start by adding a character or writing an opening scene.';
      return {
        title: q ? 'About your world' : 'Your story so far',
        body: q
          ? `${summary}\n\n(Add an AI key in the ⋯ menu for a model-written answer to: “${q}”.)`
          : summary,
      };
    }
  }
}

/** Low-level: call the configured provider and parse the reply. */
async function requestStoryAI(action, input, context) {
  const { provider, apiKey, model } = getAISettings();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: cfg.headers(apiKey),
      body: JSON.stringify(cfg.buildBody(model || cfg.defaultModel, STORY_AI_SYSTEM_PROMPT, buildStoryPrompt(action, input, context))),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return parseStoryReply(cfg.extractText(json));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Public entry point. Always resolves to a usable response. Uses the model when
 * a key is configured (falling back to deterministic on any failure), otherwise
 * responds on-device.
 *
 * @param {string} action   one of STORY_ACTIONS ids
 * @param {string} [input]  free-text (for the "ask" action)
 * @param {object} [opts]   { activeModule }
 * @returns {Promise<{ title:string, body:string, usedAI:boolean }>}
 */
export async function getStoryResponse(action, input = '', opts = {}) {
  const context = buildStoryContext(opts);
  const fallback = () => ({ ...deterministicStoryResponse(action, input, context), usedAI: false });

  if (!isAIEnabled()) return fallback();

  try {
    const reply = await requestStoryAI(action, input, context);
    if (!reply) return fallback();
    return { ...reply, usedAI: true };
  } catch (err) {
    console.warn('[LoreForge] Story AI failed, using deterministic response:', err.message);
    return fallback();
  }
}
