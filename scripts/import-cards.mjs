// Importeert de kaartsets uit de CC0-bronnen naar public/cards/sets, herhaalbaar en zonder de
// originele bestanden te wijzigen. Gebruik:
//
//   node scripts/import-cards.mjs --heratexx <map met de uitgepakte zip> --austingabriel <map met de repo>
//
// Bronnen (allebei CC0, zie public/cards/CREDITS.md):
//   heratexx       https://opengameart.org/sites/default/files/4color_deck_by_heratexx.zip
//   austingabriel  https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards (commit zie SOURCES)
//
// Wat het script doet per kaart:
//   1. Hernoemt naar onze kaart-id: kleur (S H D C) plus rang (2 3 4 5 6 7 8 9 T J Q K A), bijvoorbeeld HT.svg.
//   2. Haalt de rangletters uit de hoeken weg. De UI tekent ze zelf, zodat een speler zijn letterset kan
//      kiezen (J Q K A, B V H A, V D R 1 of B D K A). De kleurtekens blijven staan.
//   3. Austingabriel: kleurt de kleurtekens om naar het vierkleurendeck (klaveren groen, ruiten blauw).
//      De illustraties van de plaatjes blijven ongewijzigd.
//   4. Optimaliseert met SVGO.
//   5. Schrijft per set een manifest.json met de metingen van de weggehaalde index (voor de letterlaag).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'public', 'cards', 'sets');

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

/** Kleuren van het vierkleurendeck van austingabriel: op één plek vastgelegd. Contrast op wit is minimaal 4,5. */
const AG_COLORS = { S: '#111111', H: '#cc0000', D: '#1c3fb7', C: '#1b7a2b' };

/** Kleur van de letters per set (met voldoende contrast op een witte kaart). */
const SETS = {
  heratexx: {
    name: '4-color deck (heratexx)',
    credit: 'heratexx, OpenGameArt.org',
    source: { url: 'https://opengameart.org/sites/default/files/4color_deck_by_heratexx.zip' },
    colors: { S: '#111111', H: '#cc0000', D: '#0000cc', C: '#007000' },
  },
  austingabriel: {
    name: 'Classic faces, four colours (AustinGabriel)',
    credit: 'AustinGabriel, Public Domain and CC0 Playing Cards',
    source: { url: 'https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards' },
    colors: AG_COLORS,
  },
};

const NAMES = { ace: 'A', jack: 'J', queen: 'Q', king: 'K', 10: 'T' };

// --- kleine hulpfuncties voor matrices en paden ----------------------------------------------------

const IDENTITY = [1, 0, 0, 1, 0, 0];
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Leest een transform-attribuut (matrix, translate, scale, rotate). */
function parseTransform(value) {
  let result = IDENTITY;
  for (const [, name, args] of (value ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let m;
    if (name === 'matrix') m = n;
    else if (name === 'translate') m = [1, 0, 0, 1, n[0], n[1] ?? 0];
    else if (name === 'scale') m = [n[0], 0, 0, n[1] ?? n[0], 0, 0];
    else if (name === 'rotate') {
      const a = (n[0] * Math.PI) / 180;
      const r = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
      m = n.length === 3 ? multiply(multiply([1, 0, 0, 1, n[1], n[2]], r), [1, 0, 0, 1, -n[1], -n[2]]) : r;
    } else throw new Error(`Onbekende transform: ${name}`);
    result = multiply(result, m);
  }
  return result;
}

/** Alle punten van een pad (ook stuurpunten van bochten; voor een omhullende is dat ruim genoeg). */
function pathPoints(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const points = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    const take = (count) => {
      const values = [];
      for (let k = 0; k < count; k++) values.push(num());
      return values;
    };
    if (up === 'Z') {
      x = startX;
      y = startY;
      continue;
    }
    if (up === 'H') {
      const [v] = take(1);
      x = rel ? x + v : v;
      points.push([x, y]);
      continue;
    }
    if (up === 'V') {
      const [v] = take(1);
      y = rel ? y + v : v;
      points.push([x, y]);
      continue;
    }
    if (up === 'A') {
      const v = take(7);
      x = rel ? x + v[5] : v[5];
      y = rel ? y + v[6] : v[6];
      points.push([x, y]);
      continue;
    }
    const pairs = { M: 1, L: 1, T: 1, S: 2, Q: 2, C: 3 }[up];
    if (pairs === undefined) throw new Error(`Onbekend padcommando: ${cmd}`);
    for (let k = 0; k < pairs; k++) {
      const [px, py] = take(2);
      const ax = rel ? x + px : px;
      const ay = rel ? y + py : py;
      points.push([ax, ay]);
      if (k === pairs - 1) {
        x = ax;
        y = ay;
      }
    }
    // Relatieve stuurpunten verwijzen naar het beginpunt van het segment; de eindpunten hierboven
    // lopen mee, dus alleen het laatste punt telt voor de positie. Dit is ruim genoeg voor een omhullende.
    if (up === 'M') {
      startX = x;
      startY = y;
      cmd = rel ? 'l' : 'L';
    }
  }
  return points;
}

