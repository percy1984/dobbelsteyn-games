# Drie op een rij

Een rustig match-3-spel voor één speler (issue #29). Het draait helemaal in de browser, zonder lobby en zonder server. Ontwerp en besluiten: `docs/superpowers/specs/2026-11-16-drie-op-een-rij-design.md`.

## Mappen (`src/app/games/drie-op-een-rij/`)

| Map | Inhoud |
| --- | --- |
| `engine/` | De spelmotor: puur TypeScript, zonder Angular, deterministisch. |
| `engine/mechanics/` | Register `MECHANICS` (alle 25 spelelementen) en één module per gebouwd element. |
| `rng/` | Seeded generator (sfc32 + cyrb128) en bordnummers (`v1-<seed>`). |
| `level/` | Level- en bordgenerator. |
| `i18n/` | NL- en EN-teksten van het spel (`GameTexts` volgt de taalkeuze van het platform). |
| `themes/` | Themamanifesten (alleen data). Afbeeldingen in `public/games/drie-op-een-rij/themes/<thema>/`. |
| `settings/` | `GameSettings`, `DEFAULT_SETTINGS` en de presets. |
| `storage/` | localStorage zonder fouten (valt terug op geheugen). |
| `ui/` | Startscherm, spelpagina, bord, HUD, uitlegkaarten. |
| `game-store.ts` | Signals plus de requestAnimationFrame-lus met vaste tijdstap. |

Een lint-regel verbiedt `Math.random`, `Date`, timers en Angular-imports in `engine/`, `rng/` en `level/`.

## Engine in het kort

- `createGame(generateLevel(params), options)` maakt de beginstate. Die is gewone JSON.
- `step(state)` zet de simulatie één tick verder (60 per seconde) en geeft `{ state, events }`.
- `applyAction(state, action)` verwerkt een wissel op de huidige tick en geeft `{ state, result, events }`. `result` is `accepted` of `rejected` met een reden.
- Een stuk staat logisch altijd in zijn vakje. `offR`/`offC` (in duizendsten van een vakje) is de zichtbare verschuiving; de UI tekent die rechtstreeks.
- Volgorde binnen een tick: bewegingen, zwaartekracht en aanvullen, spelelementen, matches (alleen onder stabiele stenen), doelen, tijd, en bij stilstand het beurteinde of het rustmoment.
- Bij een rustmoment: uitslag, controle op zetten (anders schudden), vergrendeling eraf.

## Spelen in de browser

- Routes: `/games/drie-op-een-rij` (start en instellingen), `/spel?seed=<bordnummer>&level=<n>&...` (het spel), `/uitleg` (Hoe werkt het?), `/credits`.
- De `GameStore` draait een requestAnimationFrame-lus met vaste tijdstap (60 ticks per seconde, accumulator) en stopt zodra het bord in rust is. De UI tekent stukken op hun engine-positie; CSS-animaties zijn alleen cosmetisch.
- Het bord is een grid van knoppen met een label per vakje ("rij 3, kolom 5, rode cirkel, gouden vakje"). Klikken, slepen of swipen; pijltjestoetsen plus Enter of spatie. Esc pauzeert.
- Knop "Groot scherm" (in de HUD): de HUD wordt een smalle balk, de bovenbalk van de site verdwijnt en waar de browser het toestaat gaat de pagina schermvullend (Fullscreen API; op de iPhone alleen de grote weergave). De keuze staat in localStorage onder `grootScherm`.
- Meldingen gaan via een rustige aria-live-regio. Bij `prefers-reduced-motion` vallen alleen gloed en pop weg; bewegingsduren in de engine blijven gelijk.
- De tekeningen maakt `scripts/generate-drie-op-een-rij-svgs.mjs` (zelf getekend, uitvoer gecommit). Elke steensoort heeft een eigen vorm én kleur.

## Assets, credits en self-hosting

- `node scripts/fetch-assets.mjs`: tekent de SVG's opnieuw, kopieert assets van anderen (lijst `EXTERNAL`, nu leeg), optimaliseert alles met SVGO en schrijft `public/games/drie-op-een-rij/CREDITS.md`. De uitvoer wordt gecommit.
- Thema's Halloween, Kerst, Pasen en Dobbelstenen staan klaar als manifest met `todo: true` in `themes/themes.ts` (nog niet te kiezen). Vullen: zie het commentaar boven `todoTheme`.
- Tijdens het spelen gaat er geen verzoek naar een ander domein. `npm run check:external` controleert de build (draait ook in `deploy:package`).
- `public/.htaccess` zet een Content-Security-Policy (`default-src 'self'`, styles ook inline voor Angular, `data:` voor QR-codes). Daarvoor staat critical-CSS-inlining uit in `angular.json`, anders zet de build een inline script in `index.html`.

## Speciale stenen, hamer en modi

- 4 op een rij geeft een bom (3x3), een L- of T-vorm een kruis (rij en kolom), 5 op een rij een kleurenster. Een geraakte speciale steen licht eerst kort op (toestand `ontstekend`, duur `trigger` in `SPEEDS`) en gaat daarna af, zodat een kettingreactie stap voor stap te volgen is. Combinaties: bom + bom 5x5, kruis + bom drie rijen en kolommen, ster + ster het hele bord (`engine/specials.ts`).
- Hamer (`engine/hammer.ts`): de meter vult bij elke match. Niveau 1 ontploft op één vakje, niveau 2 haalt alles in een vakje weg, niveau 3 laat een hele soort verdwijnen. Kost geen beurt.
- Unlocked: elke zet heeft een eigen afhandelingsreeks. De conflictregels staan in `resolve.ts` en `gravity.ts`, met een test per regel in `unlocked.spec.ts`.
- Modi via de URL (`mode=beurten|tijd|ontspannen`, `input=locked|unlocked`). Ontspannen: zet terugnemen naar het laatste rustmoment. Bij Unlocked kunnen dat meerdere zetten zijn; de UI meldt dat vooraf.
- Balans: `level/balance.spec.ts` (overgeslagen) meet hoeveel zetten een testspeler nodig heeft.

## Instellingen, opslag en URL

- `settings/settings.ts`: `GameSettings` (met `schemaVersion`), `DEFAULT_SETTINGS` en de presets. Standaard: Ontspannen, moeilijkheid Uitdagend, Unlocked, spelelementen van Standaard plus het goudzakje (preset "eigen"). `settings/validate.ts`: laden met validatie per veld, migraties per versie (`MIGRATIONS`), presets kiezen en spelelementen aan/uit.
- `SettingsStore` bewaart in localStorage onder `drie-op-een-rij.settings` (300 ms debounce; direct bij de start van een spel). Werkt opslag niet, dan alleen in het geheugen. "Standaardinstellingen herstellen" raakt scores en voortgang niet.
- URL (`settings/url.ts`): `?seed&level&mode&diff&size&kinds&input&mech`, met `mech` als bitmasker in base36. Instellingen uit een link gelden alleen voor dat spel; in het pauzemenu staat dan "Deze instellingen bewaren".
- Het instellingenscherm gebruikt Signal Forms (`settings/lobby-form.ts`); het spelelementenpaneel (`ui/mechanics-panel.ts`) beheert presets en afhankelijkheden zelf.
- Aparte sleutels: `voortgang` (Verder spelen), `highscores` (top 5 per modus × invoer × preset), `gezien` (uitlegkaarten).
- Pauzemenu: thema, Locked/Unlocked (gaat in bij het eerstvolgende rustmoment) en geluid. Geluid: zachte tonen via Web Audio (`sound/sound.ts`), zonder bestanden.

## Alle spelelementen

Alle 25 spelelementen uit de spec zijn gebouwd. Per categorie een bestand in `engine/mechanics/`:

| Bestand | Spelelementen |
| --- | --- |
| `floors.ts`, `treasure.ts`, `fallers.ts` | goud, zilver, verborgen schat, amulet, veer |
| `blockers.ts`, `layers.ts` | ketting, rotsblok, muntblok, altaar, kleurblok, hars, schild, muur |
| `spreaders.ts` | olie, oliebron, goudzakje (spawnen in `gravity.ts`, goud leggen in `resolve.ts`) |
| `flow.ts` | portaal (doorvallen in `gravity.ts`), lopende band |
| `helpers.ts` | stekelbol, pers, waterklok |
| `goals.ts` | reiziger, groot blok (taart, emmer, doos) |
| `lose.ts` | tijdbom, klimmer |

- Portalen, banden en paden van reizigers staan in de state (`portals`, `belts`, `paths`); tijdbommen en klimmers zijn gewone stenen met `mech` en `counter`.
- Getallen (kans op een goudzakje, meters, starttelling tijdbom, emmer en doos) staan in `MECH` in `engine/config.ts`.
- Tests: `engine/mechanics/extra.spec.ts`, met per element een rooktest die twintig zetten speelt zonder vast te lopen.

## Getallen aanpassen

Alle getallen staan in `engine/config.ts`: animatieduren per snelheid, score, bordgrenzen, moeilijkheid, hoeveel goud, beurten en tijd per level.

## Een spelelement toevoegen

1. Schrijf een `MechanicModule` in `engine/mechanics/` (`place`, `onHit`, `afterTick`, `onTurnEnd`, `loseCheck`; alles optioneel).
2. Zet hem in `MODULES` (`engine/mechanics/index.ts`). Pas dan komt het element in levels voor en is de schakelaar in het spelelementenpaneel te gebruiken.
3. Voeg tests toe. De naam en uitleg staan al in `i18n/nl.ts` en `i18n/en.ts`.

Het register zelf verandert niet: de volgorde en `bitIndex` liggen vast vanwege gedeelde bordnummers.

## Bordnummers

`v1-<seed>`. Level k gebruikt de seed `<seed>:<k>`; daaruit komen aparte deelreeksen (`layout`, `bord`, `spawn:<r>:<c>`, `schudden`, ...). Verandert de uitvoer van de generator, dan gaat `GENERATOR_VERSION` omhoog. Snapshot-tests in `level-generator.spec.ts` bewaken dat.
