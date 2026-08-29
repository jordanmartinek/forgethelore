/**
 * LoreForge Planner - Dependency-Free SVG Charts
 *
 * Small, self-contained SVG chart builders (no libraries) used by the temporal
 * views: line, multi-series line, stacked area, bars, and sparklines. All
 * return an <svg> Node built with the same createSVGElement primitive the rest
 * of the app uses, so they drop straight into any container.
 *
 * Conventions:
 *   - series values are numbers; x is the index (scene order).
 *   - `labels` are the x-axis tick labels (e.g. scene titles / "S1").
 *   - colors fall back to a palette when a series has none.
 */

import { createSVGElement as svg, h } from './renderer.js';

export const CHART_PALETTE = [
  '#6366f1', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#84cc16',
];

function ns(tag, attrs, ...children) {
  const el = svg(tag, attrs || {});
  for (const c of children.flat()) if (c) el.appendChild(c);
  return el;
}

function scaleX(i, n, w, padL, padR) {
  if (n <= 1) return padL;
  return padL + (i / (n - 1)) * (w - padL - padR);
}
function scaleY(v, min, max, h, padT, padB) {
  if (max === min) return h - padB;
  return padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
}

/**
 * Multi-series line chart.
 * @param {object} opts
 * @param {string[]} opts.labels     x-axis labels
 * @param {Array<{name:string,color?:string,values:number[]}>} opts.series
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {[number,number]} [opts.yRange]  fixed y-range (else auto)
 * @param {string} [opts.yUnit]
 * @returns {SVGElement}
 */
export function lineChart({ labels = [], series = [], width = 720, height = 260, yRange = null, yUnit = '' } = {}) {
  const padL = 40, padR = 16, padT = 16, padB = 34;
  const n = Math.max(1, labels.length);
  const allVals = series.flatMap((s) => s.values).filter((v) => typeof v === 'number');
  const min = yRange ? yRange[0] : Math.min(0, ...allVals);
  const max = yRange ? yRange[1] : Math.max(1, ...allVals);

  const root = ns('svg', { width: '100%', viewBox: `0 0 ${width} ${height}`, class: 'lf-chart', role: 'img' });

  // Gridlines + y labels (4 divisions).
  for (let g = 0; g <= 4; g++) {
    const val = min + ((max - min) * g) / 4;
    const y = scaleY(val, min, max, height, padT, padB);
    root.appendChild(ns('line', { x1: padL, y1: y, x2: width - padR, y2: y, stroke: 'var(--border-subtle)', 'stroke-width': '1' }));
    root.appendChild(ns('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': '9', fill: 'var(--text-muted)' }));
    root.lastChild.textContent = `${Math.round(val)}${yUnit}`;
  }

  // x labels (thinned to avoid clutter).
  const step = Math.ceil(n / 10);
  labels.forEach((lab, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const x = scaleX(i, n, width, padL, padR);
    const t = ns('text', { x, y: height - padB + 14, 'text-anchor': 'middle', 'font-size': '9', fill: 'var(--text-muted)' });
    t.textContent = String(lab).length > 10 ? String(lab).slice(0, 9) + '…' : String(lab);
    root.appendChild(t);
  });

  // series polylines + dots.
  series.forEach((s, si) => {
    const color = s.color || CHART_PALETTE[si % CHART_PALETTE.length];
    const pts = s.values.map((v, i) => `${scaleX(i, n, width, padL, padR)},${scaleY(v, min, max, height, padT, padB)}`).join(' ');
    root.appendChild(ns('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': '2', 'stroke-linejoin': 'round' }));
    s.values.forEach((v, i) => {
      root.appendChild(ns('circle', { cx: scaleX(i, n, width, padL, padR), cy: scaleY(v, min, max, height, padT, padB), r: '2.5', fill: color }));
    });
  });

  return root;
}

/**
 * Stacked area chart (e.g. faction power over time). Series stack bottom-up.
 * @param {object} opts same shape as lineChart; y auto-scales to the stack max.
 * @returns {SVGElement}
 */
