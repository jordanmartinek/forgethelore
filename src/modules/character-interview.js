/**
 * LoreForge Planner - Interview a Character (#9)
 *
 * Chat with any character, grounded in THEIR stored data. Free by default:
 *   - If free in-browser AI (WebLLM) is available and the user enables it, the
 *     model role-plays the character from a persona system prompt.
 *   - Otherwise (default), the deterministic character voice answers — no key,
 *     no network, always available.
 *
 * A great way to discover how a character would react before you write a scene.
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';
import { getRelationshipsFor } from '../core/progression.js';
import { toastInfo, toastError } from '../ui/toast.js';
import { buildPersona, buildSystemPrompt, deterministicReply, extractSubject } from '../core/character-voice.js';
import { isWebGpuAvailable, isLocalAIReady, ensureLocalAI, localChat, localAIStatus } from '../core/local-ai.js';

let activeCharId = null;
let useLocalAI = false;
// transcripts keyed by character id: [{ role:'user'|'char', text }]
const transcripts = new Map();

/** All interviewable characters: board pieces + character-planner entries. */
function allCharacters() {
  const pieces = repo.list(Collections.PIECES).map((p) => ({ ...p, __src: 'piece' }));
  const chars = repo.list(Collections.CHARACTERS).map((c) => ({ ...c, __src: 'character' }));
  // De-dupe by name (a piece and a character sheet may describe the same person);
  // prefer the richer character-planner entry.
  const byName = new Map();
  for (const p of pieces) byName.set((p.name || '').toLowerCase(), p);
  for (const c of chars) byName.set((c.name || '').toLowerCase(), c);
  return [...byName.values()].filter((c) => c.name);
}

export function renderCharacterInterview(container) {
  const chars = allCharacters();
  const wrap = h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 'var(--space-xl)' } });

  wrap.appendChild(h('div', { style: { marginBottom: '12px' } },
    h('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, '💬 Interview a Character'),
    h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, 'Ask your characters anything — grounded in their goals, fears, and secrets. Free, offline by default.'),
  ));

  if (chars.length === 0) {
    wrap.appendChild(emptyNote('Add characters (on the Strategic Board or in the Characters planner) to interview them.'));
    container.appendChild(wrap);
    return;
  }

  if (!activeCharId || !chars.some((c) => c.id === activeCharId)) activeCharId = chars[0].id;
  const active = chars.find((c) => c.id === activeCharId);

  // Controls: character picker + local-AI toggle.
  wrap.appendChild(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' } },
    h('select', { class: 'input', style: { maxWidth: '260px' }, onchange: (e) => { activeCharId = e.target.value; rerender(container); } },
      ...chars.map((c) => h('option', { value: c.id, ...(c.id === activeCharId ? { selected: 'selected' } : {}) }, c.name))),
    renderAIToggle(container),
    h('button', { class: 'btn btn--ghost btn--sm', onclick: () => { transcripts.delete(activeCharId); rerender(container); } }, '🗑️ Clear chat'),
  ));

  // Persona summary chip.
  const persona = buildPersona(active);
  wrap.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' } },
    [persona.role, persona.faction].filter(Boolean).join(' · ') || 'No role/faction set',
    (persona.hiddenGoal || persona.secrets) ? ' · 🤫 guards secrets' : '',
  ));

  // Transcript.
  const log = transcripts.get(activeCharId) || [];
  const feed = h('div', { id: 'interview-feed', style: { flex: '1', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px', marginBottom: '12px', minHeight: '200px', background: 'var(--surface-1)' } });
  if (log.length === 0) {
    feed.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } }, `Say hello to ${active.name}, or try: "What do you want?", "What are you afraid of?", "What are you hiding?"`));
  }
  log.forEach((m) => feed.appendChild(renderBubble(m, active)));
  wrap.appendChild(feed);

  // Input row.
  const input = h('input', { class: 'input', placeholder: `Ask ${active.name} something…`, style: { flex: '1' },
    onkeydown: (e) => { if (e.key === 'Enter') { send(container, input.value); input.value = ''; } } });
  wrap.appendChild(h('div', { style: { display: 'flex', gap: '8px' } },
    input,
    h('button', { class: 'btn btn--primary', onclick: () => { send(container, input.value); input.value = ''; } }, 'Ask'),
  ));
  // Suggested prompts.
  wrap.appendChild(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
    ...['What do you want?', 'What are you afraid of?', 'What are you hiding?', 'Why do you do this?'].map((q) =>
      h('button', { class: 'btn btn--ghost btn--sm', style: { fontSize: '11px' }, onclick: () => send(container, q) }, q)),
  ));

  container.appendChild(wrap);
}

function rerender(container) {
  renderPreservingScroll(container, () => { container.innerHTML = ''; renderCharacterInterview(container); });
}

