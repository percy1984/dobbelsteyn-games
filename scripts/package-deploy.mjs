// Stelt de map `dist/deploy/` samen: precies wat in de submap `games/` op de server moet komen.
//   - de gebouwde Angular-app (inclusief .htaccess voor deep links) in de root van de map
//   - de PHP-API in `api/`, zonder config.php, vendor, tests en dev-bestanden
// Draai via `npm run deploy:package` (bouwt eerst met base href /games/).

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const browserDir = join(root, 'dist', 'dobbelsteyn-games', 'browser');
const apiDir = join(root, 'api');
const outDir = join(root, 'dist', 'deploy');

if (!existsSync(join(browserDir, 'index.html'))) {
  console.error('Geen build gevonden. Draai eerst `npm run build:games`.');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1. De Angular-app.
cpSync(browserDir, outDir, { recursive: true });
// Zeker weten dat de .htaccess erbij zit, ook als de build verborgen bestanden overslaat.
cpSync(join(root, 'public', '.htaccess'), join(outDir, '.htaccess'));

// 2. De API: alleen wat op de server nodig is.
const apiAllowed = new Set(['index.php', '.htaccess', 'config.example.php', 'src', 'bin', 'migrations']);
mkdirSync(join(outDir, 'api'), { recursive: true });
for (const entry of readdirSync(apiDir)) {
  if (apiAllowed.has(entry)) {
    cpSync(join(apiDir, entry), join(outDir, 'api', entry), { recursive: true });
  }
}

// 3. Veiligheidscontrole: geheimen mogen nooit in het pakket zitten.
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full) : files.push(relative(outDir, full).split(sep).join('/'));
  }
})(outDir);

const forbidden = files.filter((f) => /(^|\/)(config\.php|vendor\/|tests\/|\.env)/.test(f));
if (forbidden.length > 0) {
  console.error('Pakket bevat verboden bestanden:', forbidden);
  process.exit(1);
}
if (!files.includes('.htaccess') || !files.includes('api/.htaccess')) {
  console.error('Pakket mist een .htaccess.');
  process.exit(1);
}

console.log(`Pakket klaar in dist/deploy/ (${files.length} bestanden):`);
files.sort().forEach((f) => console.log('  ' + f));
