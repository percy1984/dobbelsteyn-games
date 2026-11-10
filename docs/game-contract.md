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

## Instellingen en vertalingen

Elk veld in `settingsSchema()` is `['key', 'type' => 'choice', 'default', 'choices']`. De frontend toont het veld met de vertaalsleutels `game.<slug>.setting.<key>` en `game.<slug>.setting.<key>.<keuze>`.

## Een nieuwe game toevoegen

1. Maak `api/src/Games/<Naam>.php` die `Game` implementeert en voeg hem toe aan `GameRegistry::default()`.
2. Maak een testklasse die `GameContractTestCase` uitbreidt (alleen `game()` is verplicht) en voeg regeltests toe. De contracttest speelt voor elk botniveau een heel spel met alleen geldige zetten.
3. Maak de frontend in `src/app/games/<slug>/` en zet `playable: true` in `core/games/game-catalog.ts`.

Tic-Tac-Toe (`TicTacToe.php`) is de referentie-implementatie.
