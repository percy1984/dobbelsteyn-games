<?php

declare(strict_types=1);

namespace Dg\Games;

/**
 * Optionele uitbreiding van `Game` voor spellen waarbij spelers elkaars zetten moeten kunnen zien
 * gebeuren (bijvoorbeeld welke kaart er gewisseld is) en waarin sommige acties niet aan de beurt
 * gebonden zijn. Bestaande games hoeven dit niet te implementeren.
 *
 * Wat het toevoegt:
 *  - **Zetlog.** Elke stap levert gebeurtenissen op. Het platform bewaart ze per lobby met een
 *    oplopend volgnummer en stuurt de laatste mee in de lobbyview. Clients spelen ze in volgorde af.
 *    Bots spelen op de server direct door, de client speelt hun zetten met een pauze af.
 *  - **Vrije zetten.** Een zet die `isFreeMove()` teruggeeft als waar, mag ook buiten de beurt van
 *    de speler (bijvoorbeeld kaarten verplaatsen in je eigen hand). De game valideert zelf wie dat
 *    mag en hoe vaak.
 *  - **Klok.** `$nowMs` is de servertijd in milliseconden (Unix-tijd), zodat de game een rate limit
 *    in de staat kan bewaken en `apply()` toch zuiver blijft.
 *
 * Regels voor gebeurtenissen:
 *  - Ze bevatten alleen publieke informatie. Wat een speler niet mag zien (dichte kaarten van
 *    anderen, de stok) staat er nooit in, want iedere speler krijgt de hele log.
 *  - Het zijn gewone arrays van JSON-waarden met een `type` (string). Het platform voegt zelf het
 *    volgnummer `seq` toe.
 *
 * `Game::start()` en `Game::apply()` blijven verplicht: implementeer ze als `->state` van de stap.
 */
interface EventedGame extends Game
{
    /**
     * Zoals `Game::start()`, plus de gebeurtenissen van het delen of de opstelling.
     *
     * @param list<int> $seatNos
     * @param array<string, mixed> $settings genormaliseerde instellingen
     */
    public function startStep(array $seatNos, array $settings, Rng $rng, int $nowMs): GameStep;

    /**
     * Zoals `Game::apply()`, plus de gebeurtenissen van deze zet.
     *
     * @param array<string, mixed> $state
     * @param array<string, mixed> $move
     * @throws InvalidMove als de zet niet mag
     */
    public function applyStep(array $state, int $seatNo, array $move, Rng $rng, int $nowMs): GameStep;

    /**
     * Is dit een vrije zet: een zet die niet aan de beurt gebonden is? Dan controleert het platform
     * niet of de speler aan de beurt is; de game doet alle validatie in `applyStep()`.
     *
     * @param array<string, mixed> $state
     * @param array<string, mixed> $move
     */
    public function isFreeMove(array $state, array $move): bool;
}