function bbox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// --- bestandsnamen --------------------------------------------------------------------------------

/** "10 of hearts.svg" wordt HT, "ace of spades.svg" wordt SA. */
function agCardId(file) {
  const m = file.match(/^(\w+) of (hearts|spades|diamonds|clubs)\.svg$/);
  if (!m) return null;
  const rank = NAMES[m[1]] ?? m[1];
  return { H: 'H', S: 'S', D: 'D', C: 'C' }[m[2][0].toUpperCase()] + rank;
}

/** "Jh.svg" wordt HJ, "Td.svg" wordt DT. */
function hxCardId(file) {
  const m = file.match(/^([2-9TJQKA])([shdc])\.svg$/);
  return m ? m[2].toUpperCase() + m[1] : null;
}

// --- bewerking per set ----------------------------------------------------------------------------

/** Heratexx: de rangletter is een <use> van een symbol met id "R...". Weg ermee, de kleurtekens blijven. */
function heratexxPlugin() {
  return {
    name: 'strip-rank-index',
    fn: () => ({
      element: {
        enter(node, parent) {
          const href = node.attributes.href ?? node.attributes['xlink:href'] ?? '';
          const isRankUse = node.name === 'use' && /^#R/.test(href);
          const isRankSymbol = node.name === 'symbol' && /^R/.test(node.attributes.id ?? '');
          if (isRankUse || isRankSymbol) {
            parent.children = parent.children.filter((child) => child !== node);
          }
        },
      },
    }),
  };
}

/** De rangletter van heratexx zit in een vak van 39 hoog op x -120, y -158 (viewBox -120 -167 240 334). */
function heratexxIndexMetrics() {
  // Het symbol heeft viewBox -500 -500 1000 1000 en het vak is 39 hoog: schaal 0,039, links uitgelijnd.
  // De rang "A" loopt in x van -270 tot 270 en in y van -460 tot 460 (de gedeelde glyph-ruimte).
  const scale = 39 / 1000;
  const centerX = -120 + (0 + 500) * scale;
  const top = -158 + 19.5 + -460 * scale;
  const bottom = -158 + 19.5 + 460 * scale;
  return {
    viewBox: [240, 334],
    centerX: (centerX + 120) / 240,
    top: (top + 167) / 334,
    height: (bottom - top) / 334,
  };
}

/**
 * Austingabriel: het kleurteken is één vast pad (komt in alle kaarten van de kleur voor) en de
 * rangletter een pad dat helemaal binnen de hoek ligt. Die laatste halen we weg, de kleurtekens
 * kleuren we om. De metingen van de weggehaalde letters komen in `measured`.
 */
function austinGabrielPlugin(suit, suitPathD, measured) {
  const matrices = [];
  const W = 1500;
  const H = 2100;
  return {
    name: 'ag-recolor-and-strip',
    fn: () => ({
      element: {
        enter(node, parent) {
          const parentMatrix = matrices.at(-1) ?? IDENTITY;
          const matrix = multiply(parentMatrix, parseTransform(node.attributes.transform));
          matrices.push(matrix);
          if (node.name !== 'path' || !node.attributes.d) return;
          const d = node.attributes.d;

          if (d === suitPathD) {
            node.attributes.style = `fill:${AG_COLORS[suit]};`;
            return;
          }
          const pts = pathPoints(d).map((p) => apply(matrix, p));
          const box = bbox(pts);
          // De rangletter ligt links boven (tot ongeveer 13% van de breedte en hoogte) en gespiegeld rechts onder.
          const inTopLeft = box.x1 < W * 0.14 && box.y1 < H * 0.14;
          const inBottomRight = box.x0 > W * 0.86 && box.y0 > H * 0.86;
          const isCard = box.x0 <= 0 && box.y0 <= 0 && box.x1 >= W - 1;
          if (!isCard && (inTopLeft || inBottomRight)) {
            measured.push(inTopLeft ? box : { x0: W - box.x1, x1: W - box.x0, y0: H - box.y1, y1: H - box.y0 });
            parent.children = parent.children.filter((child) => child !== node);
          }
        },
        exit() {
          matrices.pop();
        },
      },
    }),
  };
}

