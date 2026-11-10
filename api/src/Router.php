<?php

declare(strict_types=1);

namespace Dg;

/**
 * Kleine router. Padden zijn relatief aan de map waarin de API staat, zodat de API
 * onder elk sub-pad werkt (bijvoorbeeld /games/api/ of /ander/pad/api/).
 */
final class Router
{
    /** @var list<array{method: string, pattern: string, handler: callable}> */
    private array $routes = [];

    /** @param callable(array<string, string>, Request): Response $handler */
    public function add(string $method, string $pattern, callable $handler): void
    {
        $this->routes[] = ['method' => $method, 'pattern' => $pattern, 'handler' => $handler];
    }

    /** Geeft het pad terug relatief aan de API-map, bijvoorbeeld "/health". */
    public static function relativePath(string $requestUri, string $scriptName): string
    {
        $path = rawurldecode((string) parse_url($requestUri, PHP_URL_PATH));
        $base = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');

        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base));
        }

        $path = '/' . trim($path, '/');
        return $path === '/index.php' ? '/' : $path;
    }

    public function dispatch(string $method, string $path, ?Request $request = null): Response
    {
        $request ??= new Request($method);
        $pathMatched = false;

        foreach ($this->routes as $route) {
            $params = self::match($route['pattern'], $path);
            if ($params === null) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] === $method) {
                return ($route['handler'])($params, $request);
            }
        }

        return $pathMatched
            ? Response::error(405, 'Methode niet toegestaan.', 'method_not_allowed')
            : Response::error(404, 'Niet gevonden.', 'not_found');
    }

    /** @return array<string, string>|null */
    private static function match(string $pattern, string $path): ?array
    {
        $regex = preg_replace('#\{([a-z_]+)\}#', '(?P<$1>[^/]+)', $pattern);
        if (preg_match('#^' . $regex . '$#', $path, $matches) !== 1) {
            return null;
        }

        return array_filter($matches, is_string(...), ARRAY_FILTER_USE_KEY);
    }
}
