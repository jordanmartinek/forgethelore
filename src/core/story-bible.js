/**
 * LoreForge Planner - Story Bible Export (#7)
 *
 * Compiles the whole project — characters, factions, locations, scenes,
 * relationships, mysteries, and the timeline — into a single, self-contained,
 * navigable HTML document the author can open, share with beta readers, or
 * print to PDF (via the browser's Print dialog). No dependencies: it emits a
 * plain HTML string with inline CSS and a sidebar of anchor links.
 *
 * The generator is pure (data in -> HTML string out) so it can be unit-tested
 * with no DOM.
 */

import * as repo from './repo.js';
import { Collections } from './repo.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Only allow a hex color or a simple CSS color keyword into a style attribute. */
function safeColor(c) {
  const s = String(c || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^[a-zA-Z]{1,20}$/.test(s)) return s; // named colors like "red"
  return '#6366f1';
}

function para(text) {
  const t = String(text || '').trim();
  return t ? `<p>${esc(t).replace(/\n+/g, '</p><p>')}</p>` : '<p class="muted">Not yet defined.</p>';
}

/**
 * Build the bible model from the repo (or from injected collections for tests).
 * @param {object} [data] optional overrides { project, characters, pieces, factions, ... }
 */
export function buildBibleModel(data = {}) {
  const get = (coll, key) => (data[key] !== undefined ? data[key] : repo.list(coll));
  return {
    project: data.project || { name: 'Untitled Project', description: '' },
    factions: get(Collections.BOARD_FACTIONS, 'factions'),
    pieces: get(Collections.PIECES, 'pieces'),
    characters: get(Collections.CHARACTERS, 'characters'),
    locations: get(Collections.LOCATIONS, 'locations'),
    scenes: [...get(Collections.SCENES, 'scenes')].sort((a, b) => (a.order || 0) - (b.order || 0)),
    mysteries: get(Collections.MYSTERIES, 'mysteries'),
    relationships: get(Collections.RELATIONSHIPS, 'relationships'),
    species: get(Collections.SPECIES, 'species'),
    technologies: get(Collections.TECHNOLOGIES, 'technologies'),
  };
}

/**
 * Render the full bible as a standalone HTML document string.
 * @param {object} model  from buildBibleModel
 * @returns {string} complete HTML document
 */