export function stackedAreaChart({ labels = [], series = [], width = 720, height = 280 } = {}) {
  const padL = 40, padR = 16, padT = 16, padB = 34;
  const n = Math.max(1, labels.length);
  // Compute per-x stack totals for the y-scale.
  const totals = [];
  for (let i = 0; i < n; i++) totals.push(series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
  const max = Math.max(1, ...totals);

  const root = ns('svg', { width: '100%', viewBox: `0 0 ${width} ${height}`, class: 'lf-chart', role: 'img' });

  // Baselines accumulate as we stack.
  const baseline = new Array(n).fill(0);
  series.forEach((s, si) => {
    const color = s.color || CHART_PALETTE[si % CHART_PALETTE.length];
    const top = [];
    const bottom = [];
    for (let i = 0; i < n; i++) {
      const yBottom = scaleY(baseline[i], 0, max, height, padT, padB);
      baseline[i] += (s.values[i] || 0);
      const yTop = scaleY(baseline[i], 0, max, height, padT, padB);
      top.push(`${scaleX(i, n, width, padL, padR)},${yTop}`);
      bottom.push(`${scaleX(i, n, width, padL, padR)},${yBottom}`);
    }
    const poly = [...top, ...bottom.reverse()].join(' ');
    root.appendChild(ns('polygon', { points: poly, fill: color, 'fill-opacity': '0.75', stroke: color, 'stroke-width': '1' }));
  });

  const step = Math.ceil(n / 10);
  labels.forEach((lab, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const x = scaleX(i, n, width, padL, padR);
    const t = ns('text', { x, y: height - padB + 14, 'text-anchor': 'middle', 'font-size': '9', fill: 'var(--text-muted)' });
    t.textContent = String(lab).length > 10 ? String(lab).slice(0, 9) + '…' : String(lab);
    root.appendChild(t);
  });

  return root;
}

/**
 * Simple vertical bar chart with an optional per-bar color and a "highlight"
 * index (used by the tension graph to mark the active scene).
 * @returns {SVGElement}
 */
export function barChart({ labels = [], values = [], colors = [], width = 720, height = 240, highlight = -1, onBar = null } = {}) {
  const padL = 40, padR = 16, padT = 16, padB = 34;
  const n = Math.max(1, values.length);
  const max = Math.max(1, ...values);
  const root = ns('svg', { width: '100%', viewBox: `0 0 ${width} ${height}`, class: 'lf-chart', role: 'img' });

  const bandW = (width - padL - padR) / n;
  const barW = Math.max(2, bandW * 0.7);
  values.forEach((v, i) => {
    const x = padL + i * bandW + (bandW - barW) / 2;
    const y = scaleY(v, 0, max, height, padT, padB);
    const barH = (height - padB) - y;
    const color = colors[i] || CHART_PALETTE[0];
    const rect = ns('rect', {
      x, y, width: barW, height: Math.max(0, barH), rx: '2',
      fill: color, 'fill-opacity': i === highlight ? '1' : '0.7',
      stroke: i === highlight ? 'var(--text-primary)' : 'none', 'stroke-width': '1.5',
    });
    if (onBar) { rect.style.cursor = 'pointer'; rect.addEventListener('click', () => onBar(i)); }
    root.appendChild(rect);
  });

  const step = Math.ceil(n / 12);
  labels.forEach((lab, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const x = padL + i * bandW + bandW / 2;
    const t = ns('text', { x, y: height - padB + 14, 'text-anchor': 'middle', 'font-size': '9', fill: 'var(--text-muted)' });
    t.textContent = String(lab);
    root.appendChild(t);
  });

  return root;
}

/**
 * Tiny inline sparkline (no axes), for embedding in cards.
 * @returns {SVGElement}
 */
export function sparkline(values = [], { width = 80, height = 20, color = 'var(--accent-primary)' } = {}) {
  const n = Math.max(1, values.length);
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(1, n - 1)) * width},${height - ((v - min) / (max - min || 1)) * height}`).join(' ');
  return ns('svg', { width, height, class: 'lf-sparkline' }, ns('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': '1.5' }));
}

/** A legend row for a set of named/colored series. */
export function chartLegend(series) {
  return h('div', { class: 'lf-chart-legend', style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' } },
    ...series.map((s, i) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)' } },
      h('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: s.color || CHART_PALETTE[i % CHART_PALETTE.length], display: 'inline-block' } }),
      s.name,
    )),
  );
}
