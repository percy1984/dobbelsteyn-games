# Deployment naar Hostinger

De site draait op `https://www.dobbelsteyn.nl/games/`. Alleen de submap `games/` is van dit project. De rest van `dobbelsteyn.nl` (bijvoorbeeld de map `game`) werkt al en wordt nooit aangeraakt.

## Wat komt waar

```
public_html/games/
  index.html, *.js, *.css, favicon.ico   gebouwde Angular-app
  .htaccess                              rewrite voor deep links + beveiliging
  api/
    index.php, .htaccess                 PHP-API
    config.php                           ALLEEN op de server, zelf aangemaakt (zie hieronder)
    config.example.php                   sjabloon
    src/ bin/ migrations/                code en schema (elk met een eigen .htaccess)
```

`config.php`, `vendor/` en `tests/` zitten nooit in het pakket.

## Eenmalig instellen (door Percy, in hPanel)

1. Maak een lege MySQL-database met een gebruiker aan (Databases, MySQL-databases).
2. Maak via de bestandsbeheerder het bestand `public_html/games/api/config.php` aan op basis van `config.example.php`. Gebruik host `127.0.0.1`, port `3306` en de gegevens uit stap 1, en laat `debug` op `false`.
3. Zet een geheim token in `config.php`: `'migrate_token' => '<minstens 32 willekeurige tekens>'`. Hetzelfde token zet je lokaal in `.env.deploy` (zie `.env.deploy.example`; dat bestand staat in `.gitignore`). Zonder token staat het migratie-endpoint uit.

Het schema hoef je niet met de hand aan te maken: het uploadscript draait na elke deploy de migraties (zie "Automatische migraties").

Een nieuwe deploy overschrijft `config.php` niet, want dat bestand staat niet in het pakket.

## Een deploy uitvoeren

1. `npm run deploy:package` bouwt met `base href /games/` en zet precies wat op de server hoort in `dist/deploy/`. Het script weigert als er `config.php`, `vendor/` of tests in het pakket zitten.
2. Upload `dist/deploy/` naar `games/`:
   - De uploadsleutels komen uit de Hostinger-operatie `hosting_files_generate-upload-url`. Zet ze in `DG_UPLOAD_URL`, `DG_AUTH` en `DG_AUTH_REST`. Ze zijn tijdelijk en horen niet in git.
   - Draai `scripts/upload-tus.sh`. Het uploadt alleen naar `games/`: eerst de `.htaccess`-bestanden, dan de rest, en als laatste `index.html`. Daarna roept het `POST /api/migrate` aan, dat alle nog niet uitgevoerde migraties draait (en niets doet als alles al is gedraaid).
3. Controleer na afloop:
   - `/games/` geeft de app; een deep link zoals `/games/lobby/ABCD` geeft ook `index.html` (geen 404).
   - `/games/api/health` geeft JSON. Zonder `config.php` is dat `{"error":"Interne fout."}` met status 500. Mét een goede database `{"status":"ok"}`.
   - `/games/api/config.php`, `/games/api/migrations/0001_initial_schema.sql`, `/games/api/src/Config.php` en `/games/api/migrations/` geven 403.

## Automatische migraties

Migraties zijn genummerde SQL-bestanden in `api/migrations/`. `POST /api/migrate` voert die uit die nog niet in `schema_migrations` staan, op volgorde.

- **Uit tenzij ingesteld:** zonder `migrate_token` (minstens 32 tekens) in `config.php` geeft het endpoint 404.
- **Token in een header** (`X-Migrate-Token`), nooit in de URL, zodat het niet in serverlogs belandt. Vergelijking in constante tijd; een foute poging wordt vertraagd en gelogd (403).
- **Geen dubbele runs:** een databaseslot voorkomt twee migraties tegelijk (409).
- **Mislukt een migratie** dan antwoordt het endpoint 500 met de databasemelding (alleen voor wie het token heeft) en wordt die migratie niet als uitgevoerd geregistreerd. Schrijf migraties daarom opnieuw uitvoerbaar (`CREATE TABLE IF NOT EXISTS`), zodat een run die halverwege stopt veilig opnieuw kan.
- **Handmatig aanroepen:** `curl -X POST -H "X-Migrate-Token: <token>" https://<site>/games/api/migrate`.
- **Token roteren:** zet een nieuwe waarde in `config.php` op de server en in `.env.deploy`.

## Rooktest na een deploy

`scripts/e2e-smoke.cjs` laat twee spelers in twee echte browsers (mobiel formaat) een heel spel spelen: lobby maken, joinen via de link, starten met aftelling, spelen, chat, uitslag, rematch. Het faalt bij elke console- of paginafout.

```bash
npm install --no-save puppeteer-core
node scripts/e2e-smoke.cjs https://www.dobbelsteyn.nl/games/
SHOTS_DIR=screenshots node scripts/e2e-smoke.cjs http://localhost:4200/   # met screenshots, tegen npm start
```

## Opruimen en misbruikbescherming

- **Opruimen:** een wachtkamer of afgelopen spel waar al 30 minuten geen mens meer een heartbeat gaf, verdwijnt (inclusief plaatsen, chat en spelstaat). Een lopend spel wacht langer (24 uur) op spelers die weg zijn. Er is geen cron nodig: het draait hooguit eens per minuut mee met een gewoon verzoek (lobby aanmaken, lijst ophalen) en ruimt ook oude tellers op.
- **Rate limiting** (tabel `rate_limits`, vaste tijdvensters, ruim afgesteld omdat collega's één IP delen): lobby's aanmaken 20 per uur per IP, joinen 30 per minuut per IP, de lijst 600 per minuut per IP, chat 8 berichten per 10 seconden per speler. Het raden van een PIN wordt afgeremd: 10 foute pogingen per client en 30 per lobby per 10 minuten, ook bij de juiste PIN daarna. Een overschrijding geeft 429. Polls zijn niet begrensd (goedkoop, en veel spelers delen een IP).
- **Plafond:** maximaal 500 lobby's tegelijk (daarboven 503 "server druk"). Een verzoek mag maximaal 16 KB zijn (anders 413). Namen zijn 1 tot 20 tekens en chat 1 tot 300 tekens, zonder stuurtekens of onzichtbare tekens.
- **IP-adres:** achter een CDN/proxy nemen we het laatste adres uit `X-Forwarded-For` (door de proxy zelf toegevoegd), anders `REMOTE_ADDR`. Dat is niet volledig vervalsingsbestendig; verifieer op de echte host welke header Hostinger meegeeft. Het IP staat alleen als hash in een tellernaam.
- De grenzen staan in `api/src/Limits.php` en de opruimtijden in `api/src/Lobbies/Cleanup.php`.

## Waarom niet de standaard-deploytools van Hostinger

`hosting_deploy` en de Git-deploy van Hostinger werken op het hele domein en overschrijven of klonen de site-inhoud. Dat zou de bestaande site beschadigen. Daarom uploaden we bestand voor bestand naar `games/`.

## Een ander pad of domein

De build staat vast op `--base-href /games/`. Voor een ander pad: `npx ng build --base-href /ander/pad/`. De API is pad-onafhankelijk.
