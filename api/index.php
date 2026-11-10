<?php

declare(strict_types=1);

use Dg\Config;
use Dg\Database;
use Dg\MigrateEndpoint;
use Dg\Response;
use Dg\Router;

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Dg\\')) {
        $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, 3)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

$debug = false;

try {
    $config = Config::load(__DIR__ . '/config.php');
    $debug = $config->debug();

    $router = new Router();

    $router->add('GET', '/health', static function () use ($config): Response {
        try {
            Database::connect($config->database())->query('SELECT 1');
            return Response::json(['status' => 'ok']);
        } catch (Throwable $e) {
            error_log('Health-check database: ' . $e->getMessage());
            return Response::json(['status' => 'database-unavailable'], 503);
        }
    });

    $router->add('POST', '/migrate', static function () use ($config): Response {
        $endpoint = new MigrateEndpoint(
            $config,
            __DIR__ . '/migrations',
            static fn () => Database::connect($config->database(), allowMultipleStatements: true),
        );

        return $endpoint->handle($_SERVER['HTTP_X_MIGRATE_TOKEN'] ?? null);
    });

    $path = Router::relativePath($_SERVER['REQUEST_URI'] ?? '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
    $router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $path)->send();
} catch (Throwable $e) {
    error_log($e::class . ': ' . $e->getMessage());
    Response::json(
        $debug ? ['error' => 'Interne fout.', 'detail' => $e->getMessage()] : ['error' => 'Interne fout.'],
        500,
    )->send();
}
