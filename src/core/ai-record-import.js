/**
 * LoreForge Planner - AI Record Import
 *
 * Pure parsers that turn an exported conversation file from another AI tool into
 * draft AI Records the writer can review before saving. Supports the common
 * export shapes and degrades gracefully to a generic parser, so an unknown or
 * future format still produces something usable rather than failing.
 *
 * Recognised shapes (detected by structure, not filename):
 *   - ChatGPT   `conversations.json`: an array of conversations, each with a
 *                `mapping` of message nodes (node.message.content.parts[]).
 *   - Claude    data export `conversations.json`: an array of conversations,
 *                each with `chat_messages[]` (message.text or content[].text).
 *   - Generic   OpenAI-style `{ messages:[{role,content}] }` or an array of
 *                `{role,content}` turns, or a bare array of conversations.
 *
 * Everything here is DOM/IO-free and unit-testable. The UI (modules/ai-record)
 * reads the file text, calls `parseAIExport`, and lets the user pick which
 * drafts to keep. Each draft is a plain object shaped for `makeRecord`.
 */

/**
 * @typedef {Object} RecordDraft
 * @property {string} title
 * @property {string} source   an AI_SOURCES id guessed from the format
 * @property {string} model
 * @property {string} prompt    the first user turn (if any)
 * @property {string} content   the transcript (prompt excluded if captured)
 * @property {string[]} tags
 */

const MAX_CONVERSATIONS = 500;   // safety cap for a huge export
const MAX_CONTENT_CHARS = 40000; // per-record content cap

/** Trim + collapse excessive blank lines; cap length. */
function clean(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

/** Flatten a ChatGPT message node's content into plain text. */
function chatgptNodeText(node) {
  const msg = node && node.message;
  if (!msg || !msg.content) return '';
  const c = msg.content;
  if (Array.isArray(c.parts)) {
    return c.parts.map((p) => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : ''))).join('\n').trim();
  }
  if (typeof c.text === 'string') return c.text.trim();
  return '';
}

/** Order a ChatGPT `mapping` into a linear list of {role,text} turns. */
function chatgptTurns(conversation) {
  const mapping = conversation && conversation.mapping;
  if (!mapping || typeof mapping !== 'object') return [];
  // Walk from the root down the `children` chain for stable chronological order;
  // fall back to create_time sort if the chain is broken.
  const nodes = Object.values(mapping);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => !n.parent) || null;
  const ordered = [];
  if (root) {
    let cur = root;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      ordered.push(cur);
      const next = (cur.children || []).map((id) => byId.get(id)).filter(Boolean);
      cur = next[0] || null;
    }
  }
  const walk = ordered.length ? ordered : nodes.slice().sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
  const turns = [];
  for (const node of walk) {
    const role = node.message?.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = chatgptNodeText(node);
    if (text) turns.push({ role, text });
  }
  return turns;
}

/** Order a Claude conversation's messages into {role,text} turns. */
function claudeTurns(conversation) {
  const msgs = conversation && (conversation.chat_messages || conversation.messages);
  if (!Array.isArray(msgs)) return [];
  const turns = [];
  for (const m of msgs) {
    const roleRaw = m.sender || m.role || '';
    const role = /assistant|claude/i.test(roleRaw) ? 'assistant' : (/human|user/i.test(roleRaw) ? 'user' : '');
    if (!role) continue;
    let text = '';
    if (typeof m.text === 'string' && m.text.trim()) text = m.text;
    else if (Array.isArray(m.content)) text = m.content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('\n');
    text = String(text || '').trim();
    if (text) turns.push({ role, text });
  }
  return turns;
}

