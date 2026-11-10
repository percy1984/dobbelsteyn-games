<?php

declare(strict_types=1);

namespace Dg;

use PDO;
use Throwable;

/**
 * POST /migrate: voert alle nog niet uitgevoerde migraties uit.
 *
 * Beveiliging:
 *  - Staat uit (404) zolang er geen migrate_token van minstens 32 tekens in config.php staat.
 *  - Het token reist in een header (X-Migrate-Token), nooit in de URL, zodat het niet in logs belandt.
 *  - Vergelijking in constante tijd; een foute poging wordt vertraagd en gelogd.
 *  - Een databaseslot voorkomt dat twee migraties tegelijk draaien.
 */
final class MigrateEndpoint
{
    private const LOCK_NAME = 'dg_migrate';

    /**
     * @param callable(): PDO $connect verbinding die meerdere statements per aanroep toestaat
     * @param int $failureDelayMicros vertraging na een foute poging
     */
    public function __construct(
        private readonly Config $config,
        private readonly string $migrationsDir,
        private readonly mixed $connect,
        private readonly int $failureDelayMicros = 500_000,
    ) {
    }

    public function handle(?string $providedToken): Response
    {
        $expected = $this->config->migrateToken();
        if ($expected === null) {
            return Response::error(404, 'Niet gevonden.');
        }

        if ($providedToken === null || !hash_equals($expected, $providedToken)) {
            error_log('Migratie-endpoint: aanroep met ongeldig token geweigerd.');
            usleep($this->failureDelayMicros);

            return Response::error(403, 'Toegang geweigerd.');
        }

        $pdo = null;
        try {
            /** @var PDO $pdo */
            $pdo = ($this->connect)();

            $locked = $pdo->query("SELECT GET_LOCK('" . self::LOCK_NAME . "', 0)")->fetchColumn();
            if ((int) $locked !== 1) {
                return Response::error(409, 'Er draait al een migratie.');
            }

            try {
                $ran = (new Migrator($pdo, $this->migrationsDir))->run();
            } finally {
                $pdo->query("SELECT RELEASE_LOCK('" . self::LOCK_NAME . "')")->fetchAll();
            }

            return Response::json(['status' => 'ok', 'applied' => $ran]);
        } catch (Throwable $e) {
            error_log('Migratie mislukt: ' . $e->getMessage());

            // De aanroeper is geauthenticeerd, dus de melding mag mee: dat maakt een mislukte migratie te repareren.
            return Response::json(['status' => 'failed', 'error' => $e->getMessage()], 500);
        }
    }
}
