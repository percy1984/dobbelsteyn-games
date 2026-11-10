<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\Response;
use Dg\Router;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RouterTest extends TestCase
{
    /** @return array<string, array{string, string, string}> */
    public static function paths(): array
    {
        return [
            'onder /games/api'          => ['/games/api/health', '/games/api/index.php', '/health'],
            'onder ander sub-pad'       => ['/ander/pad/api/health?x=1', '/ander/pad/api/index.php', '/health'],
            'direct in de root'         => ['/health', '/index.php', '/health'],
            'slash aan het eind'        => ['/games/api/health/', '/games/api/index.php', '/health'],
            'de API-root zelf'          => ['/games/api/', '/games/api/index.php', '/'],
            'index.php expliciet'       => ['/games/api/index.php', '/games/api/index.php', '/'],
        ];
    }

    #[DataProvider('paths')]
    public function testRelativePathIsIndependentOfSubPath(string $uri, string $script, string $expected): void
    {
        $this->assertSame($expected, Router::relativePath($uri, $script));
    }

    public function testDispatchesMatchingRoute(): void
    {
        $router = new Router();
        $router->add('GET', '/health', static fn (): Response => Response::json(['status' => 'ok']));

        $response = $router->dispatch('GET', '/health');

        $this->assertSame(200, $response->status);
        $this->assertSame(['status' => 'ok'], $response->data);
    }

    public function testPassesPathParameters(): void
    {
        $router = new Router();
        $router->add('GET', '/lobbies/{code}', static fn (array $p): Response => Response::json(['code' => $p['code']]));

        $this->assertSame(['code' => 'ABCD'], $router->dispatch('GET', '/lobbies/ABCD')->data);
    }

    public function testUnknownPathIs404(): void
    {
        $this->assertSame(404, (new Router())->dispatch('GET', '/nope')->status);
    }

    public function testWrongMethodIs405(): void
    {
        $router = new Router();
        $router->add('GET', '/health', static fn (): Response => Response::json([]));

        $this->assertSame(405, $router->dispatch('POST', '/health')->status);
    }
}