/** Render linear turns into a readable transcript, and pull out the first prompt. */
function turnsToDraft(turns, { source, model, title, fallbackTitle }) {
  const firstUser = turns.find((t) => t.role === 'user');
  const prompt = firstUser ? clean(firstUser.text) : '';
  const transcript = turns
    .map((t) => `${t.role === 'user' ? 'You' : 'AI'}: ${t.text.trim()}`)
    .join('\n\n');
  const derivedTitle = (title && String(title).trim())
    || (firstUser ? firstUser.text.split('\n')[0].slice(0, 70) : '')
    || fallbackTitle;
  return {
    title: derivedTitle,
    source,
    model: model || '',
    prompt,
    content: clean(transcript),
    tags: [],
  };
}

// ── Format detection ──────────────────────────────────────────────────────────

function looksLikeChatGPT(convos) {
  return Array.isArray(convos) && convos.some((c) => c && typeof c.mapping === 'object' && c.mapping);
}
function looksLikeClaude(convos) {
  return Array.isArray(convos) && convos.some((c) => c && Array.isArray(c.chat_messages));
}

/**
 * Parse exported JSON (already `JSON.parse`d or a raw string) into draft records.
 * Never throws for malformed input — returns { format:'unknown', drafts:[], error }.
 *
 * @param {string|object|array} input
 * @returns {{ format:string, drafts:RecordDraft[], error?:string }}
 */
export function parseAIExport(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); }
    catch (_) { return { format: 'unknown', drafts: [], error: 'Not valid JSON.' }; }
  }
  if (!data || typeof data !== 'object') return { format: 'unknown', drafts: [], error: 'Empty or unrecognised file.' };

  // Normalise to a list of "conversations".
  let convos = null;
  if (Array.isArray(data)) convos = data;
  else if (Array.isArray(data.conversations)) convos = data.conversations;
  else convos = [data]; // single conversation object

  // ChatGPT.
  if (looksLikeChatGPT(convos)) {
    const drafts = convos.slice(0, MAX_CONVERSATIONS)
      .map((c, i) => turnsToDraft(chatgptTurns(c), { source: 'chatgpt', model: c.default_model_slug || '', title: c.title, fallbackTitle: `ChatGPT conversation ${i + 1}` }))
      .filter((d) => d.content);
    return { format: 'chatgpt', drafts };
  }

  // Claude.
  if (looksLikeClaude(convos)) {
    const drafts = convos.slice(0, MAX_CONVERSATIONS)
      .map((c, i) => turnsToDraft(claudeTurns(c), { source: 'claude', model: c.model || '', title: c.name || c.title, fallbackTitle: `Claude conversation ${i + 1}` }))
      .filter((d) => d.content);
    return { format: 'claude', drafts };
  }

  // Generic OpenAI-style { messages:[{role,content}] } or array of turns.
  const genericTurns = extractGenericTurns(data);
  if (genericTurns.length) {
    const draft = turnsToDraft(genericTurns, { source: 'other', model: data.model || '', title: data.title, fallbackTitle: 'Imported conversation' });
    return { format: 'generic', drafts: draft.content ? [draft] : [] };
  }

  // Last resort: if there's a big string field, keep it as raw content.
  const raw = typeof data.content === 'string' ? data.content : (typeof data.text === 'string' ? data.text : '');
  if (raw.trim()) {
    return { format: 'generic', drafts: [{ title: data.title || 'Imported note', source: 'other', model: '', prompt: '', content: clean(raw), tags: [] }] };
  }

  return { format: 'unknown', drafts: [], error: 'No conversations found in this file.' };
}

/** Pull {role,content} turns out of a generic OpenAI-ish payload. */
function extractGenericTurns(data) {
  const arr = Array.isArray(data.messages) ? data.messages
    : (Array.isArray(data) ? data : null);
  if (!Array.isArray(arr)) return [];
  const turns = [];
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue;
    const role = /assistant/i.test(m.role) ? 'assistant' : (/user|human/i.test(m.role) ? 'user' : '');
    if (!role) continue;
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) text = m.content.map((p) => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : ''))).join('\n');
    text = String(text || '').trim();
    if (text) turns.push({ role, text });
  }
  return turns;
}
