<?php

declare(strict_types=1);

namespace Dg\Lobbies;

use PDO;

/**
 * Ruimt verlaten lobby's op. "Verlaten" betekent: geen enkele mens heeft nog een heartbeat gegeven
 * (zie de polling). Er is geen aparte cron nodig: dit draait hooguit eens per minuut, meegeleverd met
 * een gewoon verzoek (zie `Api`).
 *
 * Tijden: een wachtkamer of afgelopen spel verdwijnt na 30 minuten zonder mensen; een lopend spel
 * wacht lang (24 uur) op spelers die weg zijn, in lijn met "geen time-out bij wachten".
 */
final class Cleanup
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly int $idleMinutes = 30,
        private readonly int $runningHours = 24,
    ) {
    }

    /** @return int aantal verwijderde lobby's */
    public function run(): int
    {
        // Seats, chat en spelstaat verdwijnen mee (ON DELETE CASCADE).
        $stmt = $this->pdo->prepare(
            "DELETE l FROM lobbies l
             WHERE NOT EXISTS (
                 SELECT 1 FROM seats s
                 WHERE s.lobby_id = l.id AND s.kind = 'human'
                   AND s.last_seen_at >= NOW(3) - INTERVAL (CASE WHEN l.status IN ('playing', 'countdown') THEN ? * 60 ELSE ? END) MINUTE
             )
             AND l.last_activity_at < NOW(3) - INTERVAL (CASE WHEN l.status IN ('playing', 'countdown') THEN ? * 60 ELSE ? END) MINUTE"
        );
        $stmt->execute([$this->runningHours, $this->idleMinutes, $this->runningHours, $this->idleMinutes]);

        return $stmt->rowCount();
    }
}
