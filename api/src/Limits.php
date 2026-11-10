<?php

declare(strict_types=1);

namespace Dg;

/**
 * De grenzen voor misbruikbescherming. Bewust ruim gekozen: op kantoor zitten veel spelers achter
 * één IP-adres, en het doel is alleen het afremmen van scripts, niet het hinderen van spelers.
 */
final class Limits
{
    public function __construct(
        /** Lobby's aanmaken per IP per uur. */
        public readonly int $createPerHour = 20,
        /** Pogingen om een lobby te joinen per IP per minuut. */
        public readonly int $joinPerMinute = 30,
        /** Keren dat de lobbylijst opgehaald wordt per IP per minuut (de lijst ververst elke 5 s). */
        public readonly int $listPerMinute = 600,
        /** Chatberichten per speler per tijdvenster. */
        public readonly int $chatMessages = 8,
        public readonly int $chatWindowSeconds = 10,
        /** Foute PIN-pogingen per lobby en IP, en per lobby in totaal, per tijdvenster. */
        public readonly int $pinFailuresPerClient = 10,
        public readonly int $pinFailuresPerLobby = 30,
        public readonly int $pinWindowSeconds = 600,
        /** Zoveel lobby's mogen er tegelijk bestaan; daarboven zegt de server "druk". */
        public readonly int $maxLobbies = 500,
    ) {
    }

    /** Geen enkele grens: voor tests die juist heel veel doen. */
    public static function none(): self
    {
        $max = PHP_INT_MAX;

        return new self($max, $max, $max, $max, 10, $max, $max, 600, $max);
    }
}
