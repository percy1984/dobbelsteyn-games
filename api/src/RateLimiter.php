<?php

declare(strict_types=1);

namespace Dg;

use PDO;

/** Tellers met vaste tijdvensters in de database; werkt zonder extra diensten op shared hosting. */
final class RateLimiter
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Telt één poging mee. Geeft het aantal pogingen in het huidige venster terug.
     */
    public function record(string $bucket, int $windowSeconds): int
    {
        // Eén statement: een nieuw venster begint opnieuw bij 1, anders +1. Rijen in andere buckets
        // worden niet geblokkeerd.
        $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, NOW(3))
             ON DUPLICATE KEY UPDATE
                hits = IF(window_start < NOW(3) - INTERVAL ? SECOND, 1, hits + 1),
                window_start = IF(window_start < NOW(3) - INTERVAL ? SECOND, NOW(3), window_start)'
        )->execute([$bucket, $windowSeconds, $windowSeconds]);

        return $this->count($bucket, $windowSeconds);
    }

    /** Aantal pogingen in het huidige venster (0 als het venster verlopen is of de bucket nieuw is). */
    public function count(string $bucket, int $windowSeconds): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT hits FROM rate_limits WHERE bucket = ? AND window_start >= NOW(3) - INTERVAL ? SECOND'
        );
        $stmt->execute([$bucket, $windowSeconds]);
        $hits = $stmt->fetchColumn();

        return $hits === false ? 0 : (int) $hits;
    }

    /** Telt een poging mee en stopt met 429 als de grens overschreden is. */
    public function hit(string $bucket, int $limit, int $windowSeconds): void
    {
        if ($this->record($bucket, $windowSeconds) > $limit) {
            throw new ApiException(429, 'Te veel verzoeken. Probeer het over een poosje opnieuw.', 'rate_limited');
        }
    }

    /** Stopt met 429 als de grens al bereikt is, zonder mee te tellen. */
    public function assertBelow(string $bucket, int $limit, int $windowSeconds): void
    {
        if ($this->count($bucket, $windowSeconds) >= $limit) {
            throw new ApiException(429, 'Te veel verzoeken. Probeer het over een poosje opnieuw.', 'rate_limited');
        }
    }

    /**
     * Geeft true voor de eerste aanroep binnen het venster en false voor de rest. Handig om werk
     * (zoals opruimen) hooguit eens per venster te laten doen.
     */
    public function once(string $bucket, int $windowSeconds): bool
    {
        return $this->record($bucket, $windowSeconds) === 1;
    }

    /** Verwijdert oude tellers. */
    public function purge(): int
    {
        return $this->pdo->exec('DELETE FROM rate_limits WHERE window_start < NOW(3) - INTERVAL 1 DAY') ?: 0;
    }

    /** Een kort, niet-herleidbaar kenmerk van een IP-adres voor in een bucketnaam. */
    public static function client(string $ip): string
    {
        return substr(hash('sha256', $ip), 0, 16);
    }
}
