<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\Config;
use Dg\Database;
use Dg\MigrateEndpoint;
use PDO;
use PHPUnit\Framework\TestCase;
use Throwable;

final class MigrateEndpointTest extends TestCase
{
    private const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

    private string $dir;
    private ?PDO $pdo = null;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/dg-endpoint-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        if ($this->pdo !== null) {
            $this->pdo->exec('DROP TABLE IF EXISTS endpoint_test');
            $this->pdo->exec("DELETE FROM schema_migrations WHERE version LIKE '9998\\_test%'");
        }
        foreach (glob($this->dir . '/*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($this->dir);
    }

    private function endpoint(?string $configuredToken, ?callable $connect = null): MigrateEndpoint
    {
        $config = new Config($configuredToken === null ? [] : ['migrate_token' => $configuredToken]);

        return new MigrateEndpoint(
            $config,
            $this->dir,
            $connect ?? static fn () => throw new \LogicException('Geen verbinding verwacht.'),
            failureDelayMicros: 0,
        );
    }

    public function testIsDisabledWithoutConfiguredToken(): void
    {
        $this->assertSame(404, $this->endpoint(null)->handle(self::TOKEN)->status);
    }

    public function testIsDisabledWithTooShortToken(): void
    {
        $this->assertSame(404, $this->endpoint('kort')->handle('kort')->status);
    }

    public function testRejectsMissingOrWrongToken(): void
    {
        $endpoint = $this->endpoint(self::TOKEN);

        $this->assertSame(403, $endpoint->handle(null)->status);
        $this->assertSame(403, $endpoint->handle('verkeerd')->status);
        $this->assertSame(403, $endpoint->handle(strrev(self::TOKEN))->status);
    }

    private function connectOrSkip(): callable
    {
        try {
            $config = Config::load(__DIR__ . '/../config.php');
            $this->pdo = Database::connect($config->database(), allowMultipleStatements: true);
        } catch (Throwable $e) {
            $this->markTestSkipped('Geen databaseverbinding: ' . $e->getMessage());
        }

        return fn () => Database::connect($config->database(), allowMultipleStatements: true);
    }

    public function testRunsPendingMigrationsOnceWithValidToken(): void
    {
        $connect = $this->connectOrSkip();
        file_put_contents(
            $this->dir . '/9998_test_a.sql',
            'CREATE TABLE IF NOT EXISTS endpoint_test (id INT PRIMARY KEY);',
        );
        $endpoint = $this->endpoint(self::TOKEN, $connect);

        $first = $endpoint->handle(self::TOKEN);
        $second = $endpoint->handle(self::TOKEN);

        $this->assertSame(200, $first->status);
        $this->assertSame(['status' => 'ok', 'applied' => ['9998_test_a']], $first->data);
        $this->assertSame(['status' => 'ok', 'applied' => []], $second->data);
    }

    public function testReportsFailureAndDoesNotRegisterBrokenMigration(): void
    {
        $connect = $this->connectOrSkip();
        file_put_contents($this->dir . '/9998_test_broken.sql', 'THIS IS NOT SQL;');

        $response = $this->endpoint(self::TOKEN, $connect)->handle(self::TOKEN);

        $this->assertSame(500, $response->status);
        $this->assertSame('failed', $response->data['status']);
        $registered = $this->pdo->query("SELECT COUNT(*) FROM schema_migrations WHERE version = '9998_test_broken'")->fetchColumn();
        $this->assertSame(0, (int) $registered);
    }
}
