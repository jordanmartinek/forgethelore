/**
 * LoreForge Planner - Character Arc Visualization
 * Shows character progression over scenes as visual charts.
 */

import { h } from '../core/renderer.js';

import { characterArcs, getArc, RELATIONSHIP_DIMENSIONS, getRelationshipsFor, getStateAtScene } from '../core/progression.js';
import { getPieces, getScenes } from '../core/entities.js';

export function renderCharacterArc(container, characterId) {
  const pcs = getPieces();
  const piece = characterId ? pcs.find(p => p.id === characterId) : pcs[0];
  if (!piece) {
    container.appendChild(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-state__icon' }, '📈'),
      h('div', { class: 'empty-state__title' }, 'No Characters'),
      h('div', { class: 'empty-state__description' }, 'Add characters to the Strategic Board first.'),
    ));
    return;
  }

  const planner = h('div', { class: 'character-planner' },
    renderArcCharacterList(piece.id),
    renderArcDetail(piece)
  );
  container.appendChild(planner);
}

function renderArcCharacterList(activeId) {
  const pcs = getPieces();
  const list = h('div', { class: 'character-list' },
    h('div', { style: { padding: '8px 12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)' } }, 'Character Arcs'),
  );

  pcs.forEach(piece => {
    const arc = getArc(piece.id);
    const eventCount = arc ? arc.events.length : 0;
    list.appendChild(h('div', {
      class: `character-card ${piece.id === activeId ? 'character-card--active' : ''}`,
      onclick: (e) => {
        document.querySelectorAll('.character-card').forEach(c => c.classList.remove('character-card--active'));
        e.currentTarget.classList.add('character-card--active');
        const detail = document.querySelector('.character-detail');
        if (detail) { detail.innerHTML = ''; detail.appendChild(renderArcDetailContent(piece)); }
      }
    },
      h('div', { class: 'character-card__avatar', style: { background: 'var(--surface-3)', fontSize: '14px' } }, piece.momentum === 'rising' ? '📈' : piece.momentum === 'falling' ? '📉' : '➡️'),
      h('div', { class: 'character-card__info' },
        h('div', { class: 'character-card__name' }, piece.name),
        h('div', { class: 'character-card__role' }, `${eventCount} events • ${piece.momentum}`),
      ),
      h('span', { class: `tag tag--${piece.momentum === 'rising' ? 'success' : piece.momentum === 'falling' ? 'danger' : 'accent'}`, style: { fontSize: '9px' } }, piece.momentum),
    ));
  });

  return list;
}

function renderArcDetail(piece) {
  return h('div', { class: 'character-detail' }, renderArcDetailContent(piece));
}

