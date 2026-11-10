<?php

declare(strict_types=1);

use Dg\Api;
use Dg\ApiException;
use Dg\Config;
use Dg\Request;
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
    Api::register($router, $config, __DIR__ . '/migrations');

    $path = Router::relativePath($_SERVER['REQUEST_URI'] ?? '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
    $router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $path, Request::fromGlobals())->send();
} catch (ApiException $e) {
    Response::error($e->status, $e->getMessage(), $e->errorCode)->send();
} catch (Throwable $e) {
    error_log($e::class . ': ' . $e->getMessage());
    Response::json(
        $debug ? ['error' => 'Interne fout.', 'detail' => $e->getMessage()] : ['error' => 'Interne fout.'],
        500,
    )->send();
}
