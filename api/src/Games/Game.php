<?php

declare(strict_types=1);

namespace Dg\Games;

/**
 * Het contract waar elke game aan voldoet. Het platform (lobby's, bots, chat, polling) kent alleen
 * dit contract en weet niets van de regels van een specifieke game.
 *
 * Uitgangspunten:
 *  - De server is gezaghebbend: `apply()` valideert elke zet, de browser wordt nooit vertrouwd.
 *  - De volledige staat (`$state`) blijft op de server. Spelers krijgen alleen `view()`, zodat
 *    verborgen informatie (eigen handkaarten, de trekstapel) nooit naar de verkeerde speler lekt.
 *  - Beurten kunnen gelijktijdig zijn: `activeSeats()` geeft *alle* plaatsen die nu mogen zetten
 *    (één bij een gewone beurt, meerdere bij bijvoorbeeld Take-5 of Blufpoker).
 *  - De staat is een gewone array van JSON-waarden (`json_encode`-baar) en wordt als JSON bewaard.
 *  - Functies zijn zuiver: `apply()` verandert de meegegeven staat niet maar geeft een nieuwe terug.
 *  - Realtime games (snelle Jewel Match) vallen buiten dit contract en worden apart besloten.
 *
 * Plaatsen (`seatNo`) zijn de nummers uit de lobby; ze zijn niet per se opeenvolgend.
 */
interface Game
{
    /** Unieke naam in kleine letters met streepjes, gelijk aan de route, bijvoorbeeld `tic-tac-toe`. */
    public function slug(): string;

    public function minPlayers(): int;

    public function maxPlayers(): int;

    /**
     * Beschrijft de instellingen zodat de lobby ze generiek kan tonen. Elk veld:
     * ['key' => string, 'type' => 'choice', 'default' => string, 'choices' => list<string>].
     * De vertalingen staan in de frontend onder `game.<slug>.setting.<key>` en
     * `game.<slug>.setting.<key>.<keuze>`.
     *
     * @return list<array{key: string, type: string, default: string, choices: list<string>}>
     */
    public function settingsSchema(): array;

    /**
     * Valideert en normaliseert instellingen (onbekende sleutels vallen weg, ontbrekende krijgen de
     * standaardwaarde).
     *
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     * @throws \InvalidArgumentException bij een ongeldige waarde
     */
    public function normalizeSettings(array $settings): array;

    /**
     * Maakt de beginstaat.
     *
     * @param list<int> $seatNos plaatsen die meedoen, oplopend gesorteerd
     * @param array<string, mixed> $settings genormaliseerde instellingen
     * @return array<string, mixed> volledige, gezaghebbende staat
     */
    public function start(array $seatNos, array $settings, Rng $rng): array;

    /**
     * De staat zoals één speler hem mag zien. Mag geen verborgen informatie van anderen bevatten.
     *
     * @param array<string, mixed> $state
     * @return array<string, mixed>
     */
    public function view(array $state, int $seatNo): array;

    /**
     * Plaatsen die nu een zet mogen doen. Leeg als het spel afgelopen is.
     *
     * @param array<string, mixed> $state
     * @return list<int>
     */
    public function activeSeats(array $state): array;

    /**
     * Voert een zet uit en geeft de nieuwe staat terug.
     *
     * @param array<string, mixed> $state
     * @param array<string, mixed> $move
     * @return array<string, mixed>
     * @throws InvalidMove als de zet niet mag
     */
    public function apply(array $state, int $seatNo, array $move, Rng $rng): array;

    /**
     * Null zolang het spel loopt. Anders de uitkomst: `winners` bevat de winnende plaatsen
     * (leeg bij gelijkspel).
     *
     * @param array<string, mixed> $state
     * @return array{winners: list<int>}|null
     */
    public function outcome(array $state): ?array;

    /**
     * Een zet van een bot voor deze plaats. Niveau 1 (zwakst) tot en met 10 (sterkst). De zet moet
     * altijd geldig zijn voor `apply()`. Het platform levert niveau en aanroep; de invulling per
     * niveau hoort bij de game.
     *
     * @param array<string, mixed> $state
     * @return array<string, mixed>
     */
    public function botMove(array $state, int $seatNo, int $level, Rng $rng): array;
}
