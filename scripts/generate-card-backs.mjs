// Maakt de achterkanten van de speelkaarten in public/cards/backs, herhaalbaar. Gebruik:
//
//   node scripts/generate-card-backs.mjs [--austingabriel <map met de repo>]
//
// Vier thema's worden hier getekend: dobbelstenen, chaos fractals (een drakenkromme), Maastricht en
// scouting. Het vijfde thema, traditioneel, is de blauwe achterkant van austingabriel (CC0); die wordt
// alleen opnieuw geïmporteerd als --austingabriel is opgegeven.
//
// Elk ontwerp is puntsymmetrisch: de onderste helft is de bovenste, 180 graden gedraaid, zodat de stand
// van een kaart niets verraadt. Tekst staat daardoor twee keer op de kaart, één keer ondersteboven.
//
// Een thema toevoegen: maak public/cards/backs/<id>/back.svg (viewBox 0 0 250 350, bij voorkeur
// puntsymmetrisch) en manifest.json, en voeg de id toe aan public/cards/backs/index.json. Het scouting-
// thema is een eigen ontwerp zonder bestaande logo's en kun je vervangen door aangeleverd beeld: zet
// gewoon een ander back.svg in die map.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'public', 'cards', 'backs');

const W = 250;
const H = 350;
const CX = W / 2;
const CY = H / 2;

/** Vaste toevalsbron, zodat het resultaat bij elke run hetzelfde is. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (value) => Math.round(value * 10) / 10;

/** Een kaart met witte rand en de gegeven inhoud. `half` komt boven en, 180 graden gedraaid, onder. */
function card(id, background, half, middle = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="14" fill="#fff"/>
<clipPath id="${id}-clip"><rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="9"/></clipPath>
<g clip-path="url(#${id}-clip)">
${background}
<g id="${id}-half">${half}</g>
<use href="#${id}-half" transform="rotate(180 ${CX} ${CY})"/>
${middle}
</g>
</svg>`;
}

// --- dobbelstenen ----------------------------------------------------------------------------------

const PIPS = {
  1: [[0, 0]],
  2: [[-8, -8], [8, 8]],
  3: [[-8, -8], [0, 0], [8, 8]],
  4: [[-8, -8], [8, -8], [-8, 8], [8, 8]],
  5: [[-8, -8], [8, -8], [0, 0], [-8, 8], [8, 8]],
  6: [[-8, -9], [-8, 0], [-8, 9], [8, -9], [8, 0], [8, 9]],
};

function die(face, x, y, angle) {
  const pips = PIPS[face].map(([px, py]) => `<circle cx="${px}" cy="${py}" r="2.8"/>`).join('');
  return `<g transform="translate(${x} ${y}) rotate(${angle})"><rect x="-15" y="-15" width="30" height="30" rx="6" fill="#f6efdc" stroke="#0e2238" stroke-width="1.2"/><g fill="#14304f">${pips}</g></g>`;
}

function dice() {
  const random = rng(31);
  const tiles = [];
  // Vijf kolommen en zeven rijen van 40: de bovenste helft plus de linkerhelft van de middelste rij.
  for (let r = 0; r <= 3; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 3 && c >= 2) continue;
      const face = 1 + Math.floor(random() * 6);
      const angle = Math.round((random() - 0.5) * 30);
      tiles.push(die(face, 45 + 40 * c, 55 + 40 * r, angle));
    }
  }
  // Het middelste vakje is zelf puntsymmetrisch: de vijf, rechtop.
  const middle = die(5, CX, CY, 0);
  const background = `<rect width="${W}" height="${H}" fill="#16324f"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="6" fill="none" stroke="#d9b45a" stroke-width="1.4"/>`;
  return card('dice', background, tiles.join(''), middle);
}

// --- chaos fractals: de drakenkromme van Heighway ----------------------------------------------------

function dragonPoints(iterations) {
  let turns = [];
  for (let i = 0; i < iterations; i++) {
    turns = [...turns, 1, ...turns.slice().reverse().map((t) => -t)];
  }
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let dir = 0;
  let x = 0;
  let y = 0;
  const points = [[0, 0]];
  const step = () => {
    x += dirs[dir][0];
    y += dirs[dir][1];
    points.push([x, y]);
  };
  step();
  for (const turn of turns) {
    dir = (dir + turn + 4) % 4;
    step();
  }
  return points;
}

function fractals() {
  let points = dragonPoints(12);
  const box = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  let b = box(points);
  if (b.y1 - b.y0 > b.x1 - b.x0) {
    points = points.map(([x, y]) => [y, x]);
    b = box(points);
  }
  // Past in de bovenste helft: 206 breed en 148 hoog, in het midden van dat vak.
  const scale = Math.min(206 / (b.x1 - b.x0), 148 / (b.y1 - b.y0));
  const offsetX = 22 + (206 - (b.x1 - b.x0) * scale) / 2;
  const offsetY = 22 + (148 - (b.y1 - b.y0) * scale) / 2;
  const d = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n1(offsetX + (x - b.x0) * scale)} ${n1(offsetY + (y - b.y0) * scale)}`)
    .join('');
  const background = `<defs><linearGradient id="fr-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="0.5" stop-color="#ef476f"/><stop offset="1" stop-color="#7b5cff"/></linearGradient>
<path id="fr-path" d="${d}" fill="none" stroke-linejoin="round" stroke-linecap="round"/></defs>
<rect width="${W}" height="${H}" fill="#120a24"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="6" fill="none" stroke="#ffd166" stroke-width="1.2"/>`;
  const half = `<use href="#fr-path" stroke="#7b5cff" stroke-opacity="0.35" stroke-width="2.6"/><use href="#fr-path" stroke="url(#fr-grad)" stroke-width="0.9"/>`;
  return card('fr', background, half);
}

