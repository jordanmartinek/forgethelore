/**
 * LoreForge Planner - World Builder Shape Library
 *
 * The World Builder canvas draws each element as an actual SILHOUETTE of the
 * thing it represents — a skyscraper looks like a skyscraper, a planet like a
 * planet, a mountain like a mountain — rather than a generic card with an emoji.
 *
 * Every shape is a pure function returning an SVG fragment (the inner markup of
 * a `<svg viewBox="0 0 100 100">`), drawn in a normalized 100×100 box so nodes
 * scale cleanly at any size. Shapes are theme/color-aware: they paint with two
 * CSS custom properties the node sets per-instance —
 *   --el-fill   : the element's main color (from node.color)
 *   --el-stroke : a darker/derived outline
 * and a few shared accents (windows, highlights) via fixed rgba so they read on
 * any hue. Nothing here touches the DOM or storage; it's all string-building,
 * which keeps the catalog unit-testable.
 *
 * Shapes are grouped into SUBJECTS (the "canvas subject" the user picks): the
 * cosmos, a solar system, a planet's surface / geography, a city, structures,
 * nature, water, and the anomalous. Each subject offers a wide berth of pieces.
 */

// Shared palette tokens used inside shapes. Kept as fixed values (not theme
// vars) where a shape needs an internal contrast accent regardless of node hue.
const WINDOW = 'rgba(255,255,255,0.55)';
const WINDOW_DIM = 'rgba(255,255,255,0.28)';
const SHADE = 'rgba(0,0,0,0.22)';
const SHADE_DEEP = 'rgba(0,0,0,0.38)';
const HILITE = 'rgba(255,255,255,0.35)';

const F = 'var(--el-fill)';
const S = 'var(--el-stroke)';

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function grid(x, y, cols, rows, cw, ch, gap, fill = WINDOW) {
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = x + c * (cw + gap);
      const py = y + r * (ch + gap);
      out += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${cw}" height="${ch}" rx="0.6" fill="${fill}"/>`;
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * COSMIC
 * ═══════════════════════════════════════════════════════════════════════════ */

const cosmic = {
  galaxy: () => `
    <g>
      <ellipse cx="50" cy="50" rx="46" ry="20" fill="${F}" opacity="0.25" transform="rotate(-20 50 50)"/>
      <path d="M50 50 C30 30 18 42 22 56 C26 70 44 66 50 50 Z" fill="${F}" transform="rotate(-20 50 50)"/>
      <path d="M50 50 C70 70 82 58 78 44 C74 30 56 34 50 50 Z" fill="${F}" transform="rotate(-20 50 50)"/>
      <circle cx="50" cy="50" r="8" fill="${HILITE}"/>
      <circle cx="50" cy="50" r="4" fill="#fff"/>
    </g>`,
  nebula: () => `
    <g>
      <path d="M20 55 C18 38 34 26 50 30 C64 22 84 32 82 50 C90 60 80 78 62 74 C50 84 28 78 28 64 C16 64 14 58 20 55 Z" fill="${F}" opacity="0.85"/>
      <path d="M34 50 C34 40 46 36 54 42 C64 40 70 50 64 58 C66 66 54 70 48 64 C40 68 32 60 34 50 Z" fill="${HILITE}" opacity="0.6"/>
      <circle cx="40" cy="46" r="1.6" fill="#fff"/><circle cx="62" cy="40" r="1.2" fill="#fff"/>
      <circle cx="56" cy="62" r="1.4" fill="#fff"/><circle cx="30" cy="60" r="1" fill="#fff"/>
    </g>`,
  star_cluster: () => `
    <g fill="${F}">
      ${star(50, 48, 7)}${star(30, 32, 4)}${star(70, 34, 5)}${star(28, 64, 4)}${star(72, 66, 4)}${star(50, 74, 3)}
      <circle cx="42" cy="42" r="1.4" fill="#fff"/><circle cx="60" cy="58" r="1.4" fill="#fff"/>
    </g>`,
  black_hole: () => `
    <g>
      <ellipse cx="50" cy="50" rx="44" ry="12" fill="none" stroke="${F}" stroke-width="4" opacity="0.6"/>
      <ellipse cx="50" cy="50" rx="30" ry="8" fill="none" stroke="${HILITE}" stroke-width="3"/>
      <circle cx="50" cy="50" r="16" fill="#000"/>
      <circle cx="50" cy="50" r="16" fill="none" stroke="${F}" stroke-width="2"/>
    </g>`,
  comet: () => `
    <g>
      <path d="M62 38 L18 78 L30 60 L14 66 L34 46 L22 46 Z" fill="${F}" opacity="0.55"/>
      <circle cx="66" cy="34" r="12" fill="${F}"/>
      <circle cx="62" cy="30" r="5" fill="${HILITE}"/>
    </g>`,
};

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SOLAR SYSTEM / STELLAR
 * ═══════════════════════════════════════════════════════════════════════════ */

const stellar = {
  sun: () => `
    <g>
      <circle cx="50" cy="50" r="26" fill="${F}"/>
      <circle cx="50" cy="50" r="26" fill="none" stroke="${HILITE}" stroke-width="2"/>
      <g stroke="${F}" stroke-width="3" stroke-linecap="round">
        ${Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI / 6) * i;
          const x1 = 50 + 30 * Math.cos(a), y1 = 50 + 30 * Math.sin(a);
          const x2 = 50 + 42 * Math.cos(a), y2 = 50 + 42 * Math.sin(a);
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        }).join('')}
      </g>
      <circle cx="42" cy="42" r="7" fill="${HILITE}" opacity="0.7"/>
    </g>`,
  binary_star: () => `
    <g>
      <circle cx="38" cy="46" r="18" fill="${F}"/>
      <circle cx="32" cy="40" r="5" fill="${HILITE}"/>
      <circle cx="68" cy="60" r="12" fill="${HILITE}"/>
      <circle cx="64" cy="56" r="3" fill="#fff"/>
    </g>`,
  planet: () => `
    <g>
      <circle cx="50" cy="50" r="30" fill="${F}"/>
      <path d="M28 40 C40 38 52 44 66 40 C74 38 78 44 76 50 C60 52 44 46 30 52 C24 50 24 42 28 40 Z" fill="${SHADE}"/>
      <path d="M34 62 C46 60 58 66 70 60" stroke="${SHADE}" stroke-width="4" fill="none" opacity="0.6"/>
      <circle cx="40" cy="40" r="8" fill="${HILITE}" opacity="0.5"/>
      <path d="M50 20 A30 30 0 0 1 50 80" fill="${SHADE}" opacity="0.25"/>
    </g>`,
  ringed_planet: () => `
    <g>
      <ellipse cx="50" cy="52" rx="46" ry="14" fill="none" stroke="${F}" stroke-width="5" opacity="0.55" transform="rotate(-18 50 52)"/>
      <circle cx="50" cy="48" r="24" fill="${F}"/>
      <circle cx="42" cy="40" r="7" fill="${HILITE}" opacity="0.55"/>
      <path d="M50 24 A24 24 0 0 1 50 72" fill="${SHADE}" opacity="0.25"/>
      <ellipse cx="50" cy="52" rx="46" ry="14" fill="none" stroke="${HILITE}" stroke-width="1.5" opacity="0.5" transform="rotate(-18 50 52)"/>
    </g>`,
  gas_giant: (uid = '') => `
    <g>
      <circle cx="50" cy="50" r="34" fill="${F}"/>
      <clipPath id="gg${uid}"><circle cx="50" cy="50" r="34"/></clipPath>
      <g clip-path="url(#gg${uid})">
        <rect x="16" y="30" width="68" height="6" fill="${SHADE}" opacity="0.5"/>
        <rect x="16" y="44" width="68" height="4" fill="${HILITE}" opacity="0.4"/>
        <rect x="16" y="54" width="68" height="7" fill="${SHADE}" opacity="0.45"/>
        <rect x="16" y="66" width="68" height="4" fill="${SHADE}" opacity="0.3"/>
        <ellipse cx="60" cy="58" rx="9" ry="5" fill="${SHADE_DEEP}"/>
      </g>
    </g>`,
  moon: () => `
    <g>
      <circle cx="50" cy="50" r="28" fill="${F}"/>
      <circle cx="40" cy="42" r="6" fill="${SHADE}"/>
      <circle cx="60" cy="56" r="4" fill="${SHADE}"/>
      <circle cx="56" cy="38" r="3" fill="${SHADE}"/>
      <circle cx="44" cy="60" r="3.5" fill="${SHADE}"/>
      <circle cx="42" cy="40" r="7" fill="${HILITE}" opacity="0.4"/>
    </g>`,
  asteroid: () => `
    <path d="M30 40 L44 26 L64 30 L78 46 L72 66 L52 76 L32 70 L22 52 Z"
      fill="${F}" stroke="${S}" stroke-width="1.5"/>
    <circle cx="46" cy="46" r="4" fill="${SHADE}"/><circle cx="60" cy="56" r="3" fill="${SHADE}"/>`,
  asteroid_belt: () => `
    <g>
      <circle cx="50" cy="50" r="12" fill="${F}"/>
      <g fill="${F}">
        ${Array.from({ length: 14 }, (_, i) => {
          const a = (Math.PI * 2 / 14) * i;
          const x = 50 + 38 * Math.cos(a), y = 50 + 30 * Math.sin(a);
          const r = 2 + (i % 3);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`;
        }).join('')}
      </g>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * SPACE INFRASTRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════ */

const space = {
  space_station: () => `
    <g>
      <circle cx="50" cy="50" r="10" fill="${F}" stroke="${S}" stroke-width="1.5"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke="${F}" stroke-width="6"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke="${HILITE}" stroke-width="1.5"/>
      <line x1="50" y1="20" x2="50" y2="40" stroke="${F}" stroke-width="3"/>
      <line x1="50" y1="60" x2="50" y2="80" stroke="${F}" stroke-width="3"/>
      <line x1="20" y1="50" x2="40" y2="50" stroke="${F}" stroke-width="3"/>
      <line x1="60" y1="50" x2="80" y2="50" stroke="${F}" stroke-width="3"/>
    </g>`,
  spaceship: () => `
    <g>
      <path d="M50 12 C60 26 64 46 62 66 L38 66 C36 46 40 26 50 12 Z" fill="${F}" stroke="${S}" stroke-width="1.5"/>
      <path d="M38 58 L24 76 L38 70 Z" fill="${S}"/>
      <path d="M62 58 L76 76 L62 70 Z" fill="${S}"/>
      <circle cx="50" cy="36" r="6" fill="${WINDOW}"/>
      <path d="M44 70 L50 84 L56 70 Z" fill="#ff8a3d"/>
    </g>`,
  fleet: () => `
    <g fill="${F}" stroke="${S}" stroke-width="1">
      <path d="M50 16 C56 26 58 40 57 52 L43 52 C42 40 44 26 50 16 Z"/>
      <path d="M28 40 C33 48 34 58 33 68 L23 68 C22 58 23 48 28 40 Z"/>
      <path d="M72 40 C77 48 78 58 77 68 L67 68 C66 58 67 48 72 40 Z"/>
      <circle cx="50" cy="30" r="3" fill="${WINDOW}"/><circle cx="28" cy="50" r="2" fill="${WINDOW}"/><circle cx="72" cy="50" r="2" fill="${WINDOW}"/>
    </g>`,
  satellite: () => `
    <g>
      <rect x="42" y="40" width="16" height="20" rx="2" fill="${F}" stroke="${S}" stroke-width="1.5"/>
      <rect x="16" y="42" width="22" height="16" fill="${F}"/>
      <rect x="62" y="42" width="22" height="16" fill="${F}"/>
      ${grid(17, 43, 3, 3, 5, 3.5, 1, WINDOW_DIM)}${grid(63, 43, 3, 3, 5, 3.5, 1, WINDOW_DIM)}
      <line x1="50" y1="40" x2="50" y2="28" stroke="${F}" stroke-width="2"/>
      <circle cx="50" cy="26" r="4" fill="none" stroke="${F}" stroke-width="2"/>
    </g>`,
  megastructure: () => `
    <g>
      <ellipse cx="50" cy="50" rx="44" ry="16" fill="none" stroke="${F}" stroke-width="8"/>
      <ellipse cx="50" cy="50" rx="44" ry="16" fill="none" stroke="${HILITE}" stroke-width="2"/>
      ${Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI * 2 / 10) * i;
        const x = 50 + 44 * Math.cos(a), y = 50 + 16 * Math.sin(a);
        return `<rect x="${(x - 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="4" height="4" fill="${WINDOW}"/>`;
      }).join('')}
      <circle cx="50" cy="50" r="5" fill="${F}"/>
    </g>`,
  portal: () => `
    <g>
      <ellipse cx="50" cy="50" rx="26" ry="34" fill="none" stroke="${F}" stroke-width="6"/>
      <ellipse cx="50" cy="50" rx="20" ry="28" fill="${F}" opacity="0.35"/>
      <ellipse cx="50" cy="50" rx="12" ry="18" fill="${HILITE}" opacity="0.6"/>
      <ellipse cx="50" cy="50" rx="26" ry="34" fill="none" stroke="${HILITE}" stroke-width="1.5"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * GEOGRAPHY (continents, regions, biomes seen from above)
 * ═══════════════════════════════════════════════════════════════════════════ */

