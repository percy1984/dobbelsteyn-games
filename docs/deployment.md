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
3. Maak het schema aan: importeer `games/api/migrations/0001_initial_schema.sql` via phpMyAdmin (de migratie via de command line, `php api/bin/migrate.php`, werkt alleen met SSH-toegang). Volgende migraties importeer je op volgorde.

Een nieuwe deploy overschrijft `config.php` niet, want dat bestand staat niet in het pakket.

## Een deploy uitvoeren

1. `npm run deploy:package` bouwt met `base href /games/` en zet precies wat op de server hoort in `dist/deploy/`. Het script weigert als er `config.php`, `vendor/` of tests in het pakket zitten.
2. Upload `dist/deploy/` naar `games/`:
   - De uploadsleutels komen uit de Hostinger-operatie `hosting_files_generate-upload-url`. Zet ze in `DG_UPLOAD_URL`, `DG_AUTH` en `DG_AUTH_REST`. Ze zijn tijdelijk en horen niet in git.
   - Draai `scripts/upload-tus.sh`. Het uploadt alleen naar `games/`: eerst de `.htaccess`-bestanden, dan de rest, en als laatste `index.html`.
3. Controleer na afloop:
   - `/games/` geeft de app; een deep link zoals `/games/lobby/ABCD` geeft ook `index.html` (geen 404).
   - `/games/api/health` geeft JSON. Zonder `config.php` is dat `{"error":"Interne fout."}` met status 500. Mét een goede database `{"status":"ok"}`.
   - `/games/api/config.php`, `/games/api/migrations/0001_initial_schema.sql`, `/games/api/src/Config.php` en `/games/api/migrations/` geven 403.

## Waarom niet de standaard-deploytools van Hostinger

`hosting_deploy` en de Git-deploy van Hostinger werken op het hele domein en overschrijven of klonen de site-inhoud. Dat zou de bestaande site beschadigen. Daarom uploaden we bestand voor bestand naar `games/`.

## Een ander pad of domein

De build staat vast op `--base-href /games/`. Voor een ander pad: `npx ng build --base-href /ander/pad/`. De API is pad-onafhankelijk.
