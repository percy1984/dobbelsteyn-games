/**
 * Controleert dat de build geen verwijzingen naar andere domeinen bevat (geen CDN, analytics of
 * externe scripts). Gebruik: node scripts/check-external-urls.mjs [map]   (standaard de build-map)
 *
 * Toegestaan zijn alleen strings die nooit een verzoek doen: XML-namespaces in SVG en Angular, een
 * link naar de Angular-documentatie in foutmeldingen, en de vaste basis die Angular gebruikt om
 * URL's te parsen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.argv[2] ?? 'dist/dobbelsteyn-games/browser';
const ALLOWED = [/^http:\/\/www\.w3\.org\//, /^https:\/\/angular\.dev\//, /^http:\/\/fake$/];
// Alleen bestanden die zelf iets laden; JSON-manifesten bevatten bronvermeldingen (links), geen verzoeken.
const EXTENSIONS = new Set(['.js', '.css', '.html', '.svg']);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'api') yield* files(path);
    } else if (EXTENSIONS.has(extname(name))) {
      yield path;
    }
  }
}

const found = [];
for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)<>]*/gi)) {
    const url = match[0];
    // Protocol-relatieve "//iets.iets" komt in minified JS ook voor als commentaar of regex; alleen echte http(s) telt.
    if (!/^https?:/i.test(url)) continue;
    if (!ALLOWED.some((re) => re.test(url))) {
      found.push(`${file}: ${url}`);
    }
  }
}

if (found.length > 0) {
  console.error(`Externe verwijzingen gevonden (${found.length}):`);
  for (const line of found.slice(0, 50)) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`Geen externe verwijzingen in ${root}.`);