const geography = {
  continent: () => `
    <path d="M24 40 C28 28 44 26 52 32 C64 24 78 32 76 44 C86 50 80 66 68 66 C64 78 46 80 40 70 C26 72 18 60 24 52 C16 48 18 42 24 40 Z"
      fill="${F}" stroke="${S}" stroke-width="1.5"/>
    <path d="M40 44 C48 42 56 48 54 54 C58 60 48 64 44 58 C38 60 36 48 40 44 Z" fill="${SHADE}" opacity="0.4"/>`,
  island: () => `
    <g>
      <ellipse cx="50" cy="62" rx="34" ry="10" fill="${HILITE}" opacity="0.3"/>
      <path d="M30 58 C32 46 44 40 52 44 C62 38 72 46 70 56 C74 60 66 66 56 64 C50 68 36 66 34 60 Z"
        fill="${F}" stroke="${S}" stroke-width="1.5"/>
      <path d="M48 46 L52 40 L56 46 Z" fill="${SHADE}"/>
    </g>`,
  country: () => `
    <path d="M26 30 L44 26 L58 32 L74 30 L78 48 L70 60 L74 74 L54 76 L38 70 L24 72 L28 52 Z"
      fill="${F}" stroke="${S}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="52" cy="50" r="3" fill="${WINDOW}"/>`,
  region: () => `
    <path d="M22 44 C22 32 38 28 50 32 C64 28 80 36 76 50 C80 64 62 72 50 68 C36 74 20 62 22 50 Z"
      fill="${F}" opacity="0.55" stroke="${S}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
  desert: () => `
    <g>
      <rect x="14" y="30" width="72" height="46" rx="4" fill="${F}"/>
      <path d="M14 60 C30 52 40 62 54 56 C66 52 78 60 86 56 L86 76 L14 76 Z" fill="${SHADE}" opacity="0.35"/>
      <circle cx="66" cy="42" r="8" fill="${HILITE}" opacity="0.6"/>
    </g>`,
  swamp: () => `
    <g>
      <rect x="14" y="34" width="72" height="42" rx="4" fill="${F}"/>
      <path d="M20 52 h14 M40 60 h16 M60 50 h16 M28 66 h20 M56 66 h18" stroke="${SHADE}" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
      <path d="M34 50 l0 -10 M35 40 l-4 -4 M35 40 l4 -4" stroke="${S}" stroke-width="1.5" fill="none"/>
    </g>`,
  tundra: () => `
    <g>
      <rect x="14" y="34" width="72" height="42" rx="4" fill="${F}"/>
      <path d="M14 62 L30 50 L44 62 L58 48 L72 62 L86 52 L86 76 L14 76 Z" fill="${HILITE}" opacity="0.5"/>
      <circle cx="30" cy="46" r="2" fill="${WINDOW}"/><circle cx="62" cy="44" r="2" fill="${WINDOW}"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * NATURE (terrain features, standing tall)
 * ═══════════════════════════════════════════════════════════════════════════ */

const nature = {
  mountain: () => `
    <g>
      <path d="M8 82 L38 30 L54 56 L66 40 L92 82 Z" fill="${F}" stroke="${S}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M38 30 L30 42 L38 46 L46 40 Z" fill="#fff" opacity="0.85"/>
      <path d="M66 40 L61 48 L66 51 L71 46 Z" fill="#fff" opacity="0.8"/>
      <path d="M38 30 L54 56 L46 60 Z" fill="${SHADE}" opacity="0.3"/>
    </g>`,
  volcano: () => `
    <g>
      <path d="M14 82 L38 40 L62 40 L86 82 Z" fill="${F}" stroke="${S}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M38 40 L44 46 L56 46 L62 40 Z" fill="${SHADE_DEEP}"/>
      <path d="M42 44 C40 30 46 22 50 14 C54 22 60 30 58 44 Z" fill="#ff5722"/>
      <path d="M46 44 C45 34 48 28 50 22 C52 28 55 34 54 44 Z" fill="#ffb300"/>
      <circle cx="42" cy="20" r="2" fill="#ff8a3d"/><circle cx="60" cy="24" r="2" fill="#ff8a3d"/>
    </g>`,
  hill: () => `
    <path d="M10 78 C24 52 40 50 50 58 C60 50 78 52 90 78 Z" fill="${F}" stroke="${S}" stroke-width="1.5"/>
    <path d="M34 62 C40 58 46 60 48 64" stroke="${SHADE}" stroke-width="2" fill="none" opacity="0.4"/>`,
  tree: () => `
    <g>
      <rect x="46" y="60" width="8" height="26" rx="2" fill="${S}"/>
      <circle cx="50" cy="42" r="20" fill="${F}"/>
      <circle cx="38" cy="50" r="13" fill="${F}"/>
      <circle cx="62" cy="50" r="13" fill="${F}"/>
      <circle cx="44" cy="38" r="6" fill="${HILITE}" opacity="0.5"/>
    </g>`,
  pine_tree: () => `
    <g>
      <rect x="47" y="72" width="6" height="14" rx="1" fill="${S}"/>
      <path d="M50 12 L66 40 L56 40 L70 60 L58 60 L72 76 L28 76 L42 60 L30 60 L44 40 L34 40 Z"
        fill="${F}" stroke="${S}" stroke-width="1"/>
    </g>`,
  forest: () => `
    <g fill="${F}" stroke="${S}" stroke-width="1">
      <path d="M28 30 L40 54 L16 54 Z"/><rect x="26" y="52" width="4" height="10" fill="${S}"/>
      <path d="M62 24 L76 52 L48 52 Z"/><rect x="60" y="50" width="4" height="12" fill="${S}"/>
      <path d="M46 42 L58 66 L34 66 Z"/><rect x="44" y="64" width="4" height="12" fill="${S}"/>
      <path d="M74 44 L86 66 L62 66 Z"/><rect x="72" y="64" width="4" height="10" fill="${S}"/>
    </g>`,
  cave: () => `
    <g>
      <rect x="14" y="30" width="72" height="52" rx="4" fill="${F}"/>
      <path d="M30 82 C30 58 42 48 50 48 C58 48 70 58 70 82 Z" fill="#000" opacity="0.75"/>
      <path d="M40 40 l3 8 l-6 0 Z M58 44 l3 7 l-6 0 Z" fill="${SHADE}"/>
    </g>`,
  canyon: () => `
    <g>
      <rect x="14" y="30" width="72" height="52" rx="4" fill="${F}"/>
      <path d="M14 30 h20 v6 h-8 v6 h10 v6 h-6 v6 h8 v6 h-10 v10 h-14 Z" fill="${SHADE}" opacity="0.35"/>
      <path d="M86 30 h-20 v6 h8 v6 h-10 v6 h6 v6 h-8 v6 h10 v10 h14 Z" fill="${SHADE}" opacity="0.35"/>
      <path d="M40 30 C34 44 46 52 40 66 C36 74 44 78 44 82 L56 82 C56 78 64 74 60 66 C54 52 66 44 60 30 Z" fill="${SHADE_DEEP}"/>
      <path d="M46 40 q4 8 0 16 q-3 6 2 12" stroke="#4fc3f7" stroke-width="2.5" fill="none" opacity="0.7"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * WATER
 * ═══════════════════════════════════════════════════════════════════════════ */

const water = {
  ocean: () => `
    <g>
      <rect x="12" y="30" width="76" height="46" rx="6" fill="${F}"/>
      <path d="M16 44 q8 -6 16 0 t16 0 t16 0 t16 0" stroke="${HILITE}" stroke-width="2" fill="none" opacity="0.6"/>
      <path d="M16 56 q8 -6 16 0 t16 0 t16 0 t16 0" stroke="${HILITE}" stroke-width="2" fill="none" opacity="0.45"/>
      <path d="M16 68 q8 -6 16 0 t16 0 t16 0 t16 0" stroke="${HILITE}" stroke-width="2" fill="none" opacity="0.3"/>
    </g>`,
  lake: () => `
    <path d="M26 44 C30 34 46 32 56 38 C70 34 78 46 72 56 C74 66 58 72 48 68 C34 70 22 58 26 48 Z"
      fill="${F}" stroke="${S}" stroke-width="1.5"/>
    <path d="M38 50 q6 -4 12 0" stroke="${HILITE}" stroke-width="1.5" fill="none" opacity="0.6"/>`,
  river: () => `
    <path d="M22 14 C36 30 20 40 34 54 C48 68 30 78 44 90"
      fill="none" stroke="${F}" stroke-width="12" stroke-linecap="round"/>
    <path d="M22 14 C36 30 20 40 34 54 C48 68 30 78 44 90"
      fill="none" stroke="${HILITE}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`,
  waterfall: () => `
    <g>
      <rect x="22" y="20" width="56" height="12" rx="3" fill="${F}"/>
      <g stroke="${F}" stroke-width="5" stroke-linecap="round">
        <line x1="34" y1="32" x2="34" y2="72"/><line x1="46" y1="32" x2="46" y2="76"/>
        <line x1="58" y1="32" x2="58" y2="74"/><line x1="66" y1="32" x2="66" y2="70"/>
      </g>
      <ellipse cx="50" cy="80" rx="30" ry="6" fill="${F}"/>
      <ellipse cx="50" cy="80" rx="30" ry="6" fill="${HILITE}" opacity="0.4"/>
    </g>`,
  bay: () => `
    <g>
      <rect x="12" y="28" width="76" height="50" rx="6" fill="${F}"/>
      <path d="M16 40 q8 -5 16 0" stroke="${HILITE}" stroke-width="1.5" fill="none" opacity="0.55"/>
      <path d="M16 52 q8 -5 16 0" stroke="${HILITE}" stroke-width="1.5" fill="none" opacity="0.4"/>
      <path d="M88 28 L88 78 L34 78 C34 54 56 42 88 44 Z" fill="#6b7d4a" stroke="${S}" stroke-width="1"/>
      <path d="M52 78 C52 62 66 54 88 55 L88 78 Z" fill="#7d8f58" opacity="0.6"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * CITY & SETTLEMENT (from above / skyline)
 * ═══════════════════════════════════════════════════════════════════════════ */

const settlement = {
  city: () => `
    <g>
      <rect x="16" y="52" width="14" height="30" fill="${F}" stroke="${S}" stroke-width="1"/>
      <rect x="32" y="38" width="12" height="44" fill="${F}" stroke="${S}" stroke-width="1"/>
      <rect x="46" y="24" width="12" height="58" fill="${F}" stroke="${S}" stroke-width="1"/>
      <rect x="60" y="40" width="12" height="42" fill="${F}" stroke="${S}" stroke-width="1"/>
      <rect x="74" y="56" width="12" height="26" fill="${F}" stroke="${S}" stroke-width="1"/>
      ${grid(18, 56, 3, 6, 2.5, 2.5, 1.5)}${grid(48, 28, 3, 8, 2.5, 2.5, 1.6)}${grid(62, 44, 3, 5, 2.5, 2.5, 1.5)}
    </g>`,
  metropolis: () => `
    <g>
      <rect x="10" y="58" width="10" height="24" fill="${F}"/><rect x="22" y="46" width="10" height="36" fill="${F}"/>
      <rect x="34" y="30" width="10" height="52" fill="${F}"/><rect x="46" y="16" width="12" height="66" fill="${F}"/>
      <polygon points="52,16 52,10 58,16" fill="${F}"/>
      <rect x="60" y="34" width="10" height="48" fill="${F}"/><rect x="72" y="48" width="10" height="34" fill="${F}"/>
      <rect x="84" y="60" width="8" height="22" fill="${F}"/>
      ${grid(48, 20, 4, 9, 2, 2.5, 1)}${grid(36, 34, 3, 6, 2, 2.5, 1.4)}${grid(62, 38, 3, 5, 2, 2.5, 1.4)}
    </g>`,
  town: () => `
    <g stroke="${S}" stroke-width="1">
      <rect x="22" y="54" width="18" height="24" fill="${F}"/><polygon points="22,54 31,44 40,54" fill="${F}"/>
      <rect x="44" y="48" width="16" height="30" fill="${F}"/><polygon points="44,48 52,38 60,48" fill="${F}"/>
      <rect x="64" y="56" width="16" height="22" fill="${F}"/><polygon points="64,56 72,47 80,56" fill="${F}"/>
      <rect x="28" y="62" width="5" height="6" fill="${WINDOW}"/><rect x="49" y="56" width="5" height="6" fill="${WINDOW}"/>
    </g>`,
  village: () => `
    <g stroke="${S}" stroke-width="1">
      <rect x="26" y="56" width="16" height="20" fill="${F}"/><polygon points="24,56 34,46 44,56" fill="${S}"/>
      <rect x="54" y="60" width="14" height="16" fill="${F}"/><polygon points="52,60 61,52 70,60" fill="${S}"/>
      <rect x="31" y="62" width="5" height="6" fill="${WINDOW}"/><rect x="58" y="64" width="4" height="5" fill="${WINDOW}"/>
    </g>`,
  district: () => `
    <g>
      <rect x="18" y="24" width="64" height="52" rx="3" fill="${F}" opacity="0.35" stroke="${S}" stroke-width="1.5" stroke-dasharray="4 3"/>
      <rect x="26" y="34" width="14" height="14" fill="${F}"/><rect x="46" y="30" width="12" height="18" fill="${F}"/>
      <rect x="62" y="36" width="12" height="12" fill="${F}"/><rect x="30" y="54" width="16" height="14" fill="${F}"/>
      <rect x="52" y="54" width="20" height="14" fill="${F}"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURES (individual buildings)
 * ═══════════════════════════════════════════════════════════════════════════ */

const structures = {
  skyscraper: () => `
    <g>
      <rect x="34" y="14" width="32" height="70" fill="${F}" stroke="${S}" stroke-width="1"/>
      <rect x="46" y="8" width="8" height="8" fill="${F}"/>
      <line x1="50" y1="8" x2="50" y2="2" stroke="${S}" stroke-width="2"/>
      ${grid(38, 20, 4, 12, 4, 3.5, 2)}
      <rect x="34" y="14" width="6" height="70" fill="${HILITE}" opacity="0.18"/>
    </g>`,
  tower: () => `
    <g>
      <rect x="40" y="26" width="20" height="58" fill="${F}" stroke="${S}" stroke-width="1"/>
      <polygon points="40,26 50,10 60,26" fill="${S}"/>
      <rect x="46" y="34" width="8" height="10" rx="4" fill="${WINDOW}"/>
      <rect x="46" y="50" width="8" height="10" rx="4" fill="${WINDOW}"/>
      <rect x="46" y="66" width="8" height="12" fill="${SHADE_DEEP}"/>
    </g>`,
  castle: () => `
    <g stroke="${S}" stroke-width="1">
      <rect x="20" y="44" width="60" height="40" fill="${F}"/>
      <rect x="16" y="34" width="14" height="50" fill="${F}"/>
      <rect x="70" y="34" width="14" height="50" fill="${F}"/>
      <path d="M16 34 h14 v-6 h-4 v3 h-3 v-3 h-3 v3 h-4 Z" fill="${F}"/>
      <path d="M70 34 h14 v-6 h-4 v3 h-3 v-3 h-3 v3 h-4 Z" fill="${F}"/>
      <path d="M20 44 h60 v-5 h-6 v3 h-6 v-3 h-6 v3 h-6 v-3 h-6 v3 h-6 v-3 h-6 v3 h-6 Z" fill="${F}"/>
      <path d="M44 84 v-18 a6 6 0 0 1 12 0 v18 Z" fill="${SHADE_DEEP}"/>
      <rect x="24" y="52" width="6" height="8" fill="${WINDOW}"/><rect x="70" y="52" width="6" height="8" fill="${WINDOW}"/>
    </g>`,
  fortress: () => `
    <g stroke="${S}" stroke-width="1">
      <polygon points="30,50 50,38 70,50 70,84 30,84" fill="${F}"/>
      <rect x="22" y="54" width="12" height="30" fill="${F}"/><rect x="66" y="54" width="12" height="30" fill="${F}"/>
      <path d="M22 54 h12 v-5 h-3 v3 h-3 v-3 h-3 Z" fill="${F}"/>
      <path d="M66 54 h12 v-5 h-3 v3 h-3 v-3 h-3 Z" fill="${F}"/>
      <path d="M44 84 v-14 a6 6 0 0 1 12 0 v14 Z" fill="${SHADE_DEEP}"/>
    </g>`,
  temple: () => `
    <g stroke="${S}" stroke-width="1">
      <polygon points="50,14 82,40 18,40" fill="${F}"/>
      <rect x="22" y="40" width="56" height="6" fill="${F}"/>
      <g fill="${F}">
        <rect x="26" y="46" width="7" height="34"/><rect x="39" y="46" width="7" height="34"/>
        <rect x="54" y="46" width="7" height="34"/><rect x="67" y="46" width="7" height="34"/>
      </g>
      <rect x="20" y="80" width="60" height="6" fill="${F}"/>
    </g>`,
  house: () => `
    <g stroke="${S}" stroke-width="1">
      <rect x="28" y="50" width="44" height="34" fill="${F}"/>
      <polygon points="24,50 50,28 76,50" fill="${S}"/>
      <rect x="44" y="64" width="12" height="20" fill="${SHADE_DEEP}"/>
      <rect x="33" y="58" width="9" height="9" fill="${WINDOW}"/><rect x="58" y="58" width="9" height="9" fill="${WINDOW}"/>
      <rect x="60" y="34" width="6" height="12" fill="${S}"/>
    </g>`,
  hut: () => `
    <g stroke="${S}" stroke-width="1">
      <path d="M28 78 L50 34 L72 78 Z" fill="${F}"/>
      <path d="M50 34 L44 40 M50 34 L56 40" stroke="${S}" stroke-width="1.5"/>
      <path d="M42 78 L50 58 L58 78 Z" fill="${SHADE_DEEP}"/>
    </g>`,
  tent: () => `
    <g stroke="${S}" stroke-width="1">
      <path d="M20 80 L50 22 L80 80 Z" fill="${F}"/>
      <path d="M50 22 L50 80" stroke="${SHADE}" stroke-width="2"/>
      <path d="M44 80 L50 54 L56 80 Z" fill="${SHADE_DEEP}"/>
    </g>`,
  factory: () => `
    <g stroke="${S}" stroke-width="1">
      <rect x="18" y="52" width="52" height="30" fill="${F}"/>
      <path d="M18 52 l12 -8 v8 M30 52 l12 -8 v8 M42 52 l12 -8 v8" fill="${F}"/>
      <rect x="70" y="34" width="10" height="48" fill="${F}"/>
      <rect x="66" y="30" width="18" height="5" fill="${S}"/>
      <circle cx="75" cy="24" r="3" fill="${SHADE}" opacity="0.4"/><circle cx="80" cy="18" r="4" fill="${SHADE}" opacity="0.3"/>
    </g>`,
  bridge: () => `
    <g stroke="${S}" stroke-width="1">
      <rect x="10" y="48" width="80" height="8" fill="${F}"/>
      <path d="M10 48 C30 24 70 24 90 48" fill="none" stroke="${F}" stroke-width="4"/>
      <g stroke="${F}" stroke-width="2">
        <line x1="24" y1="40" x2="24" y2="48"/><line x1="38" y1="33" x2="38" y2="48"/>
        <line x1="50" y1="31" x2="50" y2="48"/><line x1="62" y1="33" x2="62" y2="48"/><line x1="76" y1="40" x2="76" y2="48"/>
      </g>
      <line x1="18" y1="56" x2="18" y2="80" stroke="${F}" stroke-width="3"/><line x1="82" y1="56" x2="82" y2="80" stroke="${F}" stroke-width="3"/>
    </g>`,
  wall: () => `
    <g stroke="${S}" stroke-width="1" fill="${F}">
      <path d="M14 40 h72 v40 h-72 Z"/>
      <path d="M14 40 h8 v-6 h4 v6 h8 v-6 h4 v6 h8 v-6 h4 v6 h8 v-6 h4 v6 h8 v-6 h4 v6 h8 Z"/>
      <line x1="14" y1="56" x2="86" y2="56" stroke="${SHADE}" stroke-width="1.5"/>
      <line x1="32" y1="40" x2="32" y2="80" stroke="${SHADE}" stroke-width="1"/><line x1="50" y1="40" x2="50" y2="80" stroke="${SHADE}" stroke-width="1"/><line x1="68" y1="40" x2="68" y2="80" stroke="${SHADE}" stroke-width="1"/>
    </g>`,
  monument: () => `
    <g stroke="${S}" stroke-width="1" fill="${F}">
      <polygon points="50,12 56,70 44,70"/>
      <rect x="38" y="70" width="24" height="8"/>
      <rect x="32" y="78" width="36" height="6"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * ANOMALOUS / MISC
 * ═══════════════════════════════════════════════════════════════════════════ */

const anomalous = {
  artifact: () => `
    <g>
      <polygon points="50,14 74,34 66,74 34,74 26,34" fill="${F}" stroke="${S}" stroke-width="1.5"/>
      <polygon points="50,26 62,38 58,64 42,64 38,38" fill="${HILITE}" opacity="0.5"/>
      <circle cx="50" cy="48" r="6" fill="#fff" opacity="0.8"/>
    </g>`,
  crystal: () => `
    <g stroke="${S}" stroke-width="1">
      <polygon points="50,10 62,40 56,84 44,84 38,40" fill="${F}"/>
      <polygon points="50,10 56,40 44,40" fill="${HILITE}" opacity="0.6"/>
      <polygon points="62,40 56,84 56,44" fill="${SHADE}" opacity="0.4"/>
    </g>`,
  anomaly: () => `
    <g>
      <path d="M50 16 L58 40 L82 42 L62 56 L70 80 L50 66 L30 80 L38 56 L18 42 L42 40 Z" fill="${F}" opacity="0.7"/>
      <circle cx="50" cy="50" r="10" fill="${HILITE}"/>
      <circle cx="50" cy="50" r="4" fill="#fff"/>
    </g>`,
  void_conduit: () => `
    <g>
      <circle cx="50" cy="50" r="34" fill="none" stroke="${F}" stroke-width="3" opacity="0.4"/>
      <circle cx="50" cy="50" r="24" fill="none" stroke="${F}" stroke-width="3" opacity="0.6"/>
      <circle cx="50" cy="50" r="14" fill="none" stroke="${HILITE}" stroke-width="3"/>
      <circle cx="50" cy="50" r="6" fill="#000"/>
    </g>`,
  ruins: () => `
    <g stroke="${S}" stroke-width="1" fill="${F}">
      <rect x="20" y="50" width="8" height="34"/><rect x="20" y="46" width="8" height="5"/>
      <rect x="36" y="40" width="8" height="44"/><polygon points="36,40 40,34 44,40"/>
      <rect x="54" y="56" width="8" height="28"/>
      <rect x="70" y="44" width="8" height="40"/><rect x="66" y="44" width="16" height="4"/>
      <path d="M44 60 h10" stroke="${F}" stroke-width="3"/>
    </g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * EXTRA HELPERS (for the interior/ship/station/prop libraries below)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** A filled, outlined rectangle — the workhorse for room tiles & panels. */
function box(x, y, w, hh, fill = F, rx = 1.5) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${rx}" fill="${fill}" stroke="${S}" stroke-width="1.2"/>`;
}
/** A small lit indicator dot. */
function led(cx, cy, r = 2.2, fill = 'rgba(120,220,255,0.9)') {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * INTERIOR — ROOMS & FLOOR TILES (top-down)
 * ═══════════════════════════════════════════════════════════════════════════ */

const rooms = {
  room_square: (u) => `<g>${box(20, 20, 60, 60)}<rect x="46" y="76" width="16" height="6" fill="${SHADE_DEEP}"/><clipPath id="rs${u}"><rect x="20" y="20" width="60" height="60"/></clipPath></g>`,
  room_wide: () => `<g>${box(12, 30, 76, 40)}<rect x="42" y="66" width="16" height="6" fill="${SHADE_DEEP}"/></g>`,
  room_tall: () => `<g>${box(30, 12, 40, 76)}<rect x="42" y="82" width="16" height="6" fill="${SHADE_DEEP}"/></g>`,
  room_l: () => `<g><path d="M20 20 h34 v26 h26 v34 h-60 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/></g>`,
  room_t: () => `<g><path d="M20 20 h60 v22 h-20 v38 h-20 v-38 h-20 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/></g>`,
  room_round: () => `<g><circle cx="50" cy="50" r="32" fill="${F}" stroke="${S}" stroke-width="1.2"/><circle cx="50" cy="50" r="22" fill="none" stroke="${SHADE}" stroke-width="1"/></g>`,
  room_oct: () => `<g><polygon points="34,20 66,20 80,34 80,66 66,80 34,80 20,66 20,34" fill="${F}" stroke="${S}" stroke-width="1.2"/></g>`,
  corridor_h: () => `<g>${box(10, 40, 80, 20)}<line x1="10" y1="50" x2="90" y2="50" stroke="${SHADE}" stroke-width="1" stroke-dasharray="4 4"/></g>`,
  corridor_v: () => `<g>${box(40, 10, 20, 80)}<line x1="50" y1="10" x2="50" y2="90" stroke="${SHADE}" stroke-width="1" stroke-dasharray="4 4"/></g>`,
  corridor_cross: () => `<g>${box(40, 10, 20, 80)}${box(10, 40, 80, 20)}</g>`,
  corridor_corner: () => `<g><path d="M40 10 h20 v30 h30 v20 h-50 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/></g>`,
  airlock: (u) => `<g>${box(28, 28, 44, 44, F, 3)}<circle cx="50" cy="50" r="14" fill="${SHADE_DEEP}" stroke="${S}"/><circle cx="50" cy="50" r="14" fill="none" stroke="${WINDOW}" stroke-width="1" stroke-dasharray="3 3"/><clipPath id="al${u}"><rect x="28" y="28" width="44" height="44"/></clipPath></g>`,
  bridge_room: () => `<g><path d="M24 30 q26 -16 52 0 v34 h-52 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/><rect x="40" y="40" width="20" height="10" fill="${WINDOW}"/><rect x="30" y="66" width="40" height="8" fill="${SHADE}"/></g>`,
  medbay: () => `<g>${box(20, 24, 60, 52)}<rect x="30" y="40" width="24" height="12" rx="2" fill="${WINDOW}"/><path d="M64 34 h10 M69 29 v10" stroke="#e33" stroke-width="3"/></g>`,
  armory: () => `<g>${box(22, 24, 56, 52)}<rect x="30" y="34" width="8" height="30" fill="${SHADE_DEEP}"/><rect x="46" y="34" width="8" height="30" fill="${SHADE_DEEP}"/><rect x="62" y="34" width="8" height="30" fill="${SHADE_DEEP}"/></g>`,
  cargo_bay: () => `<g>${box(16, 26, 68, 48)}${grid(24, 34, 3, 2, 16, 14, 4, SHADE)}</g>`,
  engine_room: (u) => `<g>${box(22, 22, 56, 56)}<circle cx="50" cy="50" r="16" fill="none" stroke="${HILITE}" stroke-width="3"/><circle cx="50" cy="50" r="8" fill="${WINDOW}"/><clipPath id="er${u}"><rect x="22" y="22" width="56" height="56"/></clipPath></g>`,
  reactor_room: () => `<g>${box(22, 22, 56, 56)}<polygon points="50,32 64,50 50,68 36,50" fill="${HILITE}"/><circle cx="50" cy="50" r="5" fill="#fff"/></g>`,
  quarters: () => `<g>${box(24, 28, 52, 44)}<rect x="30" y="34" width="18" height="12" fill="${SHADE}"/><rect x="54" y="34" width="16" height="30" fill="${SHADE_DEEP}"/></g>`,
  lab_room: () => `<g>${box(20, 26, 60, 48)}<rect x="28" y="34" width="44" height="8" fill="${WINDOW}"/><circle cx="34" cy="60" r="5" fill="${HILITE}"/><circle cx="50" cy="60" r="5" fill="${HILITE}"/></g>`,
  hangar: () => `<g>${box(12, 30, 76, 44, F, 2)}<polygon points="30,52 50,42 70,52 50,62" fill="${SHADE_DEEP}"/><rect x="12" y="70" width="76" height="4" fill="${S}"/></g>`,
  vault_room: () => `<g>${box(26, 26, 48, 48, F, 2)}<circle cx="50" cy="50" r="16" fill="${SHADE_DEEP}" stroke="${S}"/><circle cx="50" cy="50" r="16" fill="none" stroke="${HILITE}" stroke-width="1"/><line x1="50" y1="40" x2="50" y2="60" stroke="${S}"/><line x1="40" y1="50" x2="60" y2="50" stroke="${S}"/></g>`,
  observatory: () => `<g><path d="M26 74 a24 24 0 0 1 48 0 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/><rect x="46" y="30" width="8" height="22" fill="${SHADE_DEEP}"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * INTERIOR — FURNITURE & FIXTURES
 * ═══════════════════════════════════════════════════════════════════════════ */

const furniture = {
  bed: () => `<g>${box(24, 34, 52, 34, F, 3)}<rect x="28" y="38" width="18" height="26" rx="2" fill="${WINDOW_DIM}"/><rect x="24" y="30" width="52" height="8" rx="3" fill="${SHADE}"/></g>`,
  bunk: () => `<g>${box(24, 26, 52, 20, F, 2)}${box(24, 54, 52, 20, F, 2)}<rect x="28" y="30" width="14" height="12" fill="${WINDOW_DIM}"/><rect x="28" y="58" width="14" height="12" fill="${WINDOW_DIM}"/></g>`,
  table_round: () => `<g><circle cx="50" cy="50" r="26" fill="${F}" stroke="${S}" stroke-width="1.2"/><circle cx="50" cy="50" r="26" fill="none" stroke="${HILITE}" stroke-width="1"/></g>`,
  table_long: () => `<g>${box(18, 40, 64, 20, F, 3)}<rect x="22" y="60" width="6" height="12" fill="${S}"/><rect x="72" y="60" width="6" height="12" fill="${S}"/></g>`,
  desk: () => `<g>${box(22, 40, 56, 22, F, 2)}<rect x="26" y="44" width="18" height="14" fill="${SHADE}"/><rect x="60" y="34" width="14" height="8" fill="${WINDOW}"/></g>`,
  chair: () => `<g>${box(38, 44, 24, 24, F, 2)}<rect x="38" y="30" width="24" height="16" rx="2" fill="${SHADE}"/></g>`,
  sofa: () => `<g>${box(20, 44, 60, 24, F, 4)}<rect x="20" y="36" width="60" height="12" rx="4" fill="${SHADE}"/><rect x="18" y="44" width="8" height="24" rx="3" fill="${SHADE_DEEP}"/><rect x="74" y="44" width="8" height="24" rx="3" fill="${SHADE_DEEP}"/></g>`,
  console: () => `<g>${box(24, 46, 52, 20, F, 2)}<rect x="30" y="34" width="40" height="12" rx="1" fill="${WINDOW}"/>${led(34, 56)}${led(42, 56)}${led(50, 56)}</g>`,
  terminal: () => `<g>${box(34, 30, 32, 26, F, 2)}<rect x="38" y="34" width="24" height="16" fill="${WINDOW}"/><rect x="40" y="56" width="20" height="16" fill="${SHADE}"/></g>`,
  workbench: () => `<g>${box(20, 44, 60, 18, F, 1)}<rect x="26" y="36" width="10" height="8" fill="${SHADE}"/><rect x="42" y="34" width="8" height="10" fill="${SHADE_DEEP}"/>${led(66, 40)}</g>`,
  shelf: () => `<g>${box(28, 24, 44, 56, F, 1)}<line x1="28" y1="42" x2="72" y2="42" stroke="${S}"/><line x1="28" y1="60" x2="72" y2="60" stroke="${S}"/></g>`,
  locker: () => `<g>${box(34, 24, 32, 56, F, 1)}<line x1="50" y1="24" x2="50" y2="80" stroke="${S}"/>${led(44, 34, 1.6)}${led(56, 34, 1.6)}</g>`,
  crate: () => `<g>${box(30, 34, 40, 40, F, 1)}<line x1="30" y1="54" x2="70" y2="54" stroke="${SHADE}" stroke-width="2"/><line x1="50" y1="34" x2="50" y2="74" stroke="${SHADE}" stroke-width="2"/></g>`,
  barrel: () => `<g><ellipse cx="50" cy="30" rx="16" ry="6" fill="${SHADE}" stroke="${S}"/><rect x="34" y="30" width="32" height="42" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="72" rx="16" ry="6" fill="${SHADE_DEEP}" stroke="${S}"/></g>`,
  container: () => `<g>${box(18, 36, 64, 30, F, 1)}${grid(24, 40, 5, 1, 9, 22, 3, SHADE)}</g>`,
  planter: () => `<g><path d="M36 60 h28 l-4 16 h-20 Z" fill="${F}" stroke="${S}"/><path d="M50 60 q-10 -22 -4 -30 M50 60 q10 -20 6 -28 M50 60 v-26" stroke="#3f9d5a" stroke-width="2.4" fill="none"/></g>`,
  lamp: () => `<g><rect x="47" y="46" width="6" height="30" fill="${S}"/><path d="M36 46 h28 l-6 -16 h-16 Z" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="80" rx="12" ry="4" fill="${SHADE_DEEP}"/></g>`,
  screen: () => `<g>${box(26, 26, 48, 34, F, 2)}<rect x="30" y="30" width="40" height="26" fill="${WINDOW}"/><rect x="44" y="60" width="12" height="10" fill="${S}"/><rect x="36" y="70" width="28" height="4" fill="${SHADE}"/></g>`,
  server_rack: () => `<g>${box(34, 22, 32, 58, F, 1)}${grid(38, 27, 1, 8, 24, 5, 1.6, SHADE_DEEP)}${led(60, 30, 1.4, 'rgba(120,255,160,0.9)')}${led(60, 38, 1.4, 'rgba(120,255,160,0.9)')}</g>`,
  toilet: () => `<g><rect x="42" y="30" width="16" height="14" rx="2" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="58" rx="16" ry="18" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="56" rx="9" ry="10" fill="${WINDOW_DIM}"/></g>`,
  sink: () => `<g><rect x="30" y="40" width="40" height="24" rx="4" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="52" rx="12" ry="7" fill="${SHADE_DEEP}"/><rect x="48" y="30" width="4" height="12" fill="${S}"/></g>`,
  stove: () => `<g>${box(30, 34, 40, 40, F, 2)}<circle cx="42" cy="46" r="5" fill="${SHADE_DEEP}"/><circle cx="58" cy="46" r="5" fill="${SHADE_DEEP}"/><circle cx="42" cy="62" r="5" fill="${SHADE_DEEP}"/><circle cx="58" cy="62" r="5" fill="${SHADE_DEEP}"/></g>`,
  fridge: () => `<g>${box(36, 22, 28, 58, F, 2)}<line x1="36" y1="48" x2="64" y2="48" stroke="${S}"/><rect x="58" y="30" width="3" height="10" fill="${SHADE_DEEP}"/><rect x="58" y="54" width="3" height="10" fill="${SHADE_DEEP}"/></g>`,
  statue: () => `<g><rect x="40" y="72" width="20" height="8" fill="${SHADE_DEEP}"/><path d="M50 24 q-8 6 -6 20 q-8 6 -6 28 h24 q2 -22 -6 -28 q2 -14 -6 -20 Z" fill="${F}" stroke="${S}"/></g>`,
  fountain: () => `<g><circle cx="50" cy="58" r="24" fill="${WINDOW_DIM}" stroke="${S}"/><circle cx="50" cy="58" r="24" fill="none" stroke="${S}"/><rect x="47" y="36" width="6" height="22" fill="${S}"/><circle cx="50" cy="34" r="6" fill="${HILITE}"/></g>`,
  pillar: () => `<g><rect x="42" y="26" width="16" height="52" fill="${F}" stroke="${S}"/><rect x="38" y="22" width="24" height="6" fill="${SHADE}"/><rect x="38" y="78" width="24" height="6" fill="${SHADE_DEEP}"/></g>`,
  hydroponics: () => `<g>${box(20, 40, 60, 26, F, 2)}<path d="M28 40 v-12 M38 40 v-16 M48 40 v-12 M58 40 v-16 M68 40 v-12" stroke="#3f9d5a" stroke-width="3"/>${led(74, 52, 2, 'rgba(120,255,160,0.9)')}</g>`,
  cryopod: () => `<g><rect x="36" y="24" width="28" height="56" rx="14" fill="${F}" stroke="${S}"/><rect x="42" y="32" width="16" height="40" rx="8" fill="${WINDOW}"/>${led(50, 76, 2)}</g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * BUILDING PARTS — structural pieces (walls, doors, stairs)
 * ═══════════════════════════════════════════════════════════════════════════ */

const buildingParts = {
  wall_straight: () => `<g>${box(14, 42, 72, 16, F, 0)}</g>`,
  wall_corner: () => `<g><path d="M42 14 h16 v44 h28 v16 h-44 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/></g>`,
  door_single: () => `<g>${box(38, 24, 24, 52, F, 1)}<path d="M62 76 a52 52 0 0 0 -24 -52" fill="none" stroke="${SHADE}" stroke-width="1.5"/></g>`,
  door_double: () => `<g>${box(28, 30, 44, 12, F, 1)}<line x1="50" y1="30" x2="50" y2="42" stroke="${S}"/><path d="M28 42 v20 M72 42 v20" stroke="${SHADE}" stroke-dasharray="3 3"/></g>`,
  blast_door: () => `<g>${box(26, 24, 48, 52, F, 2)}<path d="M26 40 h48 M26 60 h48" stroke="${S}" stroke-width="2"/><polygon points="38,50 50,42 62,50 50,58" fill="${SHADE_DEEP}"/></g>`,
  window_row: () => `<g>${box(16, 40, 68, 20, F, 1)}${grid(22, 44, 5, 1, 9, 12, 4, WINDOW)}</g>`,
  stairs: () => `<g><g fill="${F}" stroke="${S}" stroke-width="0.8">${grid(26, 30, 1, 6, 48, 7, 1, F)}</g></g>`,
  stairs_spiral: () => `<g><circle cx="50" cy="50" r="28" fill="none" stroke="${S}"/><g stroke="${S}" stroke-width="1">${Array.from({ length: 12 }, (_, i) => { const a = (Math.PI / 6) * i; return `<line x1="50" y1="50" x2="${(50 + 26 * Math.cos(a)).toFixed(1)}" y2="${(50 + 26 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g></g>`,
  ladder: () => `<g stroke="${S}" stroke-width="2"><line x1="40" y1="20" x2="40" y2="80"/><line x1="60" y1="20" x2="60" y2="80"/>${Array.from({ length: 6 }, (_, i) => `<line x1="40" y1="${26 + i * 10}" x2="60" y2="${26 + i * 10}"/>`).join('')}</g>`,
  elevator: () => `<g>${box(30, 24, 40, 56, F, 1)}<line x1="50" y1="24" x2="50" y2="80" stroke="${S}"/><polygon points="42,44 50,36 58,44" fill="${SHADE}"/><polygon points="42,60 50,68 58,60" fill="${SHADE}"/></g>`,
  ramp: () => `<g><path d="M20 74 L80 30 L80 74 Z" fill="${F}" stroke="${S}"/><g stroke="${SHADE}">${Array.from({ length: 5 }, (_, i) => `<line x1="${32 + i * 10}" y1="74" x2="${32 + i * 10}" y2="${66 - i * 8}"/>`).join('')}</g></g>`,
  column: () => `<g><rect x="43" y="22" width="14" height="56" fill="${F}" stroke="${S}"/><rect x="39" y="18" width="22" height="6" fill="${SHADE}"/><rect x="39" y="78" width="22" height="6" fill="${SHADE_DEEP}"/></g>`,
  archway: () => `<g><path d="M26 80 v-30 a24 24 0 0 1 48 0 v30 h-10 v-30 a14 14 0 0 0 -28 0 v30 Z" fill="${F}" stroke="${S}"/></g>`,
  gate: () => `<g>${box(24, 30, 52, 50, F, 1)}<path d="M24 44 h52" stroke="${S}" stroke-width="2"/><g stroke="${SHADE}">${Array.from({ length: 4 }, (_, i) => `<line x1="${34 + i * 12}" y1="44" x2="${34 + i * 12}" y2="80"/>`).join('')}</g></g>`,
  fence: () => `<g stroke="${S}" stroke-width="2"><line x1="16" y1="40" x2="84" y2="40"/><line x1="16" y1="56" x2="84" y2="56"/>${Array.from({ length: 6 }, (_, i) => `<line x1="${20 + i * 12}" y1="32" x2="${20 + i * 12}" y2="64"/>`).join('')}</g>`,
  roof_gable: () => `<g><polygon points="20,60 50,28 80,60" fill="${F}" stroke="${S}"/><rect x="20" y="60" width="60" height="6" fill="${SHADE}"/></g>`,
  chimney: () => `<g>${box(40, 30, 20, 50, F, 1)}<rect x="36" y="24" width="28" height="8" fill="${SHADE}"/><circle cx="50" cy="20" r="3" fill="${SHADE_DEEP}" opacity="0.5"/></g>`,
  balcony: () => `<g>${box(24, 34, 52, 26, F, 1)}<rect x="24" y="60" width="52" height="14" fill="none" stroke="${S}"/>${Array.from({ length: 6 }, (_, i) => `<line x1="${28 + i * 9}" y1="60" x2="${28 + i * 9}" y2="74" stroke="${S}"/>`).join('')}</g>`,
  solar_panel: () => `<g>${box(20, 32, 60, 36, '#1d3a6b', 1)}${grid(24, 36, 4, 3, 12, 9, 2, 'rgba(90,150,220,0.5)')}</g>`,
  antenna_dish: () => `<g><ellipse cx="50" cy="46" rx="30" ry="18" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="46" rx="18" ry="10" fill="${SHADE}"/><line x1="50" y1="46" x2="50" y2="80" stroke="${S}" stroke-width="3"/></g>`,
  turbine: () => `<g><rect x="47" y="46" width="6" height="34" fill="${S}"/><g fill="${F}" stroke="${S}">${Array.from({ length: 3 }, (_, i) => { const a = (Math.PI * 2 / 3) * i - Math.PI / 2; return `<path d="M50 46 L${(50 + 26 * Math.cos(a)).toFixed(1)} ${(46 + 26 * Math.sin(a)).toFixed(1)} L${(50 + 8 * Math.cos(a + 0.4)).toFixed(1)} ${(46 + 8 * Math.sin(a + 0.4)).toFixed(1)} Z"/>`; }).join('')}</g><circle cx="50" cy="46" r="4" fill="${SHADE_DEEP}"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STARSHIP PARTS — hull sections, decks, propulsion
 * ═══════════════════════════════════════════════════════════════════════════ */

const shipParts = {
  hull_fore: () => `<g><path d="M50 16 L70 60 L30 60 Z" fill="${F}" stroke="${S}" stroke-width="1.2"/><polygon points="50,26 58,52 42,52" fill="${SHADE}"/><rect x="44" y="40" width="12" height="6" fill="${WINDOW}"/></g>`,
  hull_mid: () => `<g>${box(28, 26, 44, 48, F, 4)}${grid(34, 32, 2, 3, 12, 8, 6, WINDOW_DIM)}</g>`,
  hull_aft: () => `<g><path d="M30 26 h40 v34 l-12 14 h-16 l-12 -14 Z" fill="${F}" stroke="${S}"/><rect x="40" y="66" width="8" height="10" fill="${HILITE}"/><rect x="52" y="66" width="8" height="10" fill="${HILITE}"/></g>`,
  cockpit: () => `<g><path d="M34 60 q16 -40 32 0 Z" fill="${F}" stroke="${S}"/><path d="M40 56 q10 -22 20 0 Z" fill="${WINDOW}"/></g>`,
  wing_left: () => `<g><path d="M70 34 L20 50 L70 62 Z" fill="${F}" stroke="${S}"/><line x1="60" y1="42" x2="36" y2="50" stroke="${SHADE}"/></g>`,
  wing_right: () => `<g><path d="M30 34 L80 50 L30 62 Z" fill="${F}" stroke="${S}"/><line x1="40" y1="42" x2="64" y2="50" stroke="${SHADE}"/></g>`,
  thruster: () => `<g><rect x="34" y="30" width="32" height="30" rx="3" fill="${F}" stroke="${S}"/><path d="M40 60 h20 l-4 16 h-12 Z" fill="${SHADE_DEEP}"/><ellipse cx="50" cy="76" rx="8" ry="4" fill="${HILITE}"/></g>`,
  engine_pod: () => `<g><rect x="30" y="24" width="40" height="44" rx="10" fill="${F}" stroke="${S}"/><circle cx="50" cy="62" r="10" fill="${SHADE_DEEP}"/><circle cx="50" cy="62" r="5" fill="${HILITE}"/></g>`,
  nacelle: () => `<g><rect x="24" y="38" width="52" height="18" rx="9" fill="${F}" stroke="${S}"/><circle cx="30" cy="47" r="6" fill="${HILITE}"/><rect x="40" y="30" width="6" height="10" fill="${S}"/></g>`,
  reactor_core: () => `<g><circle cx="50" cy="50" r="26" fill="${F}" stroke="${S}"/><circle cx="50" cy="50" r="16" fill="none" stroke="${HILITE}" stroke-width="3"/><circle cx="50" cy="50" r="7" fill="#fff"/><g stroke="${HILITE}">${Array.from({ length: 8 }, (_, i) => { const a = (Math.PI / 4) * i; return `<line x1="${(50 + 16 * Math.cos(a)).toFixed(1)}" y1="${(50 + 16 * Math.sin(a)).toFixed(1)}" x2="${(50 + 26 * Math.cos(a)).toFixed(1)}" y2="${(50 + 26 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g></g>`,
  fuel_tank: () => `<g><rect x="36" y="20" width="28" height="60" rx="14" fill="${F}" stroke="${S}"/><line x1="36" y1="40" x2="64" y2="40" stroke="${SHADE}"/><line x1="36" y1="60" x2="64" y2="60" stroke="${SHADE}"/></g>`,
  cargo_pod: () => `<g>${box(26, 30, 48, 40, F, 3)}<line x1="50" y1="30" x2="50" y2="70" stroke="${S}"/>${grid(30, 34, 2, 2, 18, 14, 4, SHADE)}</g>`,
  landing_gear: () => `<g stroke="${S}" stroke-width="2.4" fill="none"><path d="M50 24 v20 M50 44 L34 74 M50 44 L66 74"/><line x1="28" y1="74" x2="40" y2="74"/><line x1="60" y1="74" x2="72" y2="74"/></g>`,
  weapon_turret: () => `<g><circle cx="50" cy="58" r="16" fill="${F}" stroke="${S}"/><rect x="46" y="20" width="8" height="30" fill="${SHADE_DEEP}" stroke="${S}"/><rect x="42" y="18" width="16" height="6" fill="${S}"/></g>`,
  shield_gen: () => `<g><circle cx="50" cy="50" r="24" fill="none" stroke="${HILITE}" stroke-width="2" opacity="0.6"/><rect x="40" y="40" width="20" height="20" rx="3" fill="${F}" stroke="${S}"/>${led(50, 50, 3, 'rgba(120,220,255,0.9)')}</g>`,
  docking_ring: () => `<g><circle cx="50" cy="50" r="26" fill="none" stroke="${F}" stroke-width="8"/><circle cx="50" cy="50" r="26" fill="none" stroke="${S}"/><circle cx="50" cy="50" r="18" fill="none" stroke="${S}" stroke-dasharray="4 4"/></g>`,
  escape_pod: () => `<g><ellipse cx="50" cy="50" rx="20" ry="26" fill="${F}" stroke="${S}"/><circle cx="50" cy="42" r="9" fill="${WINDOW}"/><rect x="42" y="72" width="16" height="8" fill="${SHADE_DEEP}"/></g>`,
  sensor_array: () => `<g><rect x="46" y="40" width="8" height="40" fill="${S}"/>${Array.from({ length: 3 }, (_, i) => `<line x1="30" y1="${30 + i * 8}" x2="70" y2="${30 + i * 8}" stroke="${F}" stroke-width="2"/>`).join('')}<circle cx="50" cy="26" r="4" fill="${HILITE}"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STATION MODULES — orbital / megastructure segments
 * ═══════════════════════════════════════════════════════════════════════════ */

const stationModules = {
  module_hub: () => `<g><circle cx="50" cy="50" r="22" fill="${F}" stroke="${S}"/><circle cx="50" cy="50" r="12" fill="${SHADE}"/><g stroke="${S}" stroke-width="4">${Array.from({ length: 4 }, (_, i) => { const a = (Math.PI / 2) * i; return `<line x1="${(50 + 22 * Math.cos(a)).toFixed(1)}" y1="${(50 + 22 * Math.sin(a)).toFixed(1)}" x2="${(50 + 32 * Math.cos(a)).toFixed(1)}" y2="${(50 + 32 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g></g>`,
  module_ring: () => `<g><circle cx="50" cy="50" r="32" fill="none" stroke="${F}" stroke-width="10"/><circle cx="50" cy="50" r="32" fill="none" stroke="${S}"/><circle cx="50" cy="50" r="6" fill="${F}" stroke="${S}"/><line x1="50" y1="18" x2="50" y2="44" stroke="${S}" stroke-width="3"/><line x1="50" y1="56" x2="50" y2="82" stroke="${S}" stroke-width="3"/></g>`,
  module_cylinder: () => `<g><rect x="24" y="34" width="52" height="32" rx="16" fill="${F}" stroke="${S}"/>${grid(32, 42, 4, 2, 8, 7, 4, WINDOW_DIM)}</g>`,
  module_solar: () => `<g>${box(42, 30, 16, 40, F, 2)}${box(14, 36, 24, 28, '#1d3a6b', 1)}${box(62, 36, 24, 28, '#1d3a6b', 1)}${grid(16, 40, 3, 3, 6, 6, 1.5, 'rgba(90,150,220,0.5)')}${grid(64, 40, 3, 3, 6, 6, 1.5, 'rgba(90,150,220,0.5)')}</g>`,
  module_dock: () => `<g>${box(30, 30, 40, 40, F, 3)}<rect x="46" y="16" width="8" height="16" fill="${S}"/><circle cx="50" cy="16" r="6" fill="none" stroke="${S}"/>${grid(36, 36, 2, 2, 12, 12, 4, WINDOW_DIM)}</g>`,
  module_habitat: () => `<g><ellipse cx="50" cy="50" rx="30" ry="20" fill="${F}" stroke="${S}"/>${grid(30, 44, 4, 2, 8, 6, 3, WINDOW)}</g>`,
  module_comms: () => `<g><rect x="42" y="46" width="16" height="34" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="34" rx="22" ry="14" fill="${F}" stroke="${S}"/><ellipse cx="50" cy="34" rx="12" ry="7" fill="${SHADE}"/></g>`,
  truss: () => `<g stroke="${S}" stroke-width="2" fill="none"><rect x="18" y="42" width="64" height="16"/><line x1="18" y1="42" x2="34" y2="58"/><line x1="34" y1="42" x2="50" y2="58"/><line x1="50" y1="42" x2="66" y2="58"/><line x1="66" y1="42" x2="82" y2="58"/></g>`,
  cupola: () => `<g><polygon points="50,22 74,44 74,66 50,78 26,66 26,44" fill="${F}" stroke="${S}"/><polygon points="50,32 64,46 64,62 50,70 36,62 36,46" fill="${WINDOW}"/></g>`,
  gravity_ring: () => `<g><circle cx="50" cy="50" r="34" fill="none" stroke="${F}" stroke-width="6"/><circle cx="50" cy="50" r="34" fill="none" stroke="${S}"/><g fill="${WINDOW_DIM}">${Array.from({ length: 12 }, (_, i) => { const a = (Math.PI / 6) * i; return `<circle cx="${(50 + 34 * Math.cos(a)).toFixed(1)}" cy="${(50 + 34 * Math.sin(a)).toFixed(1)}" r="2"/>`; }).join('')}</g><rect x="47" y="16" width="6" height="34" fill="${S}"/></g>`,
  drydock: () => `<g><rect x="18" y="30" width="10" height="44" fill="${F}" stroke="${S}"/><rect x="72" y="30" width="10" height="44" fill="${F}" stroke="${S}"/><g stroke="${S}" stroke-width="2">${Array.from({ length: 4 }, (_, i) => `<line x1="28" y1="${36 + i * 12}" x2="72" y2="${36 + i * 12}"/>`).join('')}</g><ellipse cx="50" cy="52" rx="14" ry="22" fill="${SHADE}"/></g>`,
  refinery: () => `<g><rect x="30" y="40" width="14" height="40" fill="${F}" stroke="${S}"/><rect x="52" y="30" width="14" height="50" fill="${F}" stroke="${S}"/><ellipse cx="37" cy="40" rx="7" ry="3" fill="${SHADE}"/><ellipse cx="59" cy="30" rx="7" ry="3" fill="${SHADE}"/><path d="M30 60 h36" stroke="${S}" stroke-width="2"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * SCI-FI PROPS — devices, tech, points of interest
 * ═══════════════════════════════════════════════════════════════════════════ */

const scifiProps = {
  beacon: () => `<g><polygon points="50,18 56,64 44,64" fill="${F}" stroke="${S}"/><rect x="40" y="64" width="20" height="10" fill="${SHADE_DEEP}"/><circle cx="50" cy="18" r="5" fill="${HILITE}"/><circle cx="50" cy="18" r="10" fill="none" stroke="${HILITE}" opacity="0.4"/></g>`,
  relay: () => `<g><rect x="44" y="46" width="12" height="34" fill="${F}" stroke="${S}"/><path d="M50 46 l-16 -20 M50 46 l16 -20 M50 46 v-24" stroke="${S}" stroke-width="2"/><circle cx="34" cy="26" r="3" fill="${HILITE}"/><circle cx="66" cy="26" r="3" fill="${HILITE}"/><circle cx="50" cy="22" r="3" fill="${HILITE}"/></g>`,
  turret_gun: () => `<g><rect x="34" y="54" width="32" height="20" rx="4" fill="${F}" stroke="${S}"/><rect x="46" y="24" width="8" height="34" fill="${SHADE_DEEP}" stroke="${S}"/><rect x="42" y="22" width="16" height="6" fill="${S}"/></g>`,
  generator: () => `<g>${box(30, 34, 40, 40, F, 3)}<path d="M50 40 l-8 14 h6 l-4 12 l14 -18 h-6 Z" fill="${HILITE}"/></g>`,
  power_node: () => `<g><polygon points="50,24 68,50 50,76 32,50" fill="${F}" stroke="${S}"/><polygon points="50,36 58,50 50,64 42,50" fill="${HILITE}"/></g>`,
  scanner: () => `<g><rect x="36" y="50" width="28" height="26" rx="3" fill="${F}" stroke="${S}"/><path d="M40 50 a10 10 0 0 1 20 0" fill="none" stroke="${HILITE}" stroke-width="2"/><path d="M44 50 a6 6 0 0 1 12 0" fill="none" stroke="${HILITE}" stroke-width="1.5" opacity="0.6"/>${led(50, 64, 2)}</g>`,
  holotable: () => `<g><ellipse cx="50" cy="70" rx="26" ry="8" fill="${F}" stroke="${S}"/><path d="M34 66 q16 -34 32 0 Z" fill="${HILITE}" opacity="0.4"/><circle cx="50" cy="52" r="4" fill="#fff"/></g>`,
  data_core: () => `<g><rect x="38" y="24" width="24" height="52" rx="4" fill="${F}" stroke="${S}"/>${Array.from({ length: 5 }, (_, i) => `<line x1="42" y1="${32 + i * 9}" x2="58" y2="${32 + i * 9}" stroke="${HILITE}" stroke-width="2"/>`).join('')}</g>`,
  jump_gate: () => `<g><circle cx="50" cy="50" r="30" fill="none" stroke="${F}" stroke-width="6"/><circle cx="50" cy="50" r="30" fill="none" stroke="${S}"/><ellipse cx="50" cy="50" rx="18" ry="26" fill="${HILITE}" opacity="0.35"/><circle cx="50" cy="50" r="6" fill="#fff"/></g>`,
  drone: () => `<g><ellipse cx="50" cy="50" rx="14" ry="10" fill="${F}" stroke="${S}"/><circle cx="50" cy="50" r="5" fill="${WINDOW}"/><line x1="30" y1="40" x2="40" y2="46" stroke="${S}" stroke-width="2"/><line x1="70" y1="40" x2="60" y2="46" stroke="${S}" stroke-width="2"/><circle cx="28" cy="38" r="4" fill="${SHADE}"/><circle cx="72" cy="38" r="4" fill="${SHADE}"/></g>`,
  mech: () => `<g stroke="${S}" stroke-width="1"><rect x="38" y="30" width="24" height="26" rx="3" fill="${F}"/><rect x="44" y="36" width="12" height="8" fill="${WINDOW}"/><rect x="30" y="34" width="8" height="20" fill="${SHADE}"/><rect x="62" y="34" width="8" height="20" fill="${SHADE}"/><rect x="40" y="56" width="8" height="24" fill="${F}"/><rect x="52" y="56" width="8" height="24" fill="${F}"/></g>`,
  rover: () => `<g><rect x="30" y="42" width="40" height="18" rx="3" fill="${F}" stroke="${S}"/><rect x="40" y="34" width="16" height="10" fill="${WINDOW}"/><circle cx="38" cy="64" r="7" fill="${SHADE_DEEP}" stroke="${S}"/><circle cx="62" cy="64" r="7" fill="${SHADE_DEEP}" stroke="${S}"/></g>`,
  satellite_dish: () => `<g><path d="M30 66 a26 26 0 0 1 40 -34" fill="${F}" stroke="${S}"/><line x1="52" y1="46" x2="66" y2="30" stroke="${S}" stroke-width="2"/><circle cx="66" cy="30" r="3" fill="${HILITE}"/><rect x="40" y="66" width="20" height="8" fill="${SHADE_DEEP}"/></g>`,
  mine: () => `<g><circle cx="50" cy="52" r="18" fill="${F}" stroke="${S}"/><g stroke="${S}" stroke-width="3">${Array.from({ length: 8 }, (_, i) => { const a = (Math.PI / 4) * i; return `<line x1="${(50 + 18 * Math.cos(a)).toFixed(1)}" y1="${(52 + 18 * Math.sin(a)).toFixed(1)}" x2="${(50 + 26 * Math.cos(a)).toFixed(1)}" y2="${(52 + 26 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g>${led(50, 52, 3, '#ff5a3c')}</g>`,
  crate_supply: () => `<g>${box(28, 34, 44, 40, F, 2)}<path d="M28 54 h44 M50 34 v40" stroke="${SHADE}" stroke-width="2"/><rect x="40" y="30" width="20" height="6" fill="${SHADE_DEEP}"/></g>`,
  waypoint: () => `<g><path d="M50 20 C36 20 28 30 28 42 C28 58 50 80 50 80 C50 80 72 58 72 42 C72 30 64 20 50 20 Z" fill="${F}" stroke="${S}"/><circle cx="50" cy="42" r="8" fill="${WINDOW}"/></g>`,
  flag: () => `<g><rect x="36" y="22" width="4" height="58" fill="${S}"/><path d="M40 24 h30 l-8 10 l8 10 h-30 Z" fill="${F}" stroke="${S}"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * VEHICLES — ground / air / small craft
 * ═══════════════════════════════════════════════════════════════════════════ */

const vehicles = {
  shuttle: () => `<g><path d="M22 50 L60 40 Q80 50 60 60 Z" fill="${F}" stroke="${S}"/><rect x="34" y="46" width="10" height="8" fill="${WINDOW}"/><path d="M52 40 L58 28 L60 42 M52 60 L58 72 L60 58" fill="${SHADE}" stroke="${S}"/></g>`,
  fighter: () => `<g><path d="M20 50 L64 44 L78 50 L64 56 Z" fill="${F}" stroke="${S}"/><polygon points="40,44 50,26 46,44" fill="${SHADE}"/><polygon points="40,56 50,74 46,56" fill="${SHADE}"/><circle cx="30" cy="50" r="3" fill="${WINDOW}"/></g>`,
  freighter: () => `<g>${box(22, 40, 46, 24, F, 3)}<path d="M68 40 h10 v24 h-10 Z" fill="${SHADE}" stroke="${S}"/>${grid(28, 44, 3, 2, 10, 7, 4, WINDOW_DIM)}</g>`,
  hovercar: () => `<g><path d="M26 52 q24 -18 48 0 q-24 10 -48 0 Z" fill="${F}" stroke="${S}"/><path d="M40 46 q10 -8 20 0" fill="${WINDOW}"/><ellipse cx="34" cy="60" rx="8" ry="3" fill="${HILITE}" opacity="0.5"/><ellipse cx="66" cy="60" rx="8" ry="3" fill="${HILITE}" opacity="0.5"/></g>`,
  tank: () => `<g><rect x="24" y="52" width="52" height="16" rx="4" fill="${F}" stroke="${S}"/><rect x="38" y="40" width="24" height="14" rx="3" fill="${F}" stroke="${S}"/><rect x="58" y="44" width="24" height="5" fill="${SHADE_DEEP}"/><g fill="${SHADE_DEEP}"><circle cx="32" cy="70" r="5"/><circle cx="46" cy="70" r="5"/><circle cx="60" cy="70" r="5"/></g></g>`,
  transport: () => `<g><rect x="20" y="42" width="60" height="24" rx="4" fill="${F}" stroke="${S}"/>${grid(26, 46, 5, 1, 8, 10, 3, WINDOW)}<circle cx="34" cy="70" r="6" fill="${SHADE_DEEP}"/><circle cx="66" cy="70" r="6" fill="${SHADE_DEEP}"/></g>`,
  gunship: () => `<g><path d="M24 50 L62 42 Q78 50 62 58 Z" fill="${F}" stroke="${S}"/><rect x="30" y="58 " width="6" height="10" fill="${SHADE_DEEP}"/><rect x="44" y="58" width="6" height="10" fill="${SHADE_DEEP}"/><rect x="34" y="46" width="10" height="7" fill="${WINDOW}"/></g>`,
  probe: () => `<g><circle cx="50" cy="48" r="12" fill="${F}" stroke="${S}"/><circle cx="50" cy="48" r="5" fill="${WINDOW}"/><line x1="50" y1="60" x2="50" y2="78" stroke="${S}" stroke-width="2"/><line x1="38" y1="36" x2="30" y2="28" stroke="${S}" stroke-width="2"/><line x1="62" y1="36" x2="70" y2="28" stroke="${S}" stroke-width="2"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * MAP MARKERS — generic pins / points of interest
 * ═══════════════════════════════════════════════════════════════════════════ */

const mapMarkers = {
  pin: () => `<g><path d="M50 22 C38 22 30 31 30 42 C30 58 50 80 50 80 C50 80 70 58 70 42 C70 31 62 22 50 22 Z" fill="${F}" stroke="${S}"/><circle cx="50" cy="42" r="8" fill="#fff"/></g>`,
  marker_x: () => `<g stroke="${S}" stroke-width="2"><circle cx="50" cy="50" r="24" fill="${F}"/><line x1="40" y1="40" x2="60" y2="60" stroke="${SHADE_DEEP}" stroke-width="4"/><line x1="60" y1="40" x2="40" y2="60" stroke="${SHADE_DEEP}" stroke-width="4"/></g>`,
  marker_star: () => `<g fill="${F}" stroke="${S}">${star(50, 50, 26)}</g>`,
  marker_diamond: () => `<g><polygon points="50,22 74,50 50,78 26,50" fill="${F}" stroke="${S}"/><polygon points="50,34 62,50 50,66 38,50" fill="${HILITE}" opacity="0.4"/></g>`,
  marker_flag: () => `<g><rect x="36" y="22" width="4" height="58" fill="${S}"/><path d="M40 24 h28 v20 h-28 Z" fill="${F}" stroke="${S}"/></g>`,
  marker_shield: () => `<g><path d="M50 20 L74 30 V52 C74 68 50 80 50 80 C50 80 26 68 26 52 V30 Z" fill="${F}" stroke="${S}"/><path d="M50 30 L64 36 V52 C64 60 50 68 50 68 Z" fill="${HILITE}" opacity="0.4"/></g>`,
  marker_skull: () => `<g fill="${F}" stroke="${S}"><circle cx="50" cy="44" r="20"/><rect x="38" y="58" width="24" height="12" rx="4"/><circle cx="43" cy="44" r="5" fill="${SHADE_DEEP}"/><circle cx="57" cy="44" r="5" fill="${SHADE_DEEP}"/><rect x="47" y="52" width="6" height="8" fill="${SHADE_DEEP}"/></g>`,
  marker_danger: () => `<g><polygon points="50,22 78,74 22,74" fill="${F}" stroke="${S}"/><rect x="47" y="40" width="6" height="20" fill="${SHADE_DEEP}"/><circle cx="50" cy="66" r="3.4" fill="${SHADE_DEEP}"/></g>`,
  marker_target: () => `<g fill="none" stroke="${S}" stroke-width="2"><circle cx="50" cy="50" r="24"/><circle cx="50" cy="50" r="14"/><circle cx="50" cy="50" r="4" fill="${F}"/></g>`,
  marker_dot: () => `<g><circle cx="50" cy="50" r="16" fill="${F}" stroke="${S}"/><circle cx="50" cy="50" r="7" fill="${HILITE}"/></g>`,
  marker_cross: () => `<g fill="${F}" stroke="${S}"><rect x="44" y="26" width="12" height="48" rx="2"/><rect x="26" y="44" width="48" height="12" rx="2"/></g>`,
  marker_anchor: () => `<g stroke="${S}" stroke-width="3" fill="none"><circle cx="50" cy="30" r="6"/><line x1="50" y1="36" x2="50" y2="74"/><line x1="36" y1="50" x2="64" y2="50"/><path d="M30 60 a20 20 0 0 0 40 0"/></g>`,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Flat map of shape id -> render fn. */
export const SHAPES = {
  ...cosmic, ...stellar, ...space, ...geography, ...nature, ...water, ...settlement, ...structures, ...anomalous,
  ...rooms, ...furniture, ...buildingParts, ...shipParts, ...stationModules, ...scifiProps, ...vehicles, ...mapMarkers,
};

/**
 * Subjects group the shapes into the "canvas subject" the author is composing.
 * Each entry: { id, label, icon, items: [{ shape, label }] }.
 * `icon` is a small emoji used only in the subject header (not on the canvas).
 */
export const SUBJECTS = [
  { id: 'cosmos', label: 'Cosmos', icon: '🌌', items: [
    { shape: 'galaxy', label: 'Galaxy' }, { shape: 'nebula', label: 'Nebula' },
    { shape: 'star_cluster', label: 'Star Cluster' }, { shape: 'black_hole', label: 'Black Hole' },
    { shape: 'comet', label: 'Comet' },
  ]},
  { id: 'solar', label: 'Solar System', icon: '☀️', items: [
    { shape: 'sun', label: 'Star / Sun' }, { shape: 'binary_star', label: 'Binary Star' },
    { shape: 'planet', label: 'Planet' }, { shape: 'ringed_planet', label: 'Ringed Planet' },
    { shape: 'gas_giant', label: 'Gas Giant' }, { shape: 'moon', label: 'Moon' },
    { shape: 'asteroid', label: 'Asteroid' }, { shape: 'asteroid_belt', label: 'Asteroid Belt' },
  ]},
  { id: 'space', label: 'Space Infrastructure', icon: '🛰️', items: [
    { shape: 'space_station', label: 'Space Station' }, { shape: 'spaceship', label: 'Spaceship' },
    { shape: 'fleet', label: 'Fleet' }, { shape: 'satellite', label: 'Satellite' },
    { shape: 'megastructure', label: 'Megastructure' }, { shape: 'portal', label: 'Portal' },
  ]},
  { id: 'geography', label: 'Continents & Regions', icon: '🗺️', items: [
    { shape: 'continent', label: 'Continent' }, { shape: 'island', label: 'Island' },
    { shape: 'country', label: 'Country' }, { shape: 'region', label: 'Region' },
    { shape: 'desert', label: 'Desert' }, { shape: 'swamp', label: 'Swamp' },
    { shape: 'tundra', label: 'Tundra' },
  ]},
  { id: 'nature', label: 'Nature & Terrain', icon: '⛰️', items: [
    { shape: 'mountain', label: 'Mountain' }, { shape: 'volcano', label: 'Volcano' },
    { shape: 'hill', label: 'Hill' }, { shape: 'tree', label: 'Tree' },
    { shape: 'pine_tree', label: 'Pine Tree' }, { shape: 'forest', label: 'Forest' },
    { shape: 'cave', label: 'Cave' }, { shape: 'canyon', label: 'Canyon' },
  ]},
  { id: 'water', label: 'Water', icon: '🌊', items: [
    { shape: 'ocean', label: 'Ocean' }, { shape: 'lake', label: 'Lake' },
    { shape: 'river', label: 'River' }, { shape: 'waterfall', label: 'Waterfall' },
    { shape: 'bay', label: 'Bay / Coast' },
  ]},
  { id: 'settlement', label: 'Cities & Settlements', icon: '🏙️', items: [
    { shape: 'metropolis', label: 'Metropolis' }, { shape: 'city', label: 'City' },
    { shape: 'town', label: 'Town' }, { shape: 'village', label: 'Village' },
    { shape: 'district', label: 'District' },
  ]},
  { id: 'structures', label: 'Structures', icon: '🏛️', items: [
    { shape: 'skyscraper', label: 'Skyscraper' }, { shape: 'tower', label: 'Tower' },
    { shape: 'castle', label: 'Castle' }, { shape: 'fortress', label: 'Fortress' },
    { shape: 'temple', label: 'Temple' }, { shape: 'monument', label: 'Monument' },
    { shape: 'house', label: 'House' }, { shape: 'hut', label: 'Hut' },
    { shape: 'tent', label: 'Tent' }, { shape: 'factory', label: 'Factory' },
    { shape: 'bridge', label: 'Bridge' }, { shape: 'wall', label: 'Wall' },
  ]},
  { id: 'anomalous', label: 'Anomalous & Relics', icon: '🔮', items: [
    { shape: 'artifact', label: 'Artifact' }, { shape: 'crystal', label: 'Crystal' },
    { shape: 'anomaly', label: 'Anomaly' }, { shape: 'void_conduit', label: 'Void Conduit' },
    { shape: 'ruins', label: 'Ruins' },
  ]},
  { id: 'rooms', label: 'Rooms & Floorplans', icon: '🧭', items: [
    { shape: 'room_square', label: 'Square Room' }, { shape: 'room_wide', label: 'Wide Room' },
    { shape: 'room_tall', label: 'Tall Room' }, { shape: 'room_l', label: 'L-Room' },
    { shape: 'room_t', label: 'T-Room' }, { shape: 'room_round', label: 'Round Room' },
    { shape: 'room_oct', label: 'Octagon Room' }, { shape: 'corridor_h', label: 'Corridor (H)' },
    { shape: 'corridor_v', label: 'Corridor (V)' }, { shape: 'corridor_cross', label: 'Corridor Cross' },
    { shape: 'corridor_corner', label: 'Corridor Corner' }, { shape: 'airlock', label: 'Airlock' },
    { shape: 'bridge_room', label: 'Bridge' }, { shape: 'medbay', label: 'Medbay' },
    { shape: 'armory', label: 'Armory' }, { shape: 'cargo_bay', label: 'Cargo Bay' },
    { shape: 'engine_room', label: 'Engine Room' }, { shape: 'reactor_room', label: 'Reactor Room' },
    { shape: 'quarters', label: 'Quarters' }, { shape: 'lab_room', label: 'Laboratory' },
    { shape: 'hangar', label: 'Hangar' }, { shape: 'vault_room', label: 'Vault' },
    { shape: 'observatory', label: 'Observatory' },
  ]},
  { id: 'furniture', label: 'Furniture & Fixtures', icon: '🪑', items: [
    { shape: 'bed', label: 'Bed' }, { shape: 'bunk', label: 'Bunk' },
    { shape: 'table_round', label: 'Round Table' }, { shape: 'table_long', label: 'Long Table' },
    { shape: 'desk', label: 'Desk' }, { shape: 'chair', label: 'Chair' },
    { shape: 'sofa', label: 'Sofa' }, { shape: 'console', label: 'Console' },
    { shape: 'terminal', label: 'Terminal' }, { shape: 'workbench', label: 'Workbench' },
    { shape: 'shelf', label: 'Shelf' }, { shape: 'locker', label: 'Locker' },
    { shape: 'crate', label: 'Crate' }, { shape: 'barrel', label: 'Barrel' },
    { shape: 'container', label: 'Container' }, { shape: 'planter', label: 'Planter' },
    { shape: 'lamp', label: 'Lamp' }, { shape: 'screen', label: 'Screen' },
    { shape: 'server_rack', label: 'Server Rack' }, { shape: 'toilet', label: 'Toilet' },
    { shape: 'sink', label: 'Sink' }, { shape: 'stove', label: 'Stove' },
    { shape: 'fridge', label: 'Fridge' }, { shape: 'statue', label: 'Statue' },
    { shape: 'fountain', label: 'Fountain' }, { shape: 'pillar', label: 'Pillar' },
    { shape: 'hydroponics', label: 'Hydroponics' }, { shape: 'cryopod', label: 'Cryopod' },
  ]},
  { id: 'building_parts', label: 'Building Parts', icon: '🧱', items: [
    { shape: 'wall_straight', label: 'Wall' }, { shape: 'wall_corner', label: 'Wall Corner' },
    { shape: 'door_single', label: 'Door' }, { shape: 'door_double', label: 'Double Door' },
    { shape: 'blast_door', label: 'Blast Door' }, { shape: 'window_row', label: 'Windows' },
    { shape: 'stairs', label: 'Stairs' }, { shape: 'stairs_spiral', label: 'Spiral Stairs' },
    { shape: 'ladder', label: 'Ladder' }, { shape: 'elevator', label: 'Elevator' },
    { shape: 'ramp', label: 'Ramp' }, { shape: 'column', label: 'Column' },
    { shape: 'archway', label: 'Archway' }, { shape: 'gate', label: 'Gate' },
    { shape: 'fence', label: 'Fence' }, { shape: 'roof_gable', label: 'Roof' },
    { shape: 'chimney', label: 'Chimney' }, { shape: 'balcony', label: 'Balcony' },
    { shape: 'solar_panel', label: 'Solar Panel' }, { shape: 'antenna_dish', label: 'Antenna' },
    { shape: 'turbine', label: 'Turbine' },
  ]},
  { id: 'ship_parts', label: 'Starship Parts', icon: '🚀', items: [
    { shape: 'hull_fore', label: 'Fore Hull' }, { shape: 'hull_mid', label: 'Mid Hull' },
    { shape: 'hull_aft', label: 'Aft Hull' }, { shape: 'cockpit', label: 'Cockpit' },
    { shape: 'wing_left', label: 'Wing (L)' }, { shape: 'wing_right', label: 'Wing (R)' },
    { shape: 'thruster', label: 'Thruster' }, { shape: 'engine_pod', label: 'Engine Pod' },
    { shape: 'nacelle', label: 'Nacelle' }, { shape: 'reactor_core', label: 'Reactor Core' },
    { shape: 'fuel_tank', label: 'Fuel Tank' }, { shape: 'cargo_pod', label: 'Cargo Pod' },
    { shape: 'landing_gear', label: 'Landing Gear' }, { shape: 'weapon_turret', label: 'Turret' },
    { shape: 'shield_gen', label: 'Shield Gen' }, { shape: 'docking_ring', label: 'Docking Ring' },
    { shape: 'escape_pod', label: 'Escape Pod' }, { shape: 'sensor_array', label: 'Sensor Array' },
  ]},
  { id: 'station_modules', label: 'Station Modules', icon: '🛰️', items: [
    { shape: 'module_hub', label: 'Hub' }, { shape: 'module_ring', label: 'Ring' },
    { shape: 'module_cylinder', label: 'Cylinder' }, { shape: 'module_solar', label: 'Solar Wing' },
    { shape: 'module_dock', label: 'Dock' }, { shape: 'module_habitat', label: 'Habitat' },
    { shape: 'module_comms', label: 'Comms' }, { shape: 'truss', label: 'Truss' },
    { shape: 'cupola', label: 'Cupola' }, { shape: 'gravity_ring', label: 'Gravity Ring' },
    { shape: 'drydock', label: 'Drydock' }, { shape: 'refinery', label: 'Refinery' },
  ]},
  { id: 'scifi_props', label: 'Sci-Fi Props', icon: '🔧', items: [
    { shape: 'beacon', label: 'Beacon' }, { shape: 'relay', label: 'Relay' },
    { shape: 'turret_gun', label: 'Gun Turret' }, { shape: 'generator', label: 'Generator' },
    { shape: 'power_node', label: 'Power Node' }, { shape: 'scanner', label: 'Scanner' },
    { shape: 'holotable', label: 'Holotable' }, { shape: 'data_core', label: 'Data Core' },
    { shape: 'jump_gate', label: 'Jump Gate' }, { shape: 'drone', label: 'Drone' },
    { shape: 'mech', label: 'Mech' }, { shape: 'rover', label: 'Rover' },
    { shape: 'satellite_dish', label: 'Dish' }, { shape: 'mine', label: 'Mine' },
    { shape: 'crate_supply', label: 'Supply Crate' }, { shape: 'waypoint', label: 'Waypoint' },
    { shape: 'flag', label: 'Flag' },
  ]},
  { id: 'vehicles', label: 'Vehicles & Craft', icon: '🛸', items: [
    { shape: 'shuttle', label: 'Shuttle' }, { shape: 'fighter', label: 'Fighter' },
    { shape: 'freighter', label: 'Freighter' }, { shape: 'hovercar', label: 'Hovercar' },
    { shape: 'tank', label: 'Tank' }, { shape: 'transport', label: 'Transport' },
    { shape: 'gunship', label: 'Gunship' }, { shape: 'probe', label: 'Probe' },
  ]},
  { id: 'markers', label: 'Map Markers', icon: '📍', items: [
    { shape: 'pin', label: 'Pin' }, { shape: 'marker_x', label: 'X Mark' },
    { shape: 'marker_star', label: 'Star' }, { shape: 'marker_diamond', label: 'Diamond' },
    { shape: 'marker_flag', label: 'Flag' }, { shape: 'marker_shield', label: 'Shield' },
    { shape: 'marker_skull', label: 'Skull' }, { shape: 'marker_danger', label: 'Danger' },
    { shape: 'marker_target', label: 'Target' }, { shape: 'marker_dot', label: 'Dot' },
    { shape: 'marker_cross', label: 'Cross' }, { shape: 'marker_anchor', label: 'Anchor' },
  ]},
];

/** Default label for a shape id (falls back to a title-cased id). */
export function shapeLabel(shapeId) {
  for (const subj of SUBJECTS) {
    const found = subj.items.find((i) => i.shape === shapeId);
    if (found) return found.label;
  }
  return String(shapeId || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Build the full inner SVG for a shape id. Returns '' for unknown ids so the
 * caller can decide on a fallback. Does NOT include the <svg> wrapper.
 * @param {string} shapeId
 * @returns {string}
 */
export function shapeSVG(shapeId, uid = '') {
  const fn = SHAPES[shapeId];
  // `uid` localizes any internal element ids (e.g. gas_giant's clipPath) so
  // multiple instances on one page don't collide. A random suffix by default.
  const suffix = uid || `-${Math.random().toString(36).slice(2, 8)}`;
  return typeof fn === 'function' ? fn(suffix) : '';
}

/**
 * Build a complete standalone <svg> string for a shape (used by palette
 * previews and canvas nodes). `size` sets width/height; color drives --el-fill.
 * @param {string} shapeId
 * @param {number} [size]
 * @param {string} [color]
 * @returns {string}
 */
export function shapeMarkup(shapeId, size = 48, color = 'var(--accent-primary)') {
  const inner = shapeSVG(shapeId);
  const style = `--el-fill:${color};--el-stroke:color-mix(in srgb, ${color} 62%, #000);`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="${style}" `
    + `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner || fallbackDot()}</svg>`;
}

function fallbackDot() {
  return `<circle cx="50" cy="50" r="24" fill="${F}" stroke="${S}" stroke-width="1.5"/>`;
}

/** All known shape ids (handy for tests/iteration). */
export function allShapeIds() {
  return Object.keys(SHAPES);
}

/**
 * Sanitize a color for safe use in an inline style / CSS custom property.
 * Accepts hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba(), hsl()/hsla(), a bare CSS
 * identifier (e.g. "rebeccapurple"), or a CSS var() reference. Anything with
 * characters that could break out of a style attribute (quotes, angle brackets,
 * semicolons, braces) is rejected in favor of the accent fallback — this keeps
 * hand-edited or imported node colors from corrupting the SVG markup we inject.
 * @param {string} color
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeColor(color, fallback = 'var(--accent-primary)') {
  if (typeof color !== 'string') return fallback;
  const c = color.trim();
  if (!c) return fallback;
  const ok = /^#[0-9a-fA-F]{3,8}$/.test(c)
    || /^(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)$/.test(c)
    || /^var\(--[a-zA-Z0-9-]+\)$/.test(c)
    || /^[a-zA-Z]+$/.test(c);
  return ok ? c : fallback;
}

/**
 * Legacy ObjectTypes -> shape id, so pre-existing worldBuilder data (which
 * stored `type` like 'planet', 'city', 'space_station', 'void_conduit', …)
 * renders as a shape without a migration.
 */
export const LEGACY_TYPE_TO_SHAPE = {
  universe: 'galaxy', multiverse: 'galaxy', galaxy: 'galaxy', nebula: 'nebula',
  star_cluster: 'star_cluster', solar_system: 'sun', binary_star: 'binary_star',
  planet: 'planet', moon: 'moon', asteroid_belt: 'asteroid_belt',
  space_station: 'space_station', megastructure: 'megastructure', fleet: 'fleet', ship: 'spaceship',
  continent: 'continent', country: 'country', kingdom: 'castle', city: 'city',
  district: 'district', village: 'village', building: 'house', floor: 'house', room: 'house',
  forest: 'forest', mountain: 'mountain', river: 'river', ocean: 'ocean',
  portal: 'portal', artifact: 'artifact', anomaly: 'anomaly', void_conduit: 'void_conduit',
};

/** Resolve whatever a node stored (shape or legacy type) to a real shape id. */
export function resolveShapeId(node) {
  if (!node) return 'planet';
  if (node.shape && SHAPES[node.shape]) return node.shape;
  const mapped = LEGACY_TYPE_TO_SHAPE[node.type];
  if (mapped && SHAPES[mapped]) return mapped;
  if (node.type && SHAPES[node.type]) return node.type;
  return 'planet';
}
