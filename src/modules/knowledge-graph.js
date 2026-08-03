/**
 * LoreForge Planner - Knowledge Graph
 * Force-directed graph visualization of all objects
 */

import { h } from '../core/renderer.js';

const graphNodes = [
  { id: 'g1', label: 'Aurelian', type: 'character', color: '#ef4444', x: 300, y: 250 },
  { id: 'g2', label: 'AXIOM Prime', type: 'character', color: '#3b82f6', x: 500, y: 180 },
  { id: 'g3', label: 'Captain Sera', type: 'character', color: '#f59e0b', x: 200, y: 400 },
  { id: 'g4', label: 'The Dominion', type: 'faction', color: '#ef4444', x: 150, y: 150 },
  { id: 'g5', label: 'Machinae', type: 'faction', color: '#3b82f6', x: 550, y: 300 },
  { id: 'g6', label: 'Void Conduit', type: 'location', color: '#a855f7', x: 400, y: 350 },
  { id: 'g7', label: 'The Breach', type: 'location', color: '#a855f7', x: 600, y: 150 },
  { id: 'g8', label: 'FTL Drive', type: 'technology', color: '#22c55e', x: 100, y: 300 },
  { id: 'g9', label: 'Void Energy', type: 'technology', color: '#22c55e', x: 350, y: 100 },
  { id: 'g10', label: 'Conduit Origin', type: 'mystery', color: '#ec4899', x: 450, y: 450 },
  { id: 'g11', label: 'The Swarm', type: 'faction', color: '#22c55e', x: 650, y: 400 },
  { id: 'g12', label: 'Fleet Alpha', type: 'military', color: '#ef4444', x: 200, y: 200 },
  { id: 'g13', label: 'Dr. Voss', type: 'character', color: '#f59e0b', x: 350, y: 500 },
];

const graphLinks = [
  { source: 'g1', target: 'g4', type: 'leads' },
  { source: 'g1', target: 'g6', type: 'wants' },
  { source: 'g2', target: 'g5', type: 'leads' },
  { source: 'g2', target: 'g7', type: 'investigates' },
  { source: 'g3', target: 'g1', type: 'opposes' },
  { source: 'g4', target: 'g12', type: 'controls' },
  { source: 'g5', target: 'g2', type: 'contains' },
  { source: 'g6', target: 'g10', type: 'related' },
  { source: 'g6', target: 'g9', type: 'uses' },
  { source: 'g8', target: 'g9', type: 'depends' },
  { source: 'g10', target: 'g6', type: 'about' },
  { source: 'g11', target: 'g6', type: 'wants' },
  { source: 'g13', target: 'g10', type: 'investigates' },
  { source: 'g13', target: 'g9', type: 'studies' },
  { source: 'g3', target: 'g13', type: 'allied' },
];

const filterTypes = ['All', 'Characters', 'Factions', 'Locations', 'Technology', 'Mysteries'];
let activeFilter = 'All';

export function renderKnowledgeGraph(container) {
  const graph = h('div', { class: 'knowledge-graph' });
  
  // Filter controls
  const filters = h('div', { class: 'knowledge-graph__filters' },
    ...filterTypes.map(type => 
      h('button', { 
        class: `graph-filter ${type === activeFilter ? 'graph-filter--active' : ''}`,
        onclick: (e) => {
          activeFilter = type;
          document.querySelectorAll('.graph-filter').forEach(b => b.classList.remove('graph-filter--active'));
          e.target.classList.add('graph-filter--active');
          updateGraphVisibility();
        }
      }, type)
    )
  );
  
  graph.appendChild(filters);
  
  // SVG graph
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.id = 'knowledge-svg';
  
  // Draw links
  graphLinks.forEach(link => {
    const source = graphNodes.find(n => n.id === link.source);
    const target = graphNodes.find(n => n.id === link.target);
    if (!source || !target) return;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(source.x));
    line.setAttribute('y1', String(source.y));
    line.setAttribute('x2', String(target.x));
    line.setAttribute('y2', String(target.y));
    line.setAttribute('class', 'graph-link');
    line.dataset.source = link.source;
    line.dataset.target = link.target;
    svg.appendChild(line);
  });
  
  // Draw nodes
  graphNodes.forEach(node => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'graph-node');
    g.dataset.nodeId = node.id;
    g.dataset.type = node.type;
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(node.x));
    circle.setAttribute('cy', String(node.y));
    circle.setAttribute('r', '12');
    circle.setAttribute('fill', node.color);
    circle.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    circle.setAttribute('stroke-width', '2');
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(node.x));
    text.setAttribute('y', String(node.y + 24));
    text.setAttribute('class', 'graph-node__label');
    text.textContent = node.label;
    
    g.appendChild(circle);
    g.appendChild(text);
    svg.appendChild(g);
  });
  
  graph.appendChild(svg);
  container.appendChild(graph);
  updateGraphSidebar();
}

function updateGraphVisibility() {
  const typeMap = {
    'Characters': 'character',
    'Factions': 'faction',
    'Locations': 'location',
    'Technology': 'technology',
    'Mysteries': 'mystery',
  };
  
  document.querySelectorAll('.graph-node').forEach(node => {
    if (activeFilter === 'All' || node.dataset.type === typeMap[activeFilter]) {
      node.style.opacity = '1';
    } else {
      node.style.opacity = '0.15';
    }
  });
}

function updateGraphSidebar() {
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  
  const types = [...new Set(graphNodes.map(n => n.type))];
  types.forEach(type => {
    sidebar.appendChild(h('div', { style: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '8px' } }, type + 's'));
    
    graphNodes.filter(n => n.type === type).forEach(node => {
      sidebar.appendChild(
        h('div', { class: 'sidebar-item' },
          h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: node.color, display: 'inline-block' } }),
          h('span', { class: 'sidebar-item__label' }, node.label),
        )
      );
    });
  });
}
