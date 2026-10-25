/**
 * AI Record import parser tests.
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-ai-record-import.mjs
 *
 * Verifies detection + extraction for ChatGPT, Claude and generic export shapes,
 * and that malformed input degrades gracefully (never throws).
 */

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

const { parseAIExport } = await import('../src/core/ai-record-import.js');

// ── ChatGPT conversations.json (mapping of message nodes) ────────────────────
const chatgpt = [{
  title: 'Magic system ideas',
  default_model_slug: 'gpt-4o',
  mapping: {
    root: { id: 'root', parent: null, children: ['m1'], message: null },
    m1: { id: 'm1', parent: 'root', children: ['m2'], message: { author: { role: 'user' }, create_time: 1, content: { content_type: 'text', parts: ['How should magic work in a desert world?'] } } },
    m2: { id: 'm2', parent: 'm1', children: [], message: { author: { role: 'assistant' }, create_time: 2, content: { content_type: 'text', parts: ['Tie it to water scarcity: casting costs hydration.'] } } },
  },
}];
const g = parseAIExport(chatgpt);
assert(g.format === 'chatgpt', 'detects ChatGPT format');
assert(g.drafts.length === 1, 'ChatGPT yields one draft');
assert(g.drafts[0].source === 'chatgpt' && g.drafts[0].model === 'gpt-4o', 'ChatGPT draft carries source + model');
assert(g.drafts[0].title === 'Magic system ideas', 'ChatGPT draft uses the conversation title');
assert(/How should magic work/.test(g.drafts[0].prompt), 'ChatGPT draft captures the first user turn as prompt');
assert(/You: How should magic/.test(g.drafts[0].content) && /AI: Tie it to water/.test(g.drafts[0].content), 'ChatGPT transcript labels turns in order');

// ChatGPT accepts the object-with-conversations wrapper too
const g2 = parseAIExport({ conversations: chatgpt });
assert(g2.format === 'chatgpt' && g2.drafts.length === 1, 'ChatGPT detected inside a { conversations: [...] } wrapper');

// title fallback when conversation has none
const noTitle = parseAIExport([{ mapping: { r: { id: 'r', parent: null, children: ['a'] }, a: { id: 'a', parent: 'r', children: [], message: { author: { role: 'user' }, content: { parts: ['Just one line prompt'] } } } } }]);
assert(noTitle.drafts[0].title === 'Just one line prompt', 'ChatGPT falls back to first user line for the title');

// ── Claude conversations.json (chat_messages) ────────────────────────────────
const claude = [{
  name: 'Villain brainstorm',
  model: 'claude-3-5-sonnet',
  chat_messages: [
    { sender: 'human', text: 'Give me a sympathetic villain.' },
    { sender: 'assistant', content: [{ type: 'text', text: 'A healer who kills to end suffering.' }] },
  ],
}];
const c = parseAIExport(claude);
assert(c.format === 'claude', 'detects Claude format');
assert(c.drafts.length === 1 && c.drafts[0].source === 'claude', 'Claude yields one draft with source=claude');
assert(c.drafts[0].title === 'Villain brainstorm', 'Claude draft uses conversation name');
assert(c.drafts[0].model === 'claude-3-5-sonnet', 'Claude draft carries model');
assert(/sympathetic villain/.test(c.drafts[0].prompt), 'Claude draft captures first user turn as prompt');
assert(/A healer who kills/.test(c.drafts[0].content), 'Claude extracts assistant content[].text');

// ── Generic OpenAI-style { messages:[{role,content}] } ───────────────────────
const generic = { model: 'some-model', messages: [
  { role: 'user', content: 'Name three themes.' },
  { role: 'assistant', content: 'Loss, memory, water.' },
] };
const ge = parseAIExport(generic);
assert(ge.format === 'generic' && ge.drafts.length === 1, 'detects generic messages format');
assert(ge.drafts[0].source === 'other', 'generic draft source=other');
assert(/Name three themes/.test(ge.drafts[0].prompt), 'generic draft captures prompt');
assert(/Loss, memory, water/.test(ge.drafts[0].content), 'generic draft captures assistant content');

// bare array of turns
const bare = parseAIExport([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello there.' }]);
assert(bare.format === 'generic' && /Hello there/.test(bare.drafts[0].content), 'generic parses a bare array of turns');

// last-resort raw content/text field
const raw = parseAIExport({ title: 'Loose note', content: 'Just a blob of brainstorming text.' });
assert(raw.format === 'generic' && raw.drafts[0].content === 'Just a blob of brainstorming text.', 'falls back to a raw content field');

// ── Malformed / unknown input degrades gracefully ────────────────────────────
assert(parseAIExport('not json').format === 'unknown', 'invalid JSON string -> unknown');
assert(parseAIExport('not json').drafts.length === 0, 'invalid JSON yields no drafts');
assert(parseAIExport(null).format === 'unknown', 'null -> unknown (no throw)');
assert(parseAIExport({}).format === 'unknown', 'empty object -> unknown');
assert(parseAIExport([]).format === 'unknown', 'empty array -> unknown');
assert(parseAIExport('{"foo":"bar"}').drafts.length === 0, 'unrecognised JSON yields no drafts');

// empty-content conversations are filtered out
const emptyConvo = parseAIExport([{ title: 'Empty', mapping: { r: { id: 'r', parent: null, children: [] } } }]);
assert(emptyConvo.drafts.length === 0, 'conversations with no extractable turns are dropped');

console.log(`\n${failed === 0 ? '✅' : '❌'} ai-record-import tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