function renderAIToggle(container) {
  if (!isWebGpuAvailable()) {
    return h('span', { style: { fontSize: '11px', color: 'var(--text-muted)' }, title: 'Your browser lacks WebGPU — using the built-in offline character voice.' }, '💠 Offline voice');
  }
  const ready = isLocalAIReady();
  const label = useLocalAI ? (ready ? '🧠 Local AI: on' : `🧠 Local AI: ${localAIStatus()}…`) : '🧠 Enable free local AI';
  return h('button', {
    class: `btn btn--sm ${useLocalAI ? 'btn--primary' : ''}`,
    title: 'Runs a small model in your browser (WebGPU) — no key, nothing leaves your device. First use downloads the model.',
    onclick: async () => {
      if (useLocalAI) { useLocalAI = false; rerender(container); return; }
      useLocalAI = true;
      rerender(container);
      toastInfo('Loading the local model… first time can take a bit.');
      const ok = await ensureLocalAI({ onProgress: () => {} });
      if (!ok) { useLocalAI = false; toastError('Local AI could not start — using the offline character voice.'); }
      rerender(container);
    },
  }, label);
}

function renderBubble(m, active) {
  const mine = m.role === 'user';
  return h('div', { style: { display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '8px' } },
    h('div', { style: { maxWidth: '75%', padding: '8px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.5',
      background: mine ? 'var(--accent-primary)' : 'var(--bg-elevated)', color: mine ? 'white' : 'var(--text-primary)',
      border: mine ? 'none' : '1px solid var(--border-subtle)' } },
      !mine ? h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' } }, active.name) : null,
      m.text,
    ),
  );
}

async function send(container, text) {
  const q = (text || '').trim();
  if (!q) return;
  const chars = allCharacters();
  const active = chars.find((c) => c.id === activeCharId);
  if (!active) return;

  const log = transcripts.get(activeCharId) || [];
  log.push({ role: 'user', text: q });
  transcripts.set(activeCharId, log);
  rerender(container);

  const persona = buildPersona(active);
  let reply;

  if (useLocalAI && isLocalAIReady()) {
    try {
      const messages = [
        { role: 'system', content: buildSystemPrompt(persona) },
        // Include a short rolling history for continuity.
        ...log.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      ];
      reply = (await localChat(messages)).trim();
    } catch (e) {
      console.warn('[LoreForge] local chat failed, using deterministic voice:', e.message);
      reply = deterministicReply(persona, q, opinionContext(active, q));
    }
  } else {
    reply = deterministicReply(persona, q, opinionContext(active, q));
  }

  const log2 = transcripts.get(activeCharId) || [];
  log2.push({ role: 'char', text: reply });
  transcripts.set(activeCharId, log2);
  rerender(container);
}

/**
 * For an "opinion of X" question, provide relationship context so the
 * deterministic voice can answer with real dimensions when a relationship
 * exists between this character and the named subject.
 */
function opinionContext(active, question) {
  const subj = extractSubject(question);
  if (!subj) return {};
  const pieces = repo.list(Collections.PIECES);
  const nameById = new Map(pieces.map((p) => [p.id, p.name]));
  // Relationships are keyed on BOARD-PIECE ids. The active character may be a
  // character-sheet entry (different id) that shares a name with a piece, so
  // resolve to the matching piece id by name before looking up relationships.
  const activePieceId = pieces.some((p) => p.id === active.id)
    ? active.id
    : (pieces.find((p) => (p.name || '').toLowerCase() === (active.name || '').toLowerCase())?.id || active.id);
  const rels = getRelationshipsFor(activePieceId);
  if (!rels.length) return {};
  const match = rels.find((r) => {
    const otherId = r.sourceId === activePieceId ? r.targetId : r.sourceId;
    return (nameById.get(otherId) || '').toLowerCase() === subj.toLowerCase();
  });
  if (!match) return {};
  const dims = match.dimensions || {};
  const dominant = Object.entries(dims).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
  const phrase = describeRelationship(match.type, dominant);
  return { relationshipsText: `${subj}? ${phrase}` };
}

function describeRelationship(type, dominant) {
  const [dim, val] = dominant || [];
  if (type === 'opposition' || type === 'rivalry') return 'We are not on the same side, and both of us know it.';
  if (type === 'alliance' || type === 'friendship') return 'An ally — for now, and for as long as our interests align.';
  if (type === 'romance') return 'That… is complicated, and not for you to pry into.';
  if (type === 'manipulation') return 'A useful piece on the board. They just don\'t know it yet.';
  if (dim && val > 60) return `There is real ${dim} between us.`;
  return 'We have crossed paths. I keep my judgments to myself.';
}

function emptyNote(text) {
  return h('div', { class: 'empty-state', style: { padding: '32px' } },
    h('div', { class: 'empty-state__icon' }, '💬'),
    h('div', { class: 'empty-state__description' }, text));
}
