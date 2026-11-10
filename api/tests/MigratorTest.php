<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\Config;
use Dg\Database;
use Dg\Migrator;
use PDO;
use PHPUnit\Framework\TestCase;
use Throwable;

/** Integratietest tegen de lokale database (docker compose up); wordt overgeslagen zonder verbinding. */
final class MigratorTest extends TestCase
{
    private PDO $pdo;
    private string $dir;

    protected function setUp(): void
    {
        try {
            $config = Config::load(__DIR__ . '/../config.php');
            $this->pdo = Database::connect($config->database(), allowMultipleStatements: true);
        } catch (Throwable $e) {
            $this->markTestSkipped('Geen databaseverbinding: ' . $e->getMessage());
        }

        $this->dir = sys_get_temp_dir() . '/dg-migrations-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        if (isset($this->pdo)) {
            $this->pdo->exec('DROP TABLE IF EXISTS migrator_test');
            $this->pdo->exec("DELETE FROM schema_migrations WHERE version LIKE '9999\_test%'");
        }
        foreach (glob($this->dir . '/*') ?: [] as $file) {
            unlink($file);
        }
        if (isset($this->dir) && is_dir($this->dir)) {
            rmdir($this->dir);
        }
    }

    public function testRunsEachMigrationOnlyOnce(): void
    {
        file_put_contents(
            $this->dir . '/9999_test_a.sql',
            'CREATE TABLE migrator_test (id INT PRIMARY KEY); INSERT INTO migrator_test VALUES (1);',
        );

        $migrator = new Migrator($this->pdo, $this->dir);

        $this->assertSame(['9999_test_a'], $migrator->run());
        $this->assertSame([], $migrator->run(), 'Tweede keer mag niets meer uitgevoerd worden.');
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM migrator_test')->fetchColumn());
    }
}
