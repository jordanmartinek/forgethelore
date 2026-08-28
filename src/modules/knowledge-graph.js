/**
 * LoreForge Planner - Knowledge Graph
 *
 * PHASE 2 (#7): now renders from the REAL entity/relationship graph
 * (core/entities.js) built from your actual data — characters, factions, board
 * pieces, scenes, locations, tech, and the typed relationships between them —
 * instead of a hardcoded demo array. Includes:
 *   - a lightweight force-directed layout (no dependencies)
 *   - type filtering
 *   - click a node to open the module that owns it
 *
 * The simulation is intentionally simple and runs for a fixed number of ticks
 * so it settles quickly and never spins the CPU.
 */

import { h } from '../core/renderer.js';
import { appStore } from '../core/store.js';
import { buildGraph } from '../core/entities.js';

const TYPE_FILTERS = [
  { label: 'All', type: null },
  { label: 'Characters', type: 'character' },
  { label: 'Pieces', type: 'piece' },
  { label: 'Factions', type: 'faction' },
  { label: 'Locations', type: 'location' },
  { label: 'Scenes', type: 'scene' },
  { label: 'Technology', type: 'technology' },
  { label: 'Mysteries', type: 'mystery' },
];

let activeFilter = null;

export function renderKnowledgeGraph(container) {
  const { entities, edges } = buildGraph();

  const graph = h('div', { class: 'knowledge-graph', style: { position: 'relative' } });

  // Filter controls (only show types that actually exist in the data).
  const presentTypes = new Set(entities.map((e) => e.type));
  const filters = h('div', { class: 'knowledge-graph__filters' },
    ...TYPE_FILTERS.filter((f) => f.type === null || presentTypes.has(f.type)).map((f) =>
      h('button', {
        class: `graph-filter ${f.type === activeFilter ? 'graph-filter--active' : ''}`,
        type: 'button',
        onclick: () => {
          // Fast path: just toggle node opacity without recomputing the layout.
          activeFilter = f.type;
          applyFilter();
          document.querySelectorAll('.graph-filter').forEach((b) => b.classList.remove('graph-filter--active'));
          const btns = Array.from(document.querySelectorAll('.graph-filter'));
          const match = btns.find((b) => b.textContent === f.label);
          if (match) match.classList.add('graph-filter--active');
        },
      }, f.label)
    )
  );
  graph.appendChild(filters);

  if (entities.length === 0) {
    graph.appendChild(
      h('div', { class: 'empty-state', style: { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        h('div', { class: 'empty-state__icon' }, '🕸️'),
        h('div', { class: 'empty-state__title' }, 'Your knowledge graph is empty'),
        h('div', { class: 'empty-state__description' }, 'Create characters, factions, and scenes — then the connections between them appear here automatically.'),
      )
    );
    container.innerHTML = '';
    container.appendChild(graph);
    updateGraphSidebar(entities);
    return;
  }

  // For very large worlds, cap the drawn graph to the most-connected entities so
  // the O(n^2) layout stays responsive. A note tells the user what's shown.
  const MAX_NODES = 160;
  let drawEntities = entities;
  let drawEdges = edges;
  let capped = false;
  if (entities.length > MAX_NODES) {
    capped = true;
    const degree = new Map(entities.map((e) => [e.id, 0]));
    edges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });
    const keep = new Set(
      [...entities].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
        .slice(0, MAX_NODES).map((e) => e.id)
    );
    drawEntities = entities.filter((e) => keep.has(e.id));
    drawEdges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  }

  // Run the force layout, then draw.
  const width = 900;
  const height = 620;
  const positioned = layout(drawEntities, drawEdges, width, height);
  const posById = new Map(positioned.map((n) => [n.id, n]));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.id = 'knowledge-svg';

  // Edges.
  drawEdges.forEach((e) => {
    const s = posById.get(e.source);
    const t = posById.get(e.target);
    if (!s || !t) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(s.x));
    line.setAttribute('y1', String(s.y));
    line.setAttribute('x2', String(t.x));
    line.setAttribute('y2', String(t.y));
    line.setAttribute('class', 'graph-link');
    line.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    line.setAttribute('stroke-width', '1.5');
    line.dataset.source = e.source;
    line.dataset.target = e.target;
    svg.appendChild(line);
  });

  // Nodes.
  positioned.forEach((node) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'graph-node');
    g.dataset.nodeId = node.id;
    g.dataset.type = node.type;
    g.style.cursor = 'pointer';
    // Clicking a node navigates to the module that owns the entity.
    g.addEventListener('click', () => appStore.setState({ activeModule: node.module }));

    const degree = node._degree || 0;
    const r = 8 + Math.min(10, degree * 1.5);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(node.x));
    circle.setAttribute('cy', String(node.y));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', node.color || '#6366f1');
    circle.setAttribute('stroke', 'rgba(255,255,255,0.25)');
    circle.setAttribute('stroke-width', '2');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x));
    label.setAttribute('y', String(node.y + r + 12));
    label.setAttribute('class', 'graph-node__label');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'var(--text-secondary)');
    label.setAttribute('font-size', '10');
    label.textContent = node.name.length > 18 ? node.name.slice(0, 17) + '…' : node.name;

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${node.name} (${node.type})`;
    g.appendChild(title);

    g.appendChild(circle);
    g.appendChild(label);
    svg.appendChild(g);
  });

  graph.appendChild(svg);

  if (capped) {
    graph.appendChild(
      h('div', { style: { position: 'absolute', bottom: '12px', left: '12px', fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' } },
        `Showing the ${MAX_NODES} most-connected of ${entities.length} entities. Use the filters to focus.`)
    );
  }

  container.innerHTML = '';
  container.appendChild(graph);

  applyFilter();
  updateGraphSidebar(entities);
}

/**
 * Lightweight force-directed layout. Deterministic-ish initial placement on a
 * circle, then a fixed number of iterations of repulsion + spring attraction +
 * centering. Returns nodes with { x, y, _degree }.
 */
function layout(entities, edges, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const nodes = entities.map((e, i) => {
    const angle = (i / entities.length) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.35;
    return { ...e, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0, _degree: 0 };
  });
  const index = new Map(nodes.map((n) => [n.id, n]));

  // Degree for sizing.
  edges.forEach((e) => {
    const s = index.get(e.source); const t = index.get(e.target);
    if (s) s._degree++; if (t) t._degree++;
  });

  // Fewer iterations as the graph grows, keeping total work bounded.
  const ITER = nodes.length > 90 ? 120 : 220;
  const REPULSION = 5200;
  const SPRING = 0.02;
  const SPRING_LEN = 90;
  const CENTER = 0.006;
  const DAMPING = 0.85;

  for (let step = 0; step < ITER; step++) {
    // Repulsion (O(n^2) — fine for the sizes worldbuilding projects reach).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const force = REPULSION / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    // Spring attraction along edges.
    edges.forEach((e) => {
      const a = index.get(e.source); const b = index.get(e.target);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - SPRING_LEN) * SPRING;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });
    // Centering + integrate.
    nodes.forEach((n) => {
      n.vx += (cx - n.x) * CENTER;
      n.vy += (cy - n.y) * CENTER;
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x += n.vx; n.y += n.vy;
      // Keep within bounds.
      n.x = Math.max(30, Math.min(width - 30, n.x));
      n.y = Math.max(30, Math.min(height - 30, n.y));
    });
  }

  return nodes;
}

function applyFilter() {
  document.querySelectorAll('#knowledge-svg .graph-node').forEach((node) => {
    const show = activeFilter === null || node.dataset.type === activeFilter;
    node.style.opacity = show ? '1' : '0.12';
  });
}

function updateGraphSidebar(entities) {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';

  const byType = new Map();
  entities.forEach((e) => {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type).push(e);
  });

  if (byType.size === 0) {
    sidebar.appendChild(h('div', { style: { padding: '12px', fontSize: '12px', color: 'var(--text-muted)' } }, 'No entities yet.'));
    return;
  }

  for (const [type, items] of byType) {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, `${type}s (${items.length})`));
    items.forEach((ent) => {
      sidebar.appendChild(
        h('div', { class: 'sidebar-item', style: { cursor: 'pointer' }, onclick: () => appStore.setState({ activeModule: ent.module }) },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: ent.color || '#6366f1', display: 'inline-block' } }),
          h('span', { class: 'sidebar-item__label' }, ent.name),
        )
      );
    });
  }
}
