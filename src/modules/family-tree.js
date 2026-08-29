/**
 * LoreForge Planner - Family Trees / Lineage (#24)
 *
 * A dedicated lineage view: authors define parent→child and spouse links
 * between characters (board pieces), and the module lays them out as
 * generational family trees with an SVG connector overlay. Persists its own
 * lightweight link model (Collections.FAMILY_LINKS) rather than overloading the
 * relationship engine, since lineage is structurally different (directed,
 * generational) from the trust/fear/etc. dimensions.
 *
 * Link model:
 *   { id, type: 'parent'|'spouse', from: pieceId, to: pieceId }
 *   - parent: from is the parent, to is the child
 *   - spouse: undirected pair (from/to interchangeable)
 */

import { h, renderPreservingScroll } from '../core/renderer.js';
import { showModal, formField, confirmDialog } from '../ui/modal.js';
import * as repo from '../core/repo.js';
import { Collections } from '../core/repo.js';

function pieces() { return repo.list(Collections.PIECES); }
function links() { return repo.list(Collections.FAMILY_LINKS); }
function saveLinks(l) { return repo.write(Collections.FAMILY_LINKS, l); }

export function renderFamilyTree(container) {
  const wrap = h('div', { style: { width: '100%', height: '100%', overflow: 'auto', padding: 'var(--space-xl)' } });

  wrap.appendChild(h('div', { style: { marginBottom: '16px' } },
    h('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px' } }, '🌳 Family Trees'),
    h('p', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, 'Map bloodlines, marriages, and succession between your characters.'),
  ));

  const pcs = pieces();
  if (pcs.length === 0) {
    wrap.appendChild(emptyNote('Add characters on the Strategic Board first, then link them into families here.'));
    container.appendChild(wrap);
    return;
  }

  wrap.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginBottom: '16px' } },
    h('button', { class: 'btn btn--sm btn--primary', onclick: () => openLinkModal(container, 'parent') }, '+ Parent → Child'),
    h('button', { class: 'btn btn--sm', onclick: () => openLinkModal(container, 'spouse') }, '+ Marriage'),
  ));

  const l = links();
  if (l.length === 0) {
    wrap.appendChild(emptyNote('No family links yet. Add a parent→child relationship or a marriage to grow a tree.'));
    container.appendChild(wrap);
    return;
  }

  // Build generations via longest-path depth from roots (pieces with no parent).
  const layout = computeLayout(pcs, l);
  wrap.appendChild(renderTreeSVG(pcs, l, layout, container));

  // Editable link list.
  wrap.appendChild(renderLinkList(pcs, l, container));

  container.appendChild(wrap);
}

function rerender(container) {
  renderPreservingScroll(container, () => { container.innerHTML = ''; renderFamilyTree(container); });
}

/**
 * Assign each piece a generation (row) and column. Roots (no incoming 'parent')
 * are generation 0; a child's generation is max(parent generation)+1. Cycle-safe
 * via a visited guard.
 */