// --- Maastricht: Helpoort, Sint-Servaasbrug en Sint-Janskerk -------------------------------------------

function maastricht() {
  const ink = '#0f1d33';
  // Elke vorm staat op de middellijn (y = 175); de gedraaide kopie is de weerspiegeling in de Maas.
  const helpoort = `<path fill="${ink}" fill-rule="evenodd" d="M16 175V102H34V175ZM50 175V102H68V175ZM34 175V112H50V175ZM38 175V152A4 4 0 0 1 46 152V175ZM24 140H27V150H24ZM57 140H60V150H57Z"/>
<path fill="${ink}" d="M13 102L25 66L37 102ZM47 102L59 66L71 102ZM34 108H37V112H34ZM39.5 108H42.5V112H39.5ZM45 108H48V112H45Z"/>`;
  const arches = [85, 107, 129, 151, 173]
    .map((cx) => `M${cx - 8} 175V160A8 8 0 0 1 ${cx + 8} 160V175Z`)
    .join('');
  const bridge = `<path fill="${ink}" fill-rule="evenodd" d="M73 175V138H185V175Z${arches}"/>
<path fill="${ink}" d="M73 132H185V138H73Z"/>`;
  const tower = `<path fill="#b3392e" d="M196 175V50H218V175Z"/>
<path fill="#b3392e" d="M194 50L207 14L220 50Z"/>
<path fill="${ink}" d="M203 80H211V96H203ZM203 112H211V128H203Z"/>
<path fill="${ink}" d="M218 175V122L230 102L243 122V175Z"/>`;
  const waves = `M7 ${CY}` + Array.from({ length: 31 }, (_, i) => `L${7 + (i + 1) * 8} ${n1(CY + 1.6 * Math.sin(((7 + (i + 1) * 8 - CX) / 8) * Math.PI / 2))}`).join('');
  const text = `<text x="${CX}" y="33" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="14" letter-spacing="4" fill="#f6e3b4">MAASTRICHT</text>`;
  // De lucht hoort bij de helft, zodat ook de weerspiegeling in de Maas een hemel heeft.
  const sky = `<defs><linearGradient id="ma-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f3f6e"/><stop offset="0.55" stop-color="#e0825a"/><stop offset="1" stop-color="#f6c36b"/></linearGradient></defs>
<rect x="0" y="0" width="${W}" height="${CY}" fill="url(#ma-sky)"/>`;
  const background = `<rect width="${W}" height="${H}" fill="${ink}"/>`;
  const middle = `<path d="${waves}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="6" fill="none" stroke="#f6e3b4" stroke-width="1.2"/>`;
  return card('ma', background, `${sky}${helpoort}${bridge}${tower}${text}`, middle);
}

// --- scouting: tent, kampvuur, kompas en touw ----------------------------------------------------------

