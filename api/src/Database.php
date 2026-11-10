<?php

declare(strict_types=1);

namespace Dg;

use PDO;

/** Maakt PDO-verbindingen. Eén verbinding per request, snel weer sluiten. */
final class Database
{
    /** @param array{host: string, port: int, name: string, user: string, password: string} $db */
    public static function connect(array $db, bool $allowMultipleStatements = false): PDO
    {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], $db['port'], $db['name']);

        return new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            // Alleen het migratiescript mag meerdere statements per aanroep uitvoeren.
            PDO::MYSQL_ATTR_MULTI_STATEMENTS => $allowMultipleStatements,
        ]);
    }
}
