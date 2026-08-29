/**
 * LoreForge Planner - Character Voice (#9 interview-a-character)
 *
 * Turns a character's stored data into (a) a persona used to prompt an LLM and
 * (b) a DETERMINISTIC, in-character reply generator that needs no model, no key,
 * and no network — so "interview a character" always works, for free.
 *
 * The deterministic voice is intentionally simple: it classifies the question
 * (goal / fear / secret / relationship / opinion-of-X / greeting / generic) and
 * answers from the character's own fields, coloured by their momentum and
 * whether they'd guard a secret. It's a genuine, grounded fallback — not a
 * placeholder — and it's what the tests exercise.
 */

/**
 * Build a normalized persona from a character record (board piece OR
 * character-planner entry — fields overlap and are all optional).
 * @param {object} c
 * @returns {object} persona
 */
export function buildPersona(c = {}) {
  return {
    name: c.name || 'Unknown',
    role: c.role || '',
    faction: c.faction || '',
    goal: c.goal || c.goals || '',
    hiddenGoal: c.hiddenGoal || '',
    secrets: c.secrets || '',
    fears: c.fears || '',
    personality: c.personality || c.description || '',
    lies: c.lies || '',
    speech: c.speech || '',
    motivations: c.motivations || '',
    momentum: c.momentum || 'stable',
  };
}

/** A compact system prompt instructing an LLM to role-play the character. */
export function buildSystemPrompt(persona) {
  const lines = [
    `You are ${persona.name}, a character in a work of fiction. Stay fully in character.`,
    persona.role && `Your role: ${persona.role}.`,
    persona.faction && `You belong to: ${persona.faction}.`,
    persona.personality && `Personality: ${persona.personality}`,
    persona.goal && `What you want (openly): ${persona.goal}`,
    persona.motivations && `What drives you: ${persona.motivations}`,
    persona.fears && `What you fear: ${persona.fears}`,
    persona.speech && `How you speak: ${persona.speech}`,
    persona.hiddenGoal && `A HIDDEN agenda you conceal and will NOT openly admit: ${persona.hiddenGoal}`,
    persona.secrets && `Secrets you guard and will deflect questions about: ${persona.secrets}`,
    persona.lies && `A lie you believe or tell: ${persona.lies}`,
    'Answer in first person, briefly (1-3 sentences), never breaking character or mentioning that you are an AI. If asked about something you hide, deflect or evade rather than confess.',
  ].filter(Boolean);
  return lines.join('\n');
}

// ─── Deterministic reply ─────────────────────────────────────────────────────

const GUARD_LINES = [
  'Some things are better left unsaid.',
  "That's not something I'll discuss.",
  'You ask a great deal for someone owed so little.',
  'Careful. Curiosity like that has a cost.',
];

function momentumColor(persona) {
  if (persona.momentum === 'rising') return 'And things are going my way, lately.';
  if (persona.momentum === 'falling') return 'Though I will admit the ground feels less certain than it did.';
  return '';
}

function firstSentence(text) {
  if (!text) return '';
  const m = String(text).split(/(?<=[.!?])\s/)[0];
  return m.trim();
}

/** Classify a free-text question into an intent. */
export function classifyQuestion(q) {
  const s = (q || '').toLowerCase();
  if (/^\s*(hi|hello|hey|greetings|good (morning|day|evening))\b/.test(s)) return 'greeting';
  if (/\bwho are you|introduce|tell me about yourself|your name\b/.test(s)) return 'greeting';
  // Secret first: concealment must win over any goal/motivation keywords.
  if (/\b(secret|hiding|conceal)\b/.test(s) || /what are you hiding/.test(s)) return 'secret';
  // Opinion before goal: "what do you think of the plan" should be an opinion,
  // not a goal answer (goal keywords like 'plan'/'aim' would otherwise capture it).
  if (/\bthink (of|about)\b|\bopinion of\b|\bfeel about\b|\btrust\b/.test(s)) return 'opinion';
  if (/\b(fear|afraid|scared|terrified|terrifies|dread)\b/.test(s)) return 'fear';
  if (/\b(want|goal|after|seeking|desire|plan|aim)\b/.test(s)) return 'goal';
  if (/\b(why|motivat|drives you|care about)\b/.test(s)) return 'motivation';
  return 'generic';
}

/**
 * Extract a name the question asks an opinion about, e.g.
 * "what do you think of Aurelian?" -> "Aurelian". Returns '' if none.
 */
export function extractSubject(q) {
  const m = /(?:think (?:of|about)|opinion of|feel about|trust)\s+([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*)/.exec(q || '');
  return m ? m[1].replace(/[?.!]$/, '').trim() : '';
}

/**
 * Produce a deterministic, in-character reply to a question. Pure — no network.
 * @param {object} persona
 * @param {string} question
 * @param {object} [ctx]  optional { relationshipsText } for opinion questions
 * @returns {string}
 */
export function deterministicReply(persona, question, ctx = {}) {
  const intent = classifyQuestion(question);
  const color = momentumColor(persona);
  const guard = GUARD_LINES[Math.abs(hash(persona.name + question)) % GUARD_LINES.length];

  switch (intent) {
    case 'greeting': {
      const bits = [`I am ${persona.name}${persona.role ? `, ${persona.role}` : ''}.`];
      if (persona.faction) bits.push(`I serve ${persona.faction}.`);
      if (persona.personality) bits.push(firstSentence(persona.personality));
      return bits.filter(Boolean).join(' ');
    }
    case 'goal': {
      if (persona.goal) return withColorText(`What I want? ${persona.goal}.`, color);
      return 'What I want is my own concern — but make no mistake, I want it badly.';
    }
    case 'motivation': {
      if (persona.motivations) return firstSentence(persona.motivations);
      if (persona.goal) return `Everything I do, I do for one reason: ${persona.goal}.`;
      return 'My reasons are my own. They are enough.';
    }
    case 'fear': {
      if (persona.fears) return withColorText(`If you must know — ${lowerFirst(firstSentence(persona.fears))}.`, color);
      return 'Fear is a luxury I do not indulge.';
    }
    case 'secret': {
      // Guard hidden goals and secrets — deflect rather than confess.
      if (persona.hiddenGoal || persona.secrets) return guard;
      return 'I keep no secrets worth the name. Believe that or not.';
    }
    case 'opinion': {
      const subj = extractSubject(question);
      if (ctx.relationshipsText) return ctx.relationshipsText;
      if (subj) return `${subj}? We have… history. I say no more than that.`;
      return 'People are tools or obstacles. I judge them as they prove themselves.';
    }
    default: {
      // Generic: answer from personality/goal with a touch of voice.
      if (persona.personality) return withColorText(firstSentence(persona.personality), color);
      if (persona.goal) return `All that matters to me is this: ${persona.goal}.`;
      return `I am ${persona.name}. Ask me something worth answering.`;
    }
  }
}

function withColorText(base, color) { return color ? `${base} ${color}` : base; }
function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return h;
}
