/**
 * Tekent de SVG's van Drie op een rij (zelf getekend, geen externe bronnen) en schrijft ze naar
 * public/games/drie-op-een-rij/themes/<thema>/. De uitvoer wordt gecommit; draai dit script alleen
 * opnieuw als je een tekening wilt aanpassen:  node scripts/generate-drie-op-een-rij-svgs.mjs
 *
 * Elke steensoort heeft een eigen vorm én kleur, zodat het spel ook speelbaar is bij
 * kleurenblindheid of minder scherp zicht.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'games', 'drie-op-een-rij', 'themes');

/** Kleuren per steensoort: [licht, midden, donker]. */
const COLORS = [
  ['#ff8a80', '#d9342b', '#7f1410'], // 0 rood, cirkel
  ['#8ab4ff', '#2f6fe0', '#123a8a'], // 1 blauw, vierkant
  ['#8be39c', '#2e9e48', '#145226'], // 2 groen, driehoek
  ['#fff08a', '#f2c230', '#8a6400'], // 3 geel, ruit
  ['#d4b0ff', '#8a4fd1', '#45207a'], // 4 paars, zeshoek
  ['#ffc58a', '#f07a1a', '#8a3a00'], // 5 oranje, druppel
  ['#b5f3ff', '#3fc1d9', '#11667a'], // 6 cyaan, ster
];

