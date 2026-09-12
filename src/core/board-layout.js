/**
 * LoreForge Planner - Strategic Board layout helpers (multi-faction)
 *
 * Pure, DOM-free math for the Strategic Board's multi-faction features so they
 * can be unit-tested in Node and reused by the module view:
 *
 *   - arrangeByFaction(): partition the NxN board into one region per faction
 *     and lay each faction's pieces out inside its region. This replaces the
 *     old binary "antagonists top row / protagonists bottom row" metaphor with
 *     distinct territories, so 3–6 factions read as separate powers.
 *   - factionStrength(): aggregate a faction's pieces into a single strength
 *     score (sum of resource axes), for the legend / intel display.
 *
 * The board is a square grid of BOARD_DIM cells (default 8). Positions are
 * `{ row, col }` with 0 <= row,col < dim, matching conflict-board.js.
 */

export const BOARD_DIM = 8;

/**
 * Choose how to split the board into `n` rectangular regions. For small n we
 * pick pleasing layouts (a single band, side-by-side halves, quadrants…); for
 * larger n we fall back to a near-square grid of regions. Returns `{ rows, cols }`
 * describing how many region-rows and region-columns to tile.
 * @param {number} n  number of factions (>= 1)
 * @returns {{ rows: number, cols: number }}
 */
export function regionGrid(n) {
  const count = Math.max(1, Math.floor(n));
  switch (count) {
    case 1: return { rows: 1, cols: 1 };
    case 2: return { rows: 2, cols: 1 }; // top / bottom — preserves the classic two-pole feel
    case 3: return { rows: 1, cols: 3 };
    case 4: return { rows: 2, cols: 2 };
    case 5:
    case 6: return { rows: 2, cols: 3 };
    default: {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      return { rows, cols };
    }
  }
}

/**
 * The cell rectangle owned by region index `i` within a `dim`x`dim` board,
 * given a `{rows, cols}` region tiling. Splitting is as even as possible; any
 * remainder cells go to the earliest bands.
 * @returns {{ rowStart:number, rowEnd:number, colStart:number, colEnd:number }}
 *          end is EXCLUSIVE.
 */
export function regionRect(i, grid, dim = BOARD_DIM) {
  const { rows, cols } = grid;
  const r = Math.floor(i / cols);
  const c = i % cols;

  const band = (index, total, size) => {
    const base = Math.floor(size / total);
    const extra = size % total;
    // Bands before `index` that got an extra cell.
    const start = index * base + Math.min(index, extra);
    const len = base + (index < extra ? 1 : 0);
    return [start, start + len];
  };

  const [rowStart, rowEnd] = band(r, rows, dim);
  const [colStart, colEnd] = band(c, cols, dim);
  return { rowStart, rowEnd, colStart, colEnd };
}

/**
 * Place cells for `k` pieces inside a region rectangle, filling row-major and
 * centering the block vertically-ish. Never returns positions outside the rect;
 * if a region has more pieces than cells, extra pieces stack on the last cell.
 * @returns {Array<{row:number, col:number}>}
 */
export function cellsInRect(rect, k) {
  const width = Math.max(1, rect.colEnd - rect.colStart);
  const height = Math.max(1, rect.rowEnd - rect.rowStart);
  const capacity = width * height;
  const out = [];
  for (let idx = 0; idx < k; idx += 1) {
    const clamped = Math.min(idx, capacity - 1);
    const row = rect.rowStart + Math.floor(clamped / width);
    const col = rect.colStart + (clamped % width);
    out.push({ row, col });
  }
  return out;
}

/**
 * Compute new `{ [pieceId]: {row,col} }` positions that group pieces by faction
 * into distinct board regions. Pieces whose faction is unknown are gathered into
 * a trailing "unaligned" region so nothing is lost.
 *
 * @param {Array<{id:string, faction:string}>} pieces
 * @param {Array<{id:string}>} factions
 * @param {number} [dim]
 * @returns {Record<string, {row:number, col:number}>}
 */
export function arrangeByFaction(pieces, factions, dim = BOARD_DIM) {
  const list = Array.isArray(factions) ? factions.slice() : [];
  const byFaction = new Map(list.map((f) => [f.id, []]));
  const unaligned = [];
  (Array.isArray(pieces) ? pieces : []).forEach((p) => {
    if (p && byFaction.has(p.faction)) byFaction.get(p.faction).push(p);
    else if (p) unaligned.push(p);
  });

  // Regions: one per faction, plus one for unaligned pieces if any exist.
  const regionCount = list.length + (unaligned.length ? 1 : 0);
  const grid = regionGrid(regionCount || 1);

  const positions = {};
  const groups = list.map((f) => byFaction.get(f.id));
  if (unaligned.length) groups.push(unaligned);

  groups.forEach((group, i) => {
    const rect = regionRect(i, grid, dim);
    const cells = cellsInRect(rect, group.length);
    group.forEach((piece, j) => { positions[piece.id] = cells[j]; });
  });

  return positions;
}

/**
 * Aggregate a faction's strength: the summed resource axes of its pieces.
 * @param {string} factionId
 * @param {Array<{faction:string, resources?:object}>} pieces
 * @returns {{ pieces:number, total:number, byAxis:{political:number,military:number,economic:number,knowledge:number} }}
 */
export function factionStrength(factionId, pieces) {
  const byAxis = { political: 0, military: 0, economic: 0, knowledge: 0 };
  let count = 0;
  (Array.isArray(pieces) ? pieces : []).forEach((p) => {
    if (!p || p.faction !== factionId) return;
    count += 1;
    const r = p.resources || {};
    byAxis.political += Number(r.political) || 0;
    byAxis.military += Number(r.military) || 0;
    byAxis.economic += Number(r.economic) || 0;
    byAxis.knowledge += Number(r.knowledge) || 0;
  });
  const total = byAxis.political + byAxis.military + byAxis.economic + byAxis.knowledge;
  return { pieces: count, total, byAxis };
}

/**
 * Relative strength shares across factions (each 0..1, summing to 1 when any
 * strength exists). Useful for a "balance of power" bar.
 * @param {Array<{id:string}>} factions
 * @param {Array<object>} pieces
 * @returns {Array<{ id:string, total:number, share:number }>}
 */
export function powerShares(factions, pieces) {
  const rows = (Array.isArray(factions) ? factions : []).map((f) => ({ id: f.id, total: factionStrength(f.id, pieces).total }));
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({ ...r, share: grand > 0 ? r.total / grand : 0 }));
}