export function computeLayout(pcs, l) {
  const parentsOf = new Map(); // childId -> [parentId]
  l.filter((x) => x.type === 'parent').forEach((x) => {
    if (!parentsOf.has(x.to)) parentsOf.set(x.to, []);
    parentsOf.get(x.to).push(x.from);
  });

  const gen = new Map();
  const computing = new Set();
  function genOf(id) {
    if (gen.has(id)) return gen.get(id);
    computing.add(id);
    const parents = parentsOf.get(id) || [];
    // Ignore any parent edge that leads back into a node we're currently
    // resolving — that's a lineage cycle (malformed), and treating the back-edge
    // as absent yields a stable generation instead of a visit-order artifact.
    const resolvableParents = parents.filter((p) => !computing.has(p));
    const g = resolvableParents.length === 0 ? 0 : Math.max(...resolvableParents.map((p) => genOf(p))) + 1;
    computing.delete(id);
    gen.set(id, g);
    return g;
  }
  pcs.forEach((p) => genOf(p.id));

  // Group by generation, assign columns in stable order.
  const byGen = new Map();
  pcs.forEach((p) => {
    const g = gen.get(p.id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(p.id);
  });

  const pos = new Map(); // id -> {row, col, total}
  for (const [g, ids] of byGen) {
    ids.forEach((id, i) => pos.set(id, { row: g, col: i, total: ids.length }));
  }
  return { pos, maxGen: Math.max(0, ...[...byGen.keys()]) };
}

function renderTreeSVG(pcs, l, layout, container) {
  const pieceById = new Map(pcs.map((p) => [p.id, p]));
  const COL_W = 150, ROW_H = 100, NODE_W = 120, NODE_H = 44, PAD = 30;
  const maxCols = Math.max(1, ...[...layout.pos.values()].map((p) => p.total));
  const width = Math.max(400, maxCols * COL_W + PAD * 2);
  const height = (layout.maxGen + 1) * ROW_H + PAD * 2;

  const xy = (id) => {
    const p = layout.pos.get(id);
    if (!p) return { x: PAD, y: PAD };
    // Center each generation's row.
    const rowStartX = (width - p.total * COL_W) / 2;
    return { x: rowStartX + p.col * COL_W + COL_W / 2, y: PAD + p.row * ROW_H + NODE_H / 2 };
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.maxWidth = `${width}px`;
  svg.style.display = 'block';

  // Connectors.
  l.forEach((link) => {
    const a = xy(link.from), b = xy(link.to);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (link.type === 'spouse') {
      line.setAttribute('d', `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
      line.setAttribute('stroke', '#ec4899');
      line.setAttribute('stroke-dasharray', '4 3');
    } else {
      // parent -> child: elbow connector
      const midY = (a.y + b.y) / 2;
      line.setAttribute('d', `M ${a.x} ${a.y + NODE_H / 2} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y - NODE_H / 2}`);
      line.setAttribute('stroke', 'var(--border-strong, #475569)');
    }
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
  });

  // Nodes.
  layout.pos.forEach((_, id) => {
    const piece = pieceById.get(id);
    if (!piece) return;
    const { x, y } = xy(id);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x - NODE_W / 2); rect.setAttribute('y', y - NODE_H / 2);
    rect.setAttribute('width', NODE_W); rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', 'var(--bg-elevated)');
    rect.setAttribute('stroke', 'var(--border-default)');
    rect.setAttribute('stroke-width', '1.5');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '12');
    text.setAttribute('fill', 'var(--text-primary)');
    text.textContent = piece.name.length > 15 ? piece.name.slice(0, 14) + '…' : piece.name;
    g.appendChild(rect); g.appendChild(text);
    svg.appendChild(g);
  });

  return h('div', { style: { overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '8px', marginBottom: '16px' } }, svg);
}

function renderLinkList(pcs, l, container) {
  const name = new Map(pcs.map((p) => [p.id, p.name]));
  return h('div', { class: 'intel-section' },
    h('div', { class: 'intel-section__title' }, `Links (${l.length})`),
    ...l.map((link) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' } },
      h('span', {}, link.type === 'spouse' ? '💍' : '👪'),
      h('span', { style: { flex: '1', color: 'var(--text-secondary)' } },
        link.type === 'spouse'
          ? `${name.get(link.from) || '?'} ⚭ ${name.get(link.to) || '?'}`
          : `${name.get(link.from) || '?'} → ${name.get(link.to) || '?'}`),
      h('button', { class: 'btn btn--ghost btn--icon btn--sm', title: 'Remove', onclick: async () => { if (await confirmDialog({ title: 'Remove link?', message: 'Removes this family connection.', confirmLabel: 'Remove', danger: true })) { saveLinks(l.filter((x) => x.id !== link.id)); rerender(container); } } }, '🗑️'),
    )),
  );
}

function openLinkModal(container, type) {
  const pcs = pieces();
  const state = { from: pcs[0]?.id || '', to: pcs[1]?.id || pcs[0]?.id || '' };
  const opts = (sel) => pcs.map((p) => h('option', { value: p.id, ...(p.id === sel ? { selected: 'selected' } : {}) }, p.name));
  const content = h('div', {},
    formField(type === 'spouse' ? 'Spouse A' : 'Parent', h('select', { class: 'input', onchange: (e) => state.from = e.target.value }, ...opts(state.from))),
    formField(type === 'spouse' ? 'Spouse B' : 'Child', h('select', { class: 'input', onchange: (e) => state.to = e.target.value }, ...opts(state.to))),
  );
  showModal(type === 'spouse' ? 'Add Marriage' : 'Add Parent → Child', content, () => {
    if (!state.from || !state.to || state.from === state.to) return;
    const l = links();
    l.push({ id: `fl_${Date.now()}`, type, from: state.from, to: state.to });
    saveLinks(l);
    rerender(container);
  });
}

function emptyNote(text) {
  return h('div', { class: 'empty-state', style: { padding: '32px' } },
    h('div', { class: 'empty-state__icon' }, '🌳'),
    h('div', { class: 'empty-state__description' }, text));
}
