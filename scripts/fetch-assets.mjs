/**
 * Assets van Drie op een rij klaarzetten, helemaal lokaal (geen CDN tijdens het spelen):
 *  1. tekent de eigen SVG's opnieuw (scripts/generate-drie-op-een-rij-svgs.mjs);
 *  2. kopieert assets van anderen uit npm-pakketten of gedownloade repo's (lijst EXTERNAL hieronder;
 *     nu nog leeg, want alle tekeningen zijn eigen werk);
 *  3. optimaliseert alle SVG's met SVGO;
 *  4. schrijft public/games/drie-op-een-rij/CREDITS.md met alle naamsvermeldingen.
 * De uitvoer wordt gecommit, zodat de build offline werkt.   Gebruik: node scripts/fetch-assets.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repo, 'public', 'games', 'drie-op-een-rij');
const themes = join(target, 'themes');

/**
 * Assets van anderen. Per bestand: bron (pad in node_modules of een lokaal gedownloade map), doel
 * (thema/naam.svg) en de naamsvermelding. Voorbeeld voor een toekomstig thema:
 *   { from: 'node_modules/@iconify-json/fluent-emoji-flat/...', to: 'halloween/steen-0.svg',
 *     credit: { asset: 'Pompoen', author: 'Microsoft', license: 'MIT', url: 'https://github.com/microsoft/fluentui-emoji' } }
 * Download nooit tijdens het spelen en gebruik geen api.iconify.design.
 */
const EXTERNAL = [];

/** Eigen werk, per thema. */
const OWN = [
  { theme: 'Basis, Facet en Goudrand', asset: 'Stenen, speciale stenen, hamer en spelelementen (SVG)', author: 'Dobbelsteyn Games', license: 'Eigen werk' },
  { theme: 'Alle thema\'s', asset: 'Geluid (zachte tonen via Web Audio, geen bestanden)', author: 'Dobbelsteyn Games', license: 'Eigen werk' },
];
const FONT = {
  asset: 'Lettertype Atkinson Hyperlegible',
  author: 'Braille Institute of America',
  license: 'SIL Open Font License 1.1',
  url: 'https://brailleinstitute.org/freefont',
};

// 1. Eigen tekeningen.
execFileSync(process.execPath, [join(repo, 'scripts', 'generate-drie-op-een-rij-svgs.mjs')], { stdio: 'inherit' });

// 2. Assets van anderen.
for (const item of EXTERNAL) {
  const from = join(repo, item.from);
  if (!existsSync(from)) {
    console.error(`Ontbreekt: ${item.from} (installeer het pakket of download de repo eerst)`);
    process.exit(1);
  }
  const to = join(themes, item.to);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

// 3. SVGO.
function* svgs(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* svgs(path);
    else if (name.endsWith('.svg')) yield path;
  }
}
let saved = 0;
for (const file of svgs(themes)) {
  const before = readFileSync(file, 'utf8');
  const { data } = optimize(before, { path: file, multipass: true });
  const out = data.endsWith('\n') ? data : `${data}\n`;
  if (out !== before) {
    saved += before.length - out.length;
    writeFileSync(file, out);
  }
}
console.log(`SVGO: ${saved} bytes kleiner.`);

// 4. CREDITS.md
const lines = [
  '# Credits: Drie op een rij',
  '',
  'Gegenereerd door `scripts/fetch-assets.mjs`. Alles staat op deze website zelf; het spel haalt niets van andere websites.',
  '',
  '| Thema | Onderdeel | Maker | Licentie | Bron |',
  '| --- | --- | --- | --- | --- |',
  ...OWN.map((c) => `| ${c.theme} | ${c.asset} | ${c.author} | ${c.license} | |`),
  ...EXTERNAL.map((e) => `| ${dirname(e.to)} | ${e.credit.asset} | ${e.credit.author} | ${e.credit.license} | ${e.credit.url} |`),
  `| Alle thema's | ${FONT.asset} | ${FONT.author} | ${FONT.license} | ${FONT.url} |`,
  '',
];
writeFileSync(join(target, 'CREDITS.md'), lines.join('\n'));
console.log(`Geschreven: ${relative(repo, join(target, 'CREDITS.md'))}`);