function scouting() {
  const random = rng(7);
  const stars = Array.from({ length: 22 }, () => {
    const x = 20 + random() * 210;
    const y = 52 + random() * 90;
    return `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(0.5 + random() * 0.8)}" fill="#f6efd0"/>`;
  }).join('');
  const tent = `<path d="M14 175L57 70L100 175Z" fill="#e8d9b0" stroke="#3b2f1c" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M57 100L40 175H74Z" fill="#2b1f12"/>
<path d="M57 70V56" stroke="#3b2f1c" stroke-width="1.4"/><path d="M57 56L70 61L57 66Z" fill="#c8402f"/>`;
  const fire = `<g transform="translate(193 171)"><rect x="-20" y="-4" width="40" height="7" rx="3.5" fill="#5a3a1c" transform="rotate(-14)"/><rect x="-20" y="-4" width="40" height="7" rx="3.5" fill="#6b4524" transform="rotate(14)"/>
<path d="M0 -3C-13 -18-9 -30 0 -46C3 -34 13 -28 14 -16C15 -8 9 -3 0 -3Z" fill="#e8742a"/><path d="M0 -3C-7 -11-5 -19 0 -28C2 -20 8 -17 8 -11C8 -6 5 -3 0 -3Z" fill="#ffd45e"/></g>
<circle cx="205" cy="118" r="1.2" fill="#ffd45e"/><circle cx="182" cy="108" r="1" fill="#ffd45e"/><circle cx="214" cy="100" r="0.9" fill="#e8742a"/>`;
  // Kompasroos: acht punten, symmetrisch bij 180 graden draaien (geen noordnaald).
  const star = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? (i % 4 === 0 ? 24 : 15) : 8;
    return `${n1(CX + r * Math.cos(a))} ${n1(CY + r * Math.sin(a))}`;
  });
  const compass = `<circle cx="${CX}" cy="${CY}" r="27" fill="#1d4a2e" stroke="#c9a66b" stroke-width="1.6"/><circle cx="${CX}" cy="${CY}" r="24.5" fill="none" stroke="#c9a66b" stroke-width="0.5"/>
<path d="M${star.join('L')}Z" fill="#e8d9b0" stroke="#3b2f1c" stroke-width="0.8" stroke-linejoin="round"/><circle cx="${CX}" cy="${CY}" r="2.2" fill="#c8402f"/>`;
  const text = `<text x="${CX}" y="36" text-anchor="middle" font-family="'Trebuchet MS', Arial, sans-serif" font-weight="700" font-size="13.5" letter-spacing="1.6" fill="#f0e2b6">FONS OLTERDISSEN</text>
<text x="${CX}" y="52" text-anchor="middle" font-family="'Trebuchet MS', Arial, sans-serif" font-size="9.5" letter-spacing="5" fill="#c9a66b">MAASTRICHT</text>`;
  const background = `<rect width="${W}" height="${H}" fill="#1d4a2e"/>
<rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="8" fill="none" stroke="#c9a66b" stroke-width="4" stroke-dasharray="5 2.5"/>
<rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="8" fill="none" stroke="#7a5b2e" stroke-width="2" stroke-dasharray="2.5 5" stroke-dashoffset="2"/>`;
  return card('sc', background, `${stars}${tent}${fire}${text}`, compass);
}

// --- hoofdprogramma -------------------------------------------------------------------------------

const svgoConfig = { multipass: true, floatPrecision: 1, plugins: ['preset-default'] };
const THEMES = [
  { id: 'dice', name: { nl: 'Dobbelstenen', en: 'Dice' }, svg: dice, credit: 'Eigen ontwerp', license: 'Eigen ontwerp' },
  { id: 'chaos-fractals', name: { nl: 'Chaos fractals', en: 'Chaos fractals' }, svg: fractals, credit: 'Eigen ontwerp (drakenkromme van Heighway)', license: 'Eigen ontwerp' },
  { id: 'maastricht', name: { nl: 'Maastricht', en: 'Maastricht' }, svg: maastricht, credit: 'Eigen ontwerp (Helpoort, Sint-Servaasbrug, Sint-Janskerk)', license: 'Eigen ontwerp' },
  { id: 'scouting', name: { nl: 'Scouting Fons Olterdissen Maastricht', en: 'Scouting Fons Olterdissen Maastricht' }, svg: scouting, credit: 'Eigen ontwerp, te vervangen door aangeleverd beeld (zet een ander back.svg in deze map)', license: 'Eigen ontwerp' },
];

function writeTheme(theme, svg) {
  const dir = path.join(outRoot, theme.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'back.svg'), svg);
  const { svg: _ignored, ...manifest } = theme;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...manifest, file: 'back.svg' }, null, 2) + '\n');
}

for (const theme of THEMES) {
  writeTheme(theme, optimize(theme.svg(), svgoConfig).data);
  console.log(`${theme.id}: ${fs.statSync(path.join(outRoot, theme.id, 'back.svg')).size} bytes`);
}

const args = process.argv.slice(2);
const agIndex = args.indexOf('--austingabriel');
if (agIndex >= 0) {
  const agDir = args[agIndex + 1];
  const source = fs.readFileSync(path.join(agDir, 'svg cards', 'card backs', 'card back blue.svg'), 'utf8');
  const theme = {
    id: 'traditional',
    name: { nl: 'Traditioneel', en: 'Traditional' },
    credit: 'AustinGabriel, Public Domain and CC0 Playing Cards (blauwe achterkant)',
    license: 'CC0-1.0',
  };
  // Hoge precisie: de rozet in het midden zit in een klein coördinatenstelsel dat sterk wordt opgeschaald.
  writeTheme(theme, optimize(source, { ...svgoConfig, floatPrecision: 3 }).data);
  fs.copyFileSync(path.join(agDir, 'LICENSE'), path.join(outRoot, 'traditional', 'LICENSE.txt'));
  console.log(`traditional: ${fs.statSync(path.join(outRoot, 'traditional', 'back.svg')).size} bytes`);
}

// De index: elke map met een manifest.json, in een vaste volgorde (de standaard, dobbelstenen, eerst).
const ORDER = ['dice', 'chaos-fractals', 'maastricht', 'scouting', 'traditional'];
const themes = fs
  .readdirSync(outRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(outRoot, entry.name, 'manifest.json')))
  .map((entry) => entry.name)
  .sort((a, b) => (ORDER.indexOf(a) + 100) % 100 - (ORDER.indexOf(b) + 100) % 100 || a.localeCompare(b));
fs.writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify({ themes }, null, 2) + '\n');
