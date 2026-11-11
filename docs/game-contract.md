# Spelcontract

Elke game implementeert `Dg\Games\Game` (`api/src/Games/Game.php`). Het platform (lobby's, bots, chat, polling, reconnect) kent alleen dit contract.

## Uitgangspunten

- **Server is gezaghebbend.** `apply()` valideert elke zet; de browser wordt nooit vertrouwd.
- **Verborgen informatie.** De volledige staat blijft op de server; spelers krijgen alleen `view($state, $seatNo)`. Een game mag in `view()` nooit informatie van andere spelers meegeven (handkaarten, trekstapel).
- **Gelijktijdige beurten.** `activeSeats()` geeft alle plaatsen die nu mogen zetten (één bij een gewone beurt, meer bij bijvoorbeeld Take-5 of Blufpoker).
- **Staat = JSON.** Gewone arrays van JSON-waarden, als JSON bewaard in `game_states.state`. `apply()` is zuiver: het geeft een nieuwe staat terug.
- **Realtime** (snelle Jewel Match) valt buiten dit contract en wordt bij die game apart besloten.
- **Plaatsnummers** komen uit de lobby en zijn niet per se opeenvolgend (0, 2, 3 is mogelijk).

## Methoden

| Methode | Doel |
| --- | --- |
| `slug()`, `minPlayers()`, `maxPlayers()` | Identiteit en aantal spelers |
| `settingsSchema()` | Beschrijft de instellingen zodat de lobby ze generiek toont (type `choice`) |
| `normalizeSettings()` | Valideert en normaliseert instellingen; gooit `InvalidArgumentException` |
| `start($seatNos, $settings, $rng)` | Beginstaat |
| `view($state, $seatNo)` | Staat zoals die speler hem mag zien |
| `activeSeats($state)` | Plaatsen die nu mogen zetten; leeg als het spel afgelopen is |
| `apply($state, $seatNo, $move, $rng)` | Nieuwe staat, of `InvalidMove` met een melding voor de speler |
| `outcome($state)` | `null` tijdens het spel; daarna `['winners' => [seatNo, ...]]` (leeg = gelijkspel) |
| `botMove($state, $seatNo, $level, $rng)` | Zet van een bot, niveau 1 (zwak) t/m 10 (sterk); moet altijd geldig zijn |

Toeval komt uit `Dg\Games\Rng` zodat tests een vaste reeks kunnen gebruiken.

## Zetlog, vrije zetten en klok (optioneel: `EventedGame`)

Een game die spelers elkaars zetten laat zien (bijvoorbeeld welke kaart er gewisseld is), of acties buiten de beurt toestaat, implementeert `Dg\Games\EventedGame` (`api/src/Games/EventedGame.php`) in plaats van alleen `Game`. Bestaande games zoals Tic-Tac-Toe hoeven niets te veranderen.

| Methode | Doel |
| --- | --- |
| `startStep($seatNos, $settings, $rng, $nowMs)` | Zoals `start()`, plus de gebeurtenissen van het delen of de opstelling (`GameStep`) |
| `applyStep($state, $seatNo, $move, $rng, $nowMs)` | Zoals `apply()`, plus de gebeurtenissen van deze zet (`GameStep`) |
| `isFreeMove($state, $move)` | Is dit een **vrije zet**: niet aan de beurt gebonden? |

`start()` en `apply()` blijven verplicht: geef daar het `->state` van de stap terug.

- **Zetlog.** Elke stap levert gebeurtenissen: arrays van JSON-waarden met een `type`. Het platform bewaart ze in `game_events` met een oplopend volgnummer `seq` per lobby, en stuurt de laatste 100 mee in de lobbyview als `events` (oudere dan de laatste 500 worden opgeruimd). Een rematch begint met een lege log. Bots spelen op de server direct door; hun zetten staan in volgorde in de log, en de client speelt ze met een pauze af (zie `GameEventFeed`).
- **Alleen publiek.** Iedere speler krijgt de hele log. Zet er dus nooit informatie in die een speler niet mag zien (dichte kaarten van anderen, de trekstapel). Wat alleen jij mag zien, hoort in `view()`.
- **Vrije zetten.** Is `isFreeMove()` waar, dan controleert het platform niet of de speler aan de beurt is (`activeSeats()` blijft over de gewone beurt gaan). De game valideert zelf wie dat mag en hoe vaak, en gooit `InvalidMove` bij een ongeldige zet. Na afloop (lobby niet meer `playing`) wijst het platform elke zet af.
- **Klok.** `$nowMs` is de servertijd in milliseconden (Unix-tijd). Bewaar een tijdstempel in de staat om een rate limit te bewaken; `applyStep()` blijft daarmee zuiver. Tests geven `LobbyService` een eigen klok mee (laatste parameter).

`api/tests/Games/CounterGame.php` is een minimale voorbeeldgame, en `api/tests/EventLogTest.php` laat zien hoe je dit test.

## Instellingen en vertalingen

Elk veld in `settingsSchema()` is `['key', 'type' => 'choice', 'default', 'choices']`. De frontend toont het veld met de vertaalsleutels `game.<slug>.setting.<key>` en `game.<slug>.setting.<key>.<keuze>`.

## Frontend

De component van een game staat in `src/app/games/<slug>/` en wordt lazy geladen via `GAME_COMPONENTS` (`games/game-components.ts`). De `GameStage` van het platform rendert hem met `NgComponentOutlet` en geeft **alle** velden van `GameComponentInputs` mee als inputs. De component moet dus voor elk veld een `input()` met dezelfde naam declareren, ook als hij er een niet gebruikt (anders geeft Angular NG0303):

| Input | Betekenis |
| --- | --- |
| `view` | Jouw kijk op het spel, zoals `Game::view()` hem geeft |
| `seats` | Alle plaatsen (naam, soort mens/bot, bot-niveau, weg) |
| `mySeatNo` | Jouw plaatsnummer |
| `activeSeats` | Plaatsen die nu mogen zetten (voor "jouw beurt") |
| `result` | Null tijdens het spel, daarna `{ winners: [...] }` |
| `events` | De zetlog (`GameEvent[]`, oplopend op `seq`); leeg bij games zonder zetlog. Speel ze af met `GameEventFeed` (`core/games/game-event-feed.ts`) |
| `disabled` | True terwijl een zet onderweg is of het spel afgelopen is |
| `submit` | `(move) => Promise<void>`: stuurt een zet; de server valideert en antwoordt met de nieuwe staat |

De stage toont zelf de beurtmelding, de uitslag en "nog een keer"; de game-component tekent alleen het spelbord.

## Spelverloop op het platform

0. **Ready:** elke mens meldt zich ready (bots zijn altijd ready), ook de beheerder. Een beheerder kan een **ready-check** doen: iedereen krijgt een popup met wie wel en niet ready is, en wie nog niet ready is kan zich daar ready melden. Zijn alle mensen ready, dan is een ready-check niet meer mogelijk en kan de beheerder starten. Starten zonder dat iedereen ready is geeft `not_ready`. Na een rematch begint iedereen weer als niet ready.
1. De maker of een beheerder start met `POST /lobbies/{code}/start` (genoeg spelers, bots tellen mee). De lobby gaat op `countdown` (3 seconden).
2. De eerstvolgende poll na afloop zet het spel in gang: `Game::start()`, en bots die als eerste aan de beurt zijn spelen meteen. Zo blijft het werken als een telefoon slaapt.
3. Een speler zet met `POST /lobbies/{code}/move`. De game valideert (`InvalidMove` geeft 422), daarna spelen bots op de server tot een mens aan de beurt is.
4. Geeft `outcome()` een uitslag, dan gaat de lobby op `finished`. De maker kan met `POST /lobbies/{code}/rematch` dezelfde spelers terugzetten naar wachten.

## Wegvallen en terugkomen

- Elke poll telt als heartbeat. Zonder heartbeat voor 15 seconden is een speler **weg**; zodra hij weer pollt is hij **terug**. Het spel wacht zonder tijdslimiet en iedereen ziet wie er weg is.
- Wie een plaats terug wil, komt terug via het **geheime plaats-token** dat de browser per lobby bewaart. Is dat token kwijt (opslag gewist, andere browser), dan is de plaats verloren: er is geen herstel op naam en code, want dan kan iedereen een plaats overnemen.
- **Beheerders** (maker en gepromoveerde spelers) kunnen een weggevallen speler laten **vervangen door een bot** of het spel **beëindigen**. De bot neemt plaats en hand over en speelt meteen door als hij aan de beurt is; de beheerder kiest het niveau. De eerste actie wint: een tweede beheerder krijgt "deze speler is niet meer weg".
- Is de maker weg, dan beslissen de aanwezige gepromoveerde spelers; zijn die er ook niet, dan de eerste aanwezige speler in de rij. Komt de maker terug, dan is het beheer weer bij hem.
- Wordt de maker zelf door een bot vervangen, dan gaat de maker-rol naar de eerste mens in de rij.
- Een beëindigd spel (`ended`) kan met een rematch opnieuw beginnen. Een speler die de pagina verlaat tijdens een spel telt als weg.

## Een nieuwe game toevoegen

1. Maak `api/src/Games/<Naam>.php` die `Game` implementeert en voeg hem toe aan `GameRegistry::default()`.
2. Maak een testklasse die `GameContractTestCase` uitbreidt (alleen `game()` is verplicht) en voeg regeltests toe. De contracttest speelt voor elk botniveau een heel spel met alleen geldige zetten.
3. Maak de frontend in `src/app/games/<slug>/`, registreer hem in `GAME_COMPONENTS` en zet `playable: true` in `core/games/game-catalog.ts`. Voeg de vertalingen toe: `game.<slug>.setting.*` voor instellingen.

Optioneel per game:

- **Ondertitel op de tegel:** voeg `game.<slug>.subtitle` toe aan beide vertaalbestanden (bijvoorbeeld `31-en` met "Eenendertigen").
- **Voorkeuren per speler in de lobby:** registreer een component zonder inputs in `GAME_PREFERENCES` (`games/game-components.ts`). De lobby toont hem onder de instellingen. De component bewaart de keuze zelf (localStorage); er gaat niets naar de server.
- **Zetlog en vrije zetten:** zie hierboven (`EventedGame`).

Tic-Tac-Toe (`TicTacToe.php`) is de referentie-implementatie.
