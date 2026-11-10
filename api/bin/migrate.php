<?php

declare(strict_types=1);

// Gebruik (lokaal):  docker compose exec web php /var/www/html/games/api/bin/migrate.php
// Alleen via de command line; nooit via de webserver.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Migrator.php';

$config = Dg\Config::load(__DIR__ . '/../config.php');
$pdo = Dg\Database::connect($config->database(), allowMultipleStatements: true);
$ran = (new Dg\Migrator($pdo, __DIR__ . '/../migrations'))->run();

echo $ran === [] ? "Database is up-to-date.\n" : 'Uitgevoerd: ' . implode(', ', $ran) . "\n";
