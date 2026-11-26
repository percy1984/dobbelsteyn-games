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

- Routes: `/games/drie-op-een-rij` (start), `/spel?seed=<bordnummer>&level=<n>` (het spel), `/uitleg` (Hoe werkt het?).
- De `GameStore` draait een requestAnimationFrame-lus met vaste tijdstap (60 ticks per seconde, accumulator) en stopt zodra het bord in rust is. De UI tekent stukken op hun engine-positie; CSS-animaties zijn alleen cosmetisch.
- Het bord is een grid van knoppen met een label per vakje ("rij 3, kolom 5, rode cirkel, gouden vakje"). Klikken, slepen of swipen; pijltjestoetsen plus Enter of spatie. Esc pauzeert.
- Meldingen gaan via een rustige aria-live-regio. Bij `prefers-reduced-motion` vallen alleen gloed en pop weg; bewegingsduren in de engine blijven gelijk.
- De tekeningen maakt `scripts/generate-drie-op-een-rij-svgs.mjs` (zelf getekend, uitvoer gecommit). Elke steensoort heeft een eigen vorm én kleur.

## Getallen aanpassen

Alle getallen staan in `engine/config.ts`: animatieduren per snelheid, score, bordgrenzen, moeilijkheid, hoeveel goud, beurten en tijd per level.

## Een spelelement toevoegen

1. Schrijf een `MechanicModule` in `engine/mechanics/` (`place`, `onHit`, `afterTick`, `onTurnEnd`, `loseCheck`; alles optioneel).
2. Zet hem in `MODULES` (`engine/mechanics/index.ts`). Pas dan komt het element in levels voor.
3. Voeg tests toe. De naam en uitleg staan al in `i18n/nl.ts` en `i18n/en.ts`.

Het register zelf verandert niet: de volgorde en `bitIndex` liggen vast vanwege gedeelde bordnummers.

## Bordnummers

`v1-<seed>`. Level k gebruikt de seed `<seed>:<k>`; daaruit komen aparte deelreeksen (`layout`, `bord`, `spawn:<r>:<c>`, `schudden`, ...). Verandert de uitvoer van de generator, dan gaat `GENERATOR_VERSION` omhoog. Snapshot-tests in `level-generator.spec.ts` bewaken dat.