/** Het kleurteken van een kleur: het meest voorkomende pad dat geen wit kaartvlak is. */
function findSuitPath(files, read) {
  const counts = new Map();
  for (const file of files) {
    const source = read(file);
    for (const [, d] of source.matchAll(/<path[^>]*?\sd="([^"]+)"/g)) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  const [best] = [...counts.entries()].filter(([d]) => !/^M750,37\.5/.test(d)).sort((a, b) => b[1] - a[1])[0];
  return best;
}

const svgoConfig = {
  multipass: true,
  floatPrecision: 1,
  plugins: ['preset-default'],
};

function write(dir, id, svg) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.svg`), svg);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// --- hoofdprogramma ------------------------------------------------------------------------------

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const hxDir = arg('heratexx');
const agDir = arg('austingabriel');
if (!hxDir && !agDir) {
  console.error('Geef --heratexx <map> en/of --austingabriel <map> op.');
  process.exit(1);
}

const manifests = {};

if (hxDir) {
  const dir = path.join(outRoot, 'heratexx');
  fs.rmSync(dir, { recursive: true, force: true });
  let count = 0;
  for (const file of fs.readdirSync(hxDir)) {
    const id = hxCardId(file);
    if (!id) continue;
    const result = optimize(fs.readFileSync(path.join(hxDir, file), 'utf8'), { ...svgoConfig, plugins: [heratexxPlugin(), ...svgoConfig.plugins] });
    write(dir, id, result.data);
    count++;
  }
  if (count !== 52) throw new Error(`Heratexx: ${count} kaarten gevonden, verwacht 52.`);
  fs.writeFileSync(
    path.join(dir, 'LICENSE.txt'),
    [
      'Creative Commons CC0 1.0 Universal (Public Domain Dedication)',
      'https://creativecommons.org/publicdomain/zero/1.0/',
      '',
      'Four-colour playing cards by heratexx, published on OpenGameArt.org as CC0 (free for commercial use,',
      'no attribution required). Source: ' + SETS.heratexx.source.url,
      '',
    ].join('\n'),
  );
  manifests.heratexx = { ...SETS.heratexx, license: 'CC0-1.0', index: heratexxIndexMetrics() };
}

if (agDir) {
  const frontsDir = path.join(agDir, 'svg cards', 'card fronts');
  const dir = path.join(outRoot, 'austingabriel');
  fs.rmSync(dir, { recursive: true, force: true });
  const measured = [];
  let count = 0;
  for (const suitName of ['spades', 'hearts', 'diamonds', 'clubs']) {
    const suit = suitName[0].toUpperCase();
    const folder = path.join(frontsDir, suitName);
    const files = fs.readdirSync(folder).filter((f) => agCardId(f));
    const read = (f) => fs.readFileSync(path.join(folder, f), 'utf8');
    const suitPath = findSuitPath(files, read);
    for (const file of files) {
      const before = measured.length;
      const result = optimize(read(file), { ...svgoConfig, plugins: [austinGabrielPlugin(suit, suitPath, measured), ...svgoConfig.plugins] });
      if ((measured.length - before) % 2 !== 0 || measured.length === before) {
        throw new Error(`${file}: verwacht een even aantal weggehaalde rangpaden (links boven en rechts onder), kreeg ${measured.length - before}.`);
      }
      write(dir, agCardId(file), result.data);
      count++;
    }
  }
  if (count !== 52) throw new Error(`Austingabriel: ${count} kaarten gevonden, verwacht 52.`);
  const top = median(measured.map((b) => b.y0));
  const bottom = median(measured.map((b) => b.y1));
  const centerX = median(measured.map((b) => (b.x0 + b.x1) / 2));
  let commit;
  try {
    commit = execFileSync('git', ['-C', agDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    commit = undefined;
  }
  fs.copyFileSync(path.join(agDir, 'LICENSE'), path.join(dir, 'LICENSE.txt'));
  manifests.austingabriel = {
    ...SETS.austingabriel,
    source: { ...SETS.austingabriel.source, commit },
    license: 'CC0-1.0',
    index: { viewBox: [1500, 2100], centerX: centerX / 1500, top: top / 2100, height: (bottom - top) / 2100 },
  };
}

for (const [id, manifest] of Object.entries(manifests)) {
  const dir = path.join(outRoot, id);
  const cards = SUITS.flatMap((s) => RANKS.map((r) => s + r));
  for (const card of cards) {
    if (!fs.existsSync(path.join(dir, `${card}.svg`))) throw new Error(`${id}: ${card}.svg ontbreekt.`);
  }
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ id, ...manifest, cardFile: '{card}.svg' }, null, 2) + '\n',
  );
  console.log(`${id}: 52 kaarten, ${JSON.stringify(manifest.index)}`);
}

// De index van alle sets: elke map met een manifest.json. Een nieuwe set toevoegen is dus een map met
// kaarten en een manifest erbij, zonder codewijziging.
const sets = fs
  .readdirSync(outRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(outRoot, entry.name, 'manifest.json')))
  .map((entry) => entry.name)
  .sort();
fs.writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify({ sets }, null, 2) + '\n');
