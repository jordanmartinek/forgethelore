/**
 * Strategic Board multi-faction layout helper tests.
 * Pure logic, no DOM/network. Run: NODE_OPTIONS= node scripts/test-board-layout.mjs
 */

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

const L = await import('../src/core/board-layout.js');

// ── regionGrid: pleasing layouts for small N, near-square for large ──────────
assert(L.regionGrid(1).rows === 1 && L.regionGrid(1).cols === 1, '1 faction -> 1x1');
assert(L.regionGrid(2).rows === 2 && L.regionGrid(2).cols === 1, '2 factions -> top/bottom (2x1)');
assert(L.regionGrid(3).cols === 3, '3 factions -> 3 columns');
assert(L.regionGrid(4).rows === 2 && L.regionGrid(4).cols === 2, '4 factions -> quadrants');
assert(L.regionGrid(6).rows === 2 && L.regionGrid(6).cols === 3, '6 factions -> 2x3');
const g9 = L.regionGrid(9);
assert(g9.rows * g9.cols >= 9, '9 factions -> grid with >= 9 cells');

// ── regionRect: even partition, exclusive ends, covers the whole board ───────
const grid4 = L.regionGrid(4);
const rects = [0, 1, 2, 3].map((i) => L.regionRect(i, grid4, 8));
// Each quadrant of an 8x8 board is 4x4.
assert(rects[0].rowStart === 0 && rects[0].rowEnd === 4 && rects[0].colStart === 0 && rects[0].colEnd === 4, 'quadrant 0 = rows 0-4, cols 0-4');
assert(rects[3].rowStart === 4 && rects[3].rowEnd === 8 && rects[3].colStart === 4 && rects[3].colEnd === 8, 'quadrant 3 = rows 4-8, cols 4-8');
// Uneven split (3 cols across 8) distributes remainder to earliest bands: 3,3,2
const grid3 = L.regionGrid(3);
const w = [0, 1, 2].map((i) => { const r = L.regionRect(i, grid3, 8); return r.colEnd - r.colStart; });
assert(w[0] === 3 && w[1] === 3 && w[2] === 2, '3 columns over width 8 split 3/3/2');
assert(w[0] + w[1] + w[2] === 8, 'column bands cover the full width');

// ── cellsInRect: row-major fill, clamps overflow into the rect ───────────────
const rect = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }; // 2x2 = capacity 4
const cells = L.cellsInRect(rect, 3);
assert(cells.length === 3, 'cellsInRect returns one cell per piece');
assert(cells[0].row === 0 && cells[0].col === 0, 'first cell top-left');
assert(cells[2].row === 1 && cells[2].col === 0, 'third cell wraps to next row');
const overflow = L.cellsInRect(rect, 6); // more than capacity
assert(overflow.length === 6, 'cellsInRect returns a cell for every piece even past capacity');
assert(overflow.every((c) => c.row >= 0 && c.row < 2 && c.col >= 0 && c.col < 2), 'overflow cells stay inside the rect');

// ── arrangeByFaction: groups pieces into per-faction regions ─────────────────
const factions = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
const pieces = [
  { id: 'p1', faction: 'f1' }, { id: 'p2', faction: 'f1' },
  { id: 'p3', faction: 'f2' },
  { id: 'p4', faction: 'f3' }, { id: 'p5', faction: 'f3' },
];
const pos = L.arrangeByFaction(pieces, factions, 8);
assert(Object.keys(pos).length === 5, 'every piece gets a position');
// f1 pieces land in column band 0 (cols 0-3), f2 in band 1 (3-6), f3 in band 2 (6-8).
assert(pos.p1.col < 3 && pos.p2.col < 3, 'f1 pieces sit in the first column band');
assert(pos.p4.col >= 6 && pos.p5.col >= 6, 'f3 pieces sit in the last column band');
// Distinct regions -> f1 and f3 pieces never share a column band.
assert(pos.p1.col !== pos.p4.col || pos.p1.row !== pos.p4.row, 'different factions occupy different cells');

// Unaligned pieces (unknown faction) get their own trailing region, not dropped.
const withOrphan = L.arrangeByFaction([...pieces, { id: 'p6', faction: 'ghost' }], factions, 8);
assert(withOrphan.p6 && Number.isFinite(withOrphan.p6.row), 'unaligned piece still gets a position');

// Empty / malformed inputs don't throw.
assert(Object.keys(L.arrangeByFaction([], [])).length === 0, 'empty inputs -> empty positions');
assert(Object.keys(L.arrangeByFaction(null, null)).length === 0, 'null inputs -> empty positions (no throw)');

// ── factionStrength: sums resource axes for a faction's pieces ───────────────
const resPieces = [
  { faction: 'f1', resources: { political: 10, military: 20, economic: 30, knowledge: 40 } },
  { faction: 'f1', resources: { political: 5, military: 5, economic: 5, knowledge: 5 } },
  { faction: 'f2', resources: { political: 100, military: 0, economic: 0, knowledge: 0 } },
];
const s1 = L.factionStrength('f1', resPieces);
assert(s1.pieces === 2, 'factionStrength counts pieces');
assert(s1.byAxis.military === 25 && s1.byAxis.knowledge === 45, 'factionStrength sums axes');
assert(s1.total === 120, 'factionStrength total = sum of all axes (100+20)');
const s0 = L.factionStrength('nope', resPieces);
assert(s0.pieces === 0 && s0.total === 0, 'unknown faction -> zero strength');
// Missing resources don't throw.
assert(L.factionStrength('f3', [{ faction: 'f3' }]).total === 0, 'piece without resources -> 0');

// ── powerShares: relative shares summing to ~1 ───────────────────────────────
const shares = L.powerShares([{ id: 'f1' }, { id: 'f2' }], resPieces);
const sum = shares.reduce((s, r) => s + r.share, 0);
assert(Math.abs(sum - 1) < 1e-9, 'power shares sum to 1');
assert(shares.find((r) => r.id === 'f1').share > shares.find((r) => r.id === 'f2').share, 'stronger faction has larger share');
// No pieces -> shares are 0, not NaN.
const zero = L.powerShares([{ id: 'x' }], []);
assert(zero[0].share === 0, 'no strength -> 0 share (not NaN)');

console.log(`\n${failed === 0 ? '✅' : '❌'} board-layout tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
