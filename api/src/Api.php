<?php

declare(strict_types=1);

namespace Dg;

use Dg\Games\GameRegistry;
use Dg\Lobbies\LobbyService;
use PDO;
use Throwable;

/** Verbindt de URL's van de API met de services. */
final class Api
{
    private ?PDO $pdo = null;
    private ?LobbyService $lobbies = null;

    private function __construct(
        private readonly Config $config,
        private readonly GameRegistry $games,
        private readonly string $migrationsDir,
    ) {
    }

    public static function register(Router $router, Config $config, string $migrationsDir, ?GameRegistry $games = null): void
    {
        $api = new self($config, $games ?? GameRegistry::default(), $migrationsDir);

        $router->add('GET', '/health', $api->health(...));
        $router->add('POST', '/migrate', $api->migrate(...));

        $router->add('GET', '/lobbies', $api->listLobbies(...));
        $router->add('POST', '/lobbies', $api->createLobby(...));
        $router->add('GET', '/lobbies/{code}', $api->showLobby(...));
        $router->add('POST', '/lobbies/{code}/join', $api->joinLobby(...));
        $router->add('POST', '/lobbies/{code}/leave', $api->leaveLobby(...));
        $router->add('POST', '/lobbies/{code}/settings', $api->updateSettings(...));
        $router->add('POST', '/lobbies/{code}/promote', $api->promote(...));
        $router->add('POST', '/lobbies/{code}/start', $api->startGame(...));
        $router->add('POST', '/lobbies/{code}/move', $api->move(...));
        $router->add('POST', '/lobbies/{code}/rematch', $api->rematch(...));
        $router->add('POST', '/lobbies/{code}/bots', $api->addBot(...));
        $router->add('POST', '/lobbies/{code}/bots/level', $api->setBotLevel(...));
        $router->add('POST', '/lobbies/{code}/bots/remove', $api->removeBot(...));
    }

    // --- Systeem ---------------------------------------------------------------------------

    /** @param array<string, string> $params */
    private function health(array $params, Request $request): Response
    {
        try {
            $this->pdo()->query('SELECT 1');

            return Response::json(['status' => 'ok']);
        } catch (Throwable $e) {
            error_log('Health-check database: ' . $e->getMessage());

            return Response::json(['status' => 'database-unavailable'], 503);
        }
    }

    /** @param array<string, string> $params */
    private function migrate(array $params, Request $request): Response
    {
        $endpoint = new MigrateEndpoint(
            $this->config,
            $this->migrationsDir,
            fn (): PDO => Database::connect($this->config->database(), allowMultipleStatements: true),
        );

        return $endpoint->handle($request->header('X-Migrate-Token'));
    }

    // --- Lobby's ---------------------------------------------------------------------------

    /** @param array<string, string> $params */
    private function listLobbies(array $params, Request $request): Response
    {
        return Response::json(['lobbies' => $this->lobbies()->listForGame($request->query['game'] ?? '')]);
    }

    /** @param array<string, string> $params */
    private function createLobby(array $params, Request $request): Response
    {
        $result = $this->lobbies()->create(
            $request->string('game') ?? '',
            $request->body['name'] ?? null,
            ($request->body['private'] ?? false) === true,
            $request->body['pin'] ?? null,
        );

        return Response::json($result, 201);
    }

    /** @param array<string, string> $params */
    private function showLobby(array $params, Request $request): Response
    {
        $since = isset($request->query['since']) && ctype_digit($request->query['since']) ? (int) $request->query['since'] : null;

        return Response::json($this->lobbies()->poll($params['code'], $request->seatToken(), $since));
    }

    /** @param array<string, string> $params */
    private function joinLobby(array $params, Request $request): Response
    {
        return Response::json($this->lobbies()->join($params['code'], $request->body['name'] ?? null, $request->body['pin'] ?? null));
    }

    /** @param array<string, string> $params */
    private function leaveLobby(array $params, Request $request): Response
    {
        $this->lobbies()->leave($params['code'], $request->seatToken());

        return Response::json(['status' => 'ok']);
    }

    /** @param array<string, string> $params */
    private function updateSettings(array $params, Request $request): Response
    {
        $settings = $request->body['settings'] ?? null;
        if (!is_array($settings)) {
            throw new ApiException(422, 'Ongeldige instelling.', 'bad_settings');
        }

        return Response::json($this->lobbies()->updateSettings($params['code'], $request->seatToken(), $settings));
    }

    /** @param array<string, string> $params */
    private function promote(array $params, Request $request): Response
    {
        $seatNo = $request->body['seatNo'] ?? null;
        if (!is_int($seatNo)) {
            throw new ApiException(422, 'Deze plaats bestaat niet.', 'seat_not_found');
        }

        return Response::json($this->lobbies()->setPromoted($params['code'], $request->seatToken(), $seatNo, ($request->body['promoted'] ?? true) === true));
    }

    /** @param array<string, string> $params */
    private function addBot(array $params, Request $request): Response
    {
        return Response::json($this->lobbies()->addBot($params['code'], $request->seatToken(), $request->body['level'] ?? null));
    }

    /** @param array<string, string> $params */
    private function setBotLevel(array $params, Request $request): Response
    {
        return Response::json($this->lobbies()->setBotLevel(
            $params['code'],
            $request->seatToken(),
            is_int($request->body['seatNo'] ?? null) ? $request->body['seatNo'] : -1,
            $request->body['level'] ?? null,
        ));
    }

    /** @param array<string, string> $params */
    private function removeBot(array $params, Request $request): Response
    {
        return Response::json($this->lobbies()->removeBot(
            $params['code'],
            $request->seatToken(),
            is_int($request->body['seatNo'] ?? null) ? $request->body['seatNo'] : -1,
        ));
    }

    /** @param array<string, string> $params */
    private function startGame(array $params, Request $request): Response
    {
        return Response::json($this->lobbies()->start($params['code'], $request->seatToken()));
    }

    /** @param array<string, string> $params */
    private function move(array $params, Request $request): Response
    {
        $move = $request->body['move'] ?? null;
        if (!is_array($move)) {
            throw new ApiException(422, 'Ongeldige zet.', 'invalid_move');
        }

        return Response::json($this->lobbies()->move($params['code'], $request->seatToken(), $move));
    }

    /** @param array<string, string> $params */
    private function rematch(array $params, Request $request): Response
    {
        return Response::json($this->lobbies()->rematch($params['code'], $request->seatToken()));
    }

    // --- Hulpmiddelen ----------------------------------------------------------------------

    /** Eén databaseverbinding per request, pas aangemaakt als hij nodig is. */
    private function pdo(): PDO
    {
        return $this->pdo ??= Database::connect($this->config->database());
    }

    private function lobbies(): LobbyService
    {
        return $this->lobbies ??= new LobbyService($this->pdo(), $this->games);
    }
}
