# Dobbelsteyn Games

Kaart- en bordspellen om samen te spelen, mobile first. Angular (statische single-page app) met een PHP-API op MySQL. Geen Node.js-server nodig: Node is alleen nodig om te **bouwen**, niet om te draaien.

Het ontwerp staat in [docs/superpowers/specs/2026-11-10-games-platform-design.md](docs/superpowers/specs/2026-11-10-games-platform-design.md). De backlog staat in het GitHub-project "Dobbelsteyn Games".

## Wat er nu is

- Overzichtspagina met tegels voor 17 games (Nederlands en Engels, per speler te wisselen); **Tic-Tac-Toe is speelbaar**, de rest staat als "Binnenkort" tot de regels en ontwerpen er zijn.
- Lobby's per game: aanmaken (openbaar of privé met PIN), joinen met een code of via een QR-link, lijst met spelersaantal en slotje, instellingen, beheerders, bots (niveau 1 t/m 10), start met 3-2-1-aftelling, chat, delen via QR, en wegvallen/terugkomen (wachten, vervangen door een bot, beëindigen).
- PHP-API met MySQL (alleen PHP praat met de database), live updates door pollen, rate limiting en opruimen.
- Het ontwerp staat in [docs/superpowers/specs/2026-11-10-games-platform-design.md](docs/superpowers/specs/2026-11-10-games-platform-design.md); [docs/game-contract.md](docs/game-contract.md) beschrijft hoe een nieuwe game wordt toegevoegd en [docs/deployment.md](docs/deployment.md) de deploy naar Hostinger.

## Vereisten

- Node.js 22.22.3 of hoger (of 24.15+ / 26+), dus niet de oudere 22.x-versies.
- npm (zit bij Node).

## Commando's

| Commando | Doel |
| --- | --- |
| `npm ci` | Dependencies installeren |
| `npm start` | Ontwikkelserver op http://localhost:4200 |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint (angular-eslint) |
| `npm run format` | Prettier over `src/` |
| `npm run build` | Productiebuild met `base href="/"` |
| `npm run build:games` | Productiebuild voor `https://www.dobbelsteyn.nl/games/` |

De build komt in `dist/dobbelsteyn-games/browser/`.

`npm start` stuurt `/api/...` door naar de lokale API in Docker (`proxy.conf.json`, naar `http://localhost:8080/games/api`). Start dus eerst `docker compose up -d` (zie hieronder).

## PHP-API en database (`api/`)

De API is gewone PHP 8.2 zonder framework en zonder runtime-afhankelijkheden (PDO, prepared statements). Alleen PHP praat met MySQL; de browser nooit. Lokaal draait alles in Docker.

```bash
docker compose up -d --build                                    # PHP + Apache op :8080, MySQL op :3307
cp api/config.example.php api/config.php                        # lokaal: vul host "db", db/user/wachtwoord uit docker-compose.yml
docker compose exec web php /var/www/html/games/api/bin/migrate.php   # schema aanmaken
curl http://localhost:8080/games/api/health                     # {"status":"ok"}

docker compose --profile tools run --rm composer install        # eenmalig: PHPUnit
docker compose exec -w /var/www/html/games/api web php vendor/bin/phpunit
```

In Git Bash op Windows worden paden als `/var/www/...` omgezet. Zet dan `MSYS_NO_PATHCONV=1` voor het commando, of gebruik PowerShell.

- **Credentials:** staan alleen in `api/config.php`. Dat bestand staat in `.gitignore` en wordt nooit gecommit. `api/config.example.php` zonder waarden wel. Op Hostinger maak je `config.php` zelf aan op de server (host `127.0.0.1`).
- **Beveiliging:** `api/.htaccess` blokkeert directe toegang tot `config*.php`, `*.sql`, `composer.*` e.d., schakelt mappenlijsten uit en stuurt alles naar `index.php`. `src/`, `bin/`, `migrations/` en `tests/` hebben elk een eigen `.htaccess` (`Require all denied`).
- **Sub-pad:** de router werkt met paden relatief aan de API-map, dus `api/` draait onder elk pad.
- **Migraties:** genummerde SQL-bestanden in `api/migrations/`, eenmalig uitgevoerd door `bin/migrate.php` (alleen via de command line). Op de server draai je dat niet via het web; hoe dat bij deployment gaat, volgt bij het deployment-item.

## Onder een sub-pad draaien

De app gebruikt alleen relatieve links en bevat geen vast adres. Het pad waaronder de app draait, stel je in bij de build via `--base-href`:

```bash
npx ng build --base-href /ander/pad/
```

In Git Bash op Windows wordt `/games/` anders omgezet naar een Windows-pad. Gebruik dan `MSYS_NO_PATHCONV=1` voor het commando, of PowerShell.

Deep links (bijvoorbeeld een lobby-URL) overleven een refresh alleen met een rewrite-regel op de server. Die komt met het deployment-item.

## Kaartsets

De voorkanten van de speelkaarten staan in `public/cards/sets/<set>/` (52 SVG's, `<kleur><rang>.svg`, bijvoorbeeld `HT.svg`) met een `manifest.json` en een licentiebestand. `public/cards/sets/index.json` somt de sets op; de app leest die in (`CardSets`). Credits en licenties staan in `public/cards/CREDITS.md`.

De sets worden gemaakt met een herhaalbaar script, zodat de originele bestanden ongewijzigd blijven:

```bash
node scripts/import-cards.mjs --heratexx <map met de uitgepakte zip> --austingabriel <map met de repo>
```

Het script hernoemt de kaarten, haalt de rangletters uit de hoeken weg (de app tekent die zelf, in de gekozen letterset), kleurt bij austingabriel de kleurtekens om naar het vierkleurendeck, en optimaliseert met SVGO.

**Een nieuwe set toevoegen:** maak `public/cards/sets/<id>/` met 52 SVG's en een `manifest.json` (zie het type `CardSetManifest` in `src/app/games/cards/card.models.ts`) en voeg de naam toe aan `index.json`.

## Structuur

```
src/app/
  core/       gedeelde services en hulpmiddelen (API-client, taal, lobby)
  features/   schermen van het platform (overzicht, lobby, ...)
  games/      één map per game, elk lazy-loaded
```

## Werkwijze

- Elk backlog-item krijgt een eigen branch `issue-<nummer>-<korte-naam>` vanaf `main`.
- Commitberichten beginnen met het issuenummer (`#12 ...`).
- Een pull request sluit het issue (`Closes #12`) en wordt na review gemerged.

Zie `CLAUDE.md` voor de Angular-code-afspraken (standalone, signals, toegankelijkheid).
