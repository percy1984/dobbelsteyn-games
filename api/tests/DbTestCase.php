<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\Config;
use Dg\Database;
use Dg\Migrator;
use PDO;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * Basis voor integratietests op de lokale Docker-database. Draait de migraties en maakt de
 * lobbytabellen leeg. Weigert te draaien tegen een andere database dan de lokale (host "db"),
 * zodat een test nooit per ongeluk echte data wist.
 */
abstract class DbTestCase extends TestCase
{
    protected PDO $pdo;

    protected function setUp(): void
    {
        try {
            $config = Config::load(__DIR__ . '/../config.php');
            $db = $config->database();
            if ($db['host'] !== 'db') {
                $this->markTestSkipped('Integratietests draaien alleen tegen de lokale Docker-database.');
            }
            (new Migrator(Database::connect($db, allowMultipleStatements: true), __DIR__ . '/../migrations'))->run();
            $this->pdo = Database::connect($db);
        } catch (Throwable $e) {
            $this->markTestSkipped('Geen databaseverbinding: ' . $e->getMessage());
        }

        $this->pdo->exec('DELETE FROM lobbies');
        $this->pdo->exec('DELETE FROM rate_limits');
    }
}
