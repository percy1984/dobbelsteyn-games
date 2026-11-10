<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\Config;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class ConfigTest extends TestCase
{
    public function testReadsDatabaseSettingsWithDefaultPort(): void
    {
        $config = new Config(['db' => ['host' => 'db', 'name' => 'n', 'user' => 'u', 'password' => 'p']]);

        $this->assertSame(
            ['host' => 'db', 'port' => 3306, 'name' => 'n', 'user' => 'u', 'password' => 'p'],
            $config->database(),
        );
    }

    public function testMissingDatabaseKeyThrows(): void
    {
        $this->expectException(RuntimeException::class);
        (new Config(['db' => ['host' => 'db']]))->database();
    }

    public function testMigrateTokenNeedsAtLeast32Characters(): void
    {
        $this->assertNull((new Config([]))->migrateToken());
        $this->assertNull((new Config(['migrate_token' => str_repeat('a', 31)]))->migrateToken());
        $this->assertSame(str_repeat('a', 32), (new Config(['migrate_token' => str_repeat('a', 32)]))->migrateToken());
    }

    public function testDebugIsOffByDefault(): void
    {
        $this->assertFalse((new Config([]))->debug());
    }

    public function testMissingFileThrows(): void
    {
        $this->expectException(RuntimeException::class);
        Config::load(__DIR__ . '/bestaat-niet.php');
    }
}
