<?php

declare(strict_types=1);

namespace Dg;

use PDO;
use RuntimeException;

/** Voert genummerde SQL-bestanden uit migrations/ eenmalig uit, op volgorde. */
final class Migrator
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly string $directory,
    ) {
    }

    /** @return list<string> de nu uitgevoerde migraties */
    public function run(): array
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(100) NOT NULL PRIMARY KEY,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );

        $applied = $this->pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
        $files = glob($this->directory . '/*.sql') ?: [];
        sort($files);

        $ran = [];
        foreach ($files as $file) {
            $version = basename($file, '.sql');
            if (in_array($version, $applied, true)) {
                continue;
            }

            $sql = file_get_contents($file);
            if ($sql === false) {
                throw new RuntimeException("Kan $file niet lezen.");
            }

            // DDL in MySQL wordt direct vastgelegd. Een mislukte migratie stopt het script
            // en wordt niet als uitgevoerd geregistreerd.
            $this->pdo->exec($sql);
            $stmt = $this->pdo->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
            $stmt->execute([$version]);
            $ran[] = $version;
        }

        return $ran;
    }
}