function renderArcDetailContent(piece) {
  const arc = getArc(piece.id);
  const rels = getRelationshipsFor(piece.id);
  const scenes = getScenes();

  return h('div', {},
    // Header
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' } }, piece.momentum === 'rising' ? '📈' : piece.momentum === 'falling' ? '📉' : '➡️'),
      h('div', {},
        h('h2', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '2px' } }, `${piece.name}'s Arc`),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, `${arc ? arc.events.length : 0} progression events • ${rels.length} relationships`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
          h('span', { class: `tag tag--${piece.momentum === 'rising' ? 'success' : piece.momentum === 'falling' ? 'danger' : 'accent'}` }, `Momentum: ${piece.momentum}`),
        ),
      ),
    ),

    // Current Resources
    createCollapsible('Current Resources', true,
      h('div', { style: { display: 'grid', gap: '8px' } },
        ...Object.entries(piece.resources).map(([key, value]) => {
          const color = value > 70 ? 'var(--success)' : value > 40 ? 'var(--warning)' : 'var(--danger)';
          return h('div', {},
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' } },
              h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' } }, key),
              h('span', { style: { fontSize: '12px', fontWeight: '700', color } }, `${value}%`),
            ),
            h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${value}%`, background: color } })),
          );
        })
      )
    ),

    // State-at-Scene scrubber: replay how this character's resources stood at
    // any point in the story, powered by progression.getStateAtScene.
    renderStateAtSceneScrubber(piece, scenes),

    // Arc Timeline (visual progression)
    createCollapsible('Progression Timeline', true,
      arc && arc.events.length > 0
        ? h('div', { style: { borderLeft: '2px solid var(--accent-primary)', paddingLeft: '16px', marginLeft: '8px' } },
            ...arc.events.map((event, i) => {
              const scene = scenes.find(s => s.id === event.sceneId);
              const isPositive = Object.values(event.resourceChanges).reduce((s, v) => s + v, 0) > 0;
              return h('div', { style: { marginBottom: '16px', position: 'relative' } },
                // Dot
                h('div', { style: { position: 'absolute', left: '-21px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: isPositive ? 'var(--success)' : 'var(--danger)', border: '2px solid var(--bg-elevated)' } }),
                // Content
                h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '2px' } }, scene ? `Scene ${scene.order}: ${scene.title}` : `Event ${i + 1}`),
                h('div', { style: { fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' } }, event.label),
                // Changes
                h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  ...Object.entries(event.resourceChanges).map(([key, delta]) => {
                    const color = delta > 0 ? 'var(--success)' : 'var(--danger)';
                    return h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: color + '20', color } }, `${key} ${delta > 0 ? '+' : ''}${delta}`);
                  }),
                  h('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-3)', color: 'var(--text-muted)' } }, `${event.momentumBefore} → ${event.momentumAfter}`),
                ),
              );
            })
          )
        : h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' } }, 'No progression events yet. Complete scenes involving this character to see their arc develop.')
    ),

    // Resource Chart (ASCII-style bar comparison across scenes)
    arc && arc.events.length >= 2 ? createCollapsible('Resource Progression Chart', true,
      h('div', { style: { overflowX: 'auto' } },
        h('div', { style: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px', padding: '8px 0' } },
          ...arc.events.map((event, i) => {
            const total = Object.values(event.resourceChanges).reduce((s, v) => s + v, 0);
            const height = Math.abs(total) * 3;
            const isPositive = total > 0;
            const scene = scenes.find(s => s.id === event.sceneId);
            return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '50px' } },
              h('div', { style: { width: '30px', height: `${Math.max(height, 8)}px`, background: isPositive ? 'var(--success)' : 'var(--danger)', borderRadius: '4px 4px 0 0', opacity: '0.8', transition: 'height 0.3s ease' } }),
              h('div', { style: { fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `S${scene ? scene.order : i + 1}`),
            );
          })
        ),
        h('div', { style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' } }, '↑ Green = net gain, Red = net loss per scene'),
      )
    ) : null,

    // Relationships summary
    createCollapsible(`Relationships (${rels.length})`, true,
      rels.length > 0
        ? h('div', { style: { display: 'grid', gap: '8px' } },
            ...rels.map(rel => {
              const pcs = getPieces();
              const otherId = rel.sourceId === piece.id ? rel.targetId : rel.sourceId;
              const other = pcs.find(p => p.id === otherId);
              const typeColor = getTypeColor(rel.type);
              return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border-subtle)' } },
                h('div', { style: { width: '8px', height: '8px', borderRadius: '50%', background: typeColor, flexShrink: '0' } }),
                h('div', { style: { flex: '1' } },
                  h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' } }, other ? other.name : '?'),
                  h('div', { style: { fontSize: '10px', color: typeColor } }, rel.type),
                ),
                h('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `Trust: ${rel.dimensions.trust}%`),
              );
            })
          )
        : h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' } }, 'No relationships defined yet.')
    ),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTypeColor(type) {
  const colors = { alliance: '#3b82f6', opposition: '#ef4444', manipulation: '#eab308', mentorship: '#22c55e', romance: '#ec4899', rivalry: '#f97316', friendship: '#06b6d4', fear: '#7c3aed', respect: '#f59e0b', hatred: '#dc2626', family: '#84cc16', professional: '#64748b' };
  return colors[type] || '#6366f1';
}

function createCollapsible(title, open, content) {
  if (!content) return null;
  return h('div', { class: `collapsible ${open ? 'collapsible--open' : ''}` },
    h('div', { class: 'collapsible__header', onclick: (e) => e.currentTarget.parentElement.classList.toggle('collapsible--open') },
      h('span', { class: 'collapsible__chevron' }, '›'),
      h('span', { class: 'collapsible__title' }, title),
    ),
    h('div', { class: 'collapsible__body' }, h('div', { class: 'collapsible__content' }, content))
  );
}

/**
 * "State at Scene X" scrubber. Uses progression.getStateAtScene to replay the
 * character's resource levels at any scene, so the author can see exactly how a
 * character stood at any moment in the story — a genuinely unique view that was
 * previously only available as raw math with no UI.
 */
function renderStateAtSceneScrubber(piece, scenes) {
  const ordered = [...scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (ordered.length === 0) {
    return createCollapsible('State at Scene', false,
      h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' } },
        'Add scenes to the Strategic Board to scrub through this character\'s state over time.'));
  }

  // Without recorded arc events, getStateAtScene returns the same values for
  // every scene, so the scrubber would look broken. Show a hint instead.
  const arc = getArc(piece.id);
  if (!arc || !arc.events || arc.events.length === 0) {
    return createCollapsible('State at Scene', false,
      h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' } },
        `No progression recorded for ${piece.name} yet. Log scene outcomes involving them (Quick Log) to replay how their resources change over time.`));
  }

  const bars = h('div', { style: { display: 'grid', gap: '8px', marginTop: '12px' } });
  const caption = h('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' } });

  function paint(sceneId) {
    const scene = ordered.find((s) => s.id === sceneId) || ordered[ordered.length - 1];
    const state = getStateAtScene(piece.id, scene.id, ordered, getPieces());
    const resources = (state && state.resources) ? state.resources : (piece.resources || {});
    const momentum = (state && state.momentum) || piece.momentum;
    caption.textContent = `At Scene ${scene.order}: ${scene.title || 'Untitled'} — momentum ${momentum}`;
    bars.innerHTML = '';
    Object.entries(resources).forEach(([key, value]) => {
      const color = value > 70 ? 'var(--success)' : value > 40 ? 'var(--warning)' : 'var(--danger)';
      bars.appendChild(h('div', {},
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' } },
          h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' } }, key),
          h('span', { style: { fontSize: '12px', fontWeight: '700', color } }, `${value}%`),
        ),
        h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: { width: `${value}%`, background: color } })),
      ));
    });
  }

  const slider = h('input', {
    type: 'range', min: '0', max: String(ordered.length - 1), value: String(ordered.length - 1),
    step: '1', style: { width: '100%' },
    'aria-label': 'Scrub to scene',
    oninput: (e) => paint(ordered[Number(e.target.value)].id),
  });

  paint(ordered[ordered.length - 1].id);

  return createCollapsible('State at Scene (replay)', false,
    h('div', {},
      caption,
      slider,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' } },
        h('span', {}, `Scene ${ordered[0].order}`),
        h('span', {}, `Scene ${ordered[ordered.length - 1].order}`),
      ),
      bars,
    ));
}
