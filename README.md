# Dobbelsteyn Games

Kaart- en bordspellen om samen te spelen, mobile first. Angular (statische single-page app) met een PHP-API op MySQL. Geen Node.js-server nodig: Node is alleen nodig om te **bouwen**, niet om te draaien.

Het ontwerp staat in [docs/superpowers/specs/2026-11-10-games-platform-design.md](docs/superpowers/specs/2026-11-10-games-platform-design.md). De backlog staat in het GitHub-project "Dobbelsteyn Games".

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

## Onder een sub-pad draaien

De app gebruikt alleen relatieve links en bevat geen vast adres. Het pad waaronder de app draait, stel je in bij de build via `--base-href`:

```bash
npx ng build --base-href /ander/pad/
```

In Git Bash op Windows wordt `/games/` anders omgezet naar een Windows-pad. Gebruik dan `MSYS_NO_PATHCONV=1` voor het commando, of PowerShell.

Deep links (bijvoorbeeld een lobby-URL) overleven een refresh alleen met een rewrite-regel op de server. Die komt met het deployment-item.

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