export function renderBibleHTML(model) {
  const sections = [];
  const nav = [];
  // Name map covers BOTH board pieces and character-sheet entries, so scene
  // participants / relationship endpoints keyed on either id space resolve to a
  // name instead of rendering a raw id.
  const pieceName = new Map();
  (model.pieces || []).forEach((p) => pieceName.set(p.id, p.name));
  (model.characters || []).forEach((c) => pieceName.set(c.id, c.name));
  const factionName = new Map((model.factions || []).map((f) => [f.id, f.name]));

  const addSection = (id, title, bodyHtml, count) => {
    if (!bodyHtml) return;
    nav.push(`<a href="#${id}">${esc(title)}${count != null ? ` <span class="count">${count}</span>` : ''}</a>`);
    sections.push(`<section id="${id}"><h2>${esc(title)}</h2>${bodyHtml}</section>`);
  };

  // Overview
  addSection('overview', 'Overview',
    `<p class="lead">${esc(model.project.description || 'A world in progress.')}</p>
     <ul class="stats">
       <li><b>${(model.characters || []).length + (model.pieces || []).length}</b> characters</li>
       <li><b>${(model.factions || []).length}</b> factions</li>
       <li><b>${(model.scenes || []).length}</b> scenes</li>
       <li><b>${(model.mysteries || []).length}</b> mysteries</li>
     </ul>`);

  // Factions
  if ((model.factions || []).length) {
    addSection('factions', 'Factions',
      model.factions.map((f) => `<div class="card"><h3><span class="swatch" style="background:${safeColor(f.color)}"></span>${esc(f.name)}</h3>
        ${f.goal ? `<p><b>Goal:</b> ${esc(f.goal)}</p>` : ''}${para(f.description)}</div>`).join(''),
      model.factions.length);
  }

  // Characters (merge board pieces + character sheets by name; sheet wins).
  const charByName = new Map();
  (model.pieces || []).forEach((p) => charByName.set((p.name || '').toLowerCase(), { ...p }));
  (model.characters || []).forEach((c) => charByName.set((c.name || '').toLowerCase(), { ...(charByName.get((c.name || '').toLowerCase()) || {}), ...c }));
  const chars = [...charByName.values()].filter((c) => c.name);
  if (chars.length) {
    addSection('characters', 'Characters',
      chars.map((c) => {
        const fac = factionName.get(c.faction) || c.faction || '';
        return `<div class="card"><h3>${esc(c.name)}</h3>
          <p class="muted">${esc([c.role, fac].filter(Boolean).join(' · '))}</p>
          ${c.description || c.personality ? para(c.description || c.personality) : ''}
          ${c.goal || c.goals ? `<p><b>Wants:</b> ${esc(c.goal || c.goals)}</p>` : ''}
          ${c.secrets ? `<details><summary>Secrets (spoilers)</summary>${para(c.secrets)}</details>` : ''}</div>`;
      }).join(''), chars.length);
  }

  // Locations
  if ((model.locations || []).length) {
    addSection('locations', 'Locations',
      model.locations.map((l) => `<div class="card"><h3>${esc(l.name)}</h3><p class="muted">${esc(l.type || '')}</p>${para(l.description)}</div>`).join(''),
      model.locations.length);
  }

  // Timeline (scenes)
  if ((model.scenes || []).length) {
    addSection('timeline', 'Timeline',
      `<ol class="timeline">${model.scenes.map((s) => {
        const cast = (s.participants || []).map((id) => pieceName.get(id)).filter(Boolean).join(', ');
        return `<li><b>${esc(s.title || 'Untitled')}</b>${s.conflictType ? ` <span class="tag">${esc(s.conflictType)}</span>` : ''}
          ${s.summary ? `<div>${esc(s.summary)}</div>` : ''}${cast ? `<div class="muted">Featuring: ${esc(cast)}</div>` : ''}
          ${s.outcome ? `<div class="muted">Outcome: ${esc(s.outcome)}</div>` : ''}</li>`;
      }).join('')}</ol>`, model.scenes.length);
  }

  // Relationships
  if ((model.relationships || []).length) {
    addSection('relationships', 'Relationships',
      `<ul class="rels">${model.relationships.map((r) => {
        const a = pieceName.get(r.sourceId) || r.sourceId;
        const b = pieceName.get(r.targetId) || r.targetId;
        return `<li><b>${esc(a)}</b> &harr; <b>${esc(b)}</b> <span class="tag">${esc(r.type || 'related')}</span></li>`;
      }).join('')}</ul>`, model.relationships.length);
  }

  // Mysteries (with a spoiler-guarded truth)
  if ((model.mysteries || []).length) {
    addSection('mysteries', 'Mysteries',
      model.mysteries.map((m) => `<div class="card"><h3>${esc(m.title || 'Untitled')}</h3>
        ${m.question ? `<p><i>${esc(m.question)}</i></p>` : ''}
        ${m.truth ? `<details><summary>The truth (spoilers)</summary>${para(m.truth)}</details>` : ''}</div>`).join(''),
      model.mysteries.length);
  }

  // World-building extras.
  const extra = [];
  (model.species || []).forEach((s) => extra.push(`<div class="card"><h3>${esc(s.name)}</h3><p class="muted">Species</p>${para(s.description)}</div>`));
  (model.technologies || []).forEach((t) => extra.push(`<div class="card"><h3>${esc(t.name)}</h3><p class="muted">Technology</p>${para(t.description)}</div>`));
  if (extra.length) addSection('world', 'World-Building', extra.join(''), extra.length);

  const title = esc(model.project.name || 'Story Bible');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Story Bible</title>
<style>
  :root { --ink:#1e1e28; --muted:#6b7280; --accent:#6366f1; --line:#e5e7eb; --bg:#ffffff; --card:#f9fafb; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--ink); background:var(--bg); line-height:1.6; }
  .layout { display:grid; grid-template-columns: 240px 1fr; }
  nav { position:sticky; top:0; align-self:start; height:100vh; overflow:auto; padding:24px 16px; border-right:1px solid var(--line); background:var(--card); }
  nav h1 { font-size:16px; margin:0 0 16px; }
  nav a { display:block; padding:6px 8px; border-radius:6px; color:var(--ink); text-decoration:none; font-size:13px; }
  nav a:hover { background:#eef2ff; color:var(--accent); }
  nav .count { color:var(--muted); font-size:11px; }
  main { padding:40px 48px; max-width:820px; }
  h2 { font-size:24px; border-bottom:2px solid var(--line); padding-bottom:8px; margin-top:40px; }
  section:first-child h2 { margin-top:0; }
  h3 { font-size:16px; margin:0 0 4px; display:flex; align-items:center; gap:8px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:12px 0; }
  .muted { color:var(--muted); font-size:13px; }
  .lead { font-size:16px; }
  .swatch { width:12px; height:12px; border-radius:3px; display:inline-block; }
  .stats { list-style:none; padding:0; display:flex; gap:20px; flex-wrap:wrap; }
  .stats b { font-size:20px; display:block; }
  .tag { font-size:11px; background:#eef2ff; color:var(--accent); border-radius:4px; padding:1px 6px; }
  ol.timeline { padding-left:20px; } ol.timeline li { margin-bottom:14px; }
  ul.rels, ul.rels li { list-style:none; padding:0; } ul.rels li { padding:4px 0; }
  details { margin-top:6px; } summary { cursor:pointer; color:var(--accent); font-size:13px; }
  @media print { nav { display:none; } .layout { display:block; } main { max-width:none; } details > :not(summary) { display:block !important; } }
  @media (max-width: 720px) { .layout { grid-template-columns:1fr; } nav { position:static; height:auto; } }
</style></head>
<body><div class="layout">
  <nav><h1>📖 ${title}</h1>${nav.join('')}</nav>
  <main>${sections.join('')}<footer class="muted" style="margin-top:48px;border-top:1px solid var(--line);padding-top:16px;">Generated by LoreForge Planner · ${esc(new Date().toLocaleDateString())}</footer></main>
</div></body></html>`;
}

/** Convenience: build the model from live data and render the HTML. */
export function generateBibleHTML(project) {
  return renderBibleHTML(buildBibleModel({ project }));
}