const polygon = (points) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const regular = (n, r, cx = 50, cy = 50, rot = -90) =>
  Array.from({ length: n }, (_, k) => {
    const a = ((rot + (360 / n) * k) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
const star = (r1, r2, cx = 50, cy = 52) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = ((-90 + 36 * k) * Math.PI) / 180;
    const r = k % 2 === 0 ? r1 : r2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
const scale = (pts, f, cx = 50, cy = 50) => pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);

/** Buitenvorm per soort als lijst punten (of null voor cirkel en druppel). */
const SHAPES = [
  null,
  [
    [14, 14],
    [86, 14],
    [86, 86],
    [14, 86],
  ],
  [
    [50, 9],
    [92, 86],
    [8, 86],
  ],
  regular(4, 42),
  regular(6, 42, 50, 50, -90),
  null,
  star(44, 20),
];

const DROP = 'M50 8 C66 30 84 46 84 64 A34 34 0 0 1 16 64 C16 46 34 30 50 8 Z';

function outline(kind, extra = '') {
  if (kind === 0) return `<circle cx="50" cy="50" r="40" ${extra}/>`;
  if (kind === 5) return `<path d="${DROP}" ${extra}/>`;
  if (kind === 1) return `<rect x="12" y="12" width="76" height="76" rx="10" ${extra}/>`;
  return `<polygon points="${polygon(SHAPES[kind])}" ${extra}/>`;
}

function svg(body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}

/** Basis: vlakke vormen met een dikke donkere rand. */
function baseTile(kind) {
  const [, mid, dark] = COLORS[kind];
  return svg(outline(kind, `fill="${mid}" stroke="${dark}" stroke-width="6" stroke-linejoin="round"`));
}

/** Facet: geslepen edelsteen met verloop, tafelvlak en facetlijnen. */
function facetTile(kind) {
  const [light, mid, dark] = COLORS[kind];
  const id = `g${kind}`;
  const defs =
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/>` +
    `<stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
  const body = [outline(kind, `fill="url(#${id})" stroke="${dark}" stroke-width="4" stroke-linejoin="round"`)];
  const pts = SHAPES[kind];
  if (pts) {
    const inner = scale(pts, 0.5, 50, kind === 2 ? 60 : kind === 6 ? 52 : 50);
    body.push(`<polygon points="${polygon(inner)}" fill="#fff" fill-opacity=".28" stroke="${dark}" stroke-opacity=".5" stroke-width="1.5"/>`);
    pts.forEach((p, k) => {
      const q = inner[k];
      body.push(`<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="${dark}" stroke-opacity=".45" stroke-width="1.5"/>`);
    });
  } else if (kind === 0) {
    body.push(`<circle cx="50" cy="50" r="20" fill="#fff" fill-opacity=".28" stroke="${dark}" stroke-opacity=".5" stroke-width="1.5"/>`);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      body.push(`<line x1="${(50 + 20 * Math.cos(a)).toFixed(1)}" y1="${(50 + 20 * Math.sin(a)).toFixed(1)}" x2="${(50 + 40 * Math.cos(a)).toFixed(1)}" y2="${(50 + 40 * Math.sin(a)).toFixed(1)}" stroke="${dark}" stroke-opacity=".45" stroke-width="1.5"/>`);
    }
  } else {
    body.push(`<ellipse cx="50" cy="62" rx="17" ry="13" fill="#fff" fill-opacity=".28" stroke="${dark}" stroke-opacity=".5" stroke-width="1.5"/>`);
    body.push(`<path d="M50 8 L50 49 M16 64 L33 62 M84 64 L67 62" stroke="${dark}" stroke-opacity=".45" stroke-width="1.5" fill="none"/>`);
  }
  body.push(`<path d="M30 24 Q38 18 46 20" stroke="#fff" stroke-opacity=".85" stroke-width="4" stroke-linecap="round" fill="none"/>`);
  return svg(body.join(''), defs);
}

/** Goudrand: warm en afgerond, met een dikke gouden rand en een zachte glans. */
function goudrandTile(kind) {
  const [light, mid, dark] = COLORS[kind];
  const id = `r${kind}`;
  const rim = `m${kind}`;
  const defs =
    `<radialGradient id="${id}" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="${light}"/>` +
    `<stop offset=".6" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>` +
    `<linearGradient id="${rim}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/>` +
    `<stop offset=".5" stop-color="#e3a92b"/><stop offset="1" stop-color="#8a5a00"/></linearGradient>`;
  const inner = 'transform="translate(50 50) scale(.78) translate(-50 -50)"';
  const body = [
    outline(kind, `fill="url(#${rim})" stroke="#5c3d0a" stroke-width="3" stroke-linejoin="round"`),
    `<g ${inner}>${outline(kind, `fill="url(#${id})" stroke="#5c3d0a" stroke-opacity=".6" stroke-width="3" stroke-linejoin="round"`)}</g>`,
    `<ellipse cx="40" cy="36" rx="13" ry="8" fill="#fff" fill-opacity=".45" transform="rotate(-25 40 36)"/>`,
  ];
  return svg(body.join(''), defs);
}

/** Objecten van het basisthema (spelelementen). */
const OBJECTS = {
  rotsblok: svg(
    `<path d="M14 70 L20 30 L42 14 L72 18 L88 40 L84 76 L58 88 L26 86 Z" fill="#8a8f99" stroke="#3a3f48" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="M26 40 L44 30 L66 34" stroke="#c4c8d0" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      `<path d="M40 60 L52 52 L60 64 L72 58" stroke="#4b505a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  ),
  muntblok: svg(
    `<rect x="12" y="12" width="76" height="76" rx="12" fill="#b8862c" stroke="#5c3d0a" stroke-width="5"/>` +
      `<circle cx="50" cy="50" r="24" fill="#ffd54a" stroke="#8a6400" stroke-width="4"/>` +
      `<path d="M50 36 L54 46 L64 46 L56 53 L59 63 L50 57 L41 63 L44 53 L36 46 L46 46 Z" fill="#8a6400"/>`,
  ),
  ketting: svg(
    `<g fill="none" stroke-linecap="round"><path d="M4 36 L96 64" stroke="#1b1e24" stroke-width="20"/>` +
      `<path d="M4 36 L96 64" stroke="#d5dae3" stroke-width="11" stroke-dasharray="16 7"/></g>`,
  ),
  ketting2: svg(
    `<g fill="none" stroke-linecap="round"><path d="M4 36 L96 64 M4 64 L96 36" stroke="#1b1e24" stroke-width="20"/>` +
      `<path d="M4 36 L96 64 M4 64 L96 36" stroke="#d5dae3" stroke-width="11" stroke-dasharray="16 7"/></g>`,
  ),
  veer: svg(
    `<path d="M74 10 C40 18 22 48 26 84 C52 76 76 50 74 10 Z" fill="#eef4ff" stroke="#2f4d7a" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M20 92 L66 22" stroke="#2f4d7a" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M40 54 L58 50 M34 66 L52 64 M48 40 L64 34" stroke="#7d97c2" stroke-width="3" stroke-linecap="round"/>`,
  ),
  amulet: svg(
    `<path d="M30 10 Q50 30 70 10" fill="none" stroke="#8a6400" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="50" cy="58" r="32" fill="#ffd54a" stroke="#8a6400" stroke-width="5"/>` +
      `<polygon points="50,38 66,58 50,78 34,58" fill="#2f9fd0" stroke="#0e4a66" stroke-width="3"/>`,
  ),
  altaar: svg(
    `<path d="M18 86 L82 86 L74 60 L26 60 Z" fill="#9aa0aa" stroke="#3a3f48" stroke-width="5" stroke-linejoin="round"/>` +
      `<rect x="14" y="48" width="72" height="14" rx="4" fill="#b6bbc4" stroke="#3a3f48" stroke-width="5"/>`,
  ),
  altaarAan: svg(
    `<path d="M18 86 L82 86 L74 60 L26 60 Z" fill="#9aa0aa" stroke="#3a3f48" stroke-width="5" stroke-linejoin="round"/>` +
      `<rect x="14" y="48" width="72" height="14" rx="4" fill="#b6bbc4" stroke="#3a3f48" stroke-width="5"/>` +
      `<path d="M50 6 C62 20 70 30 64 44 L36 44 C30 30 40 20 50 6 Z" fill="#ff9a1f" stroke="#a33a00" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M50 22 C56 30 58 36 55 44 L45 44 C42 36 44 30 50 22 Z" fill="#ffe27a"/>`,
  ),
  schat: svg(
    `<g fill="none" stroke="#5c3d0a" stroke-width="5" stroke-dasharray="8 6" stroke-linejoin="round">` +
      `<rect x="14" y="40" width="72" height="44" rx="6"/><path d="M14 52 Q50 14 86 52"/><rect x="42" y="50" width="16" height="14"/></g>`,
  ),
  // Speciale stenen: bom en kruis liggen als laag over de steen, de kleurenster vervangt hem.
  bom: svg(
    `<circle cx="50" cy="50" r="44" fill="none" stroke="#111" stroke-width="9"/>` +
      `<circle cx="50" cy="50" r="44" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="10 7"/>` +
      `<circle cx="80" cy="20" r="14" fill="#222" stroke="#fff" stroke-width="3"/>` +
      `<path d="M80 6 L84 14 L93 12 L87 19 L94 25 L84 24" fill="#ffb000" stroke="#7a3d00" stroke-width="2" stroke-linejoin="round"/>`,
  ),
  kruis: svg(
    `<g stroke-linejoin="round">` +
      [0, 90, 180, 270]
        .map(
          (a) =>
            `<polygon transform="rotate(${a} 50 50)" points="50,2 64,18 56,18 56,34 44,34 44,18 36,18" fill="#fff" stroke="#111" stroke-width="3"/>`,
        )
        .join('') +
      `</g>`,
  ),
  ster: svg(
    `<polygon points="${polygon(star(46, 20, 50, 52))}" fill="url(#r)" stroke="#111" stroke-width="5" stroke-linejoin="round"/>` +
      `<circle cx="50" cy="52" r="10" fill="#fff" stroke="#111" stroke-width="3"/>`,
    `<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a5a"/><stop offset=".25" stop-color="#ffd54a"/>` +
      `<stop offset=".5" stop-color="#4cd964"/><stop offset=".75" stop-color="#4aa8ff"/><stop offset="1" stop-color="#b76bff"/></linearGradient>`,
  ),
  hamer: svg(
    `<rect x="44" y="38" width="12" height="56" rx="5" fill="#b07a3a" stroke="#4a2c0a" stroke-width="4"/>` +
      `<rect x="14" y="12" width="72" height="30" rx="7" fill="#9aa0aa" stroke="#2b2f36" stroke-width="5"/>` +
      `<rect x="20" y="16" width="20" height="8" rx="3" fill="#d5dae3"/>`,
  ),
  schatOpen: svg(
    `<rect x="14" y="40" width="72" height="44" rx="6" fill="#b8862c" stroke="#5c3d0a" stroke-width="5"/>` +
      `<path d="M14 40 Q50 6 86 40 Z" fill="#d9a441" stroke="#5c3d0a" stroke-width="5" stroke-linejoin="round"/>` +
      `<circle cx="36" cy="38" r="7" fill="#ffd54a"/><circle cx="52" cy="32" r="8" fill="#ffd54a"/><circle cx="66" cy="38" r="6" fill="#ffd54a"/>` +
      `<rect x="42" y="50" width="16" height="14" fill="#ffd54a" stroke="#5c3d0a" stroke-width="3"/>`,
  ),
};

function write(theme, name, content) {
  const file = join(root, theme, `${name}.svg`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

for (let k = 0; k < COLORS.length; k++) {
  write('base', `steen-${k}`, baseTile(k));
  write('facet', `steen-${k}`, facetTile(k));
  write('goudrand', `steen-${k}`, goudrandTile(k));
}
for (const [name, content] of Object.entries(OBJECTS)) {
  write('base', name, content);
}
console.log(`SVG's geschreven naar ${root}`);
