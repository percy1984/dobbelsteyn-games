<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Games\TicTacToe;
use Dg\Lobbies\LobbyService;
use Dg\Tests\Games\CounterGame;

/** De zetlog, vrije zetten (buiten de beurt) en de klok van het spelcontract, met een testgame. */
final class EventLogTest extends DbTestCase
{
    private LobbyService $lobbies;
    private int $nowMs = 1_000_000;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lobbies = new LobbyService(
            $this->pdo,
            new GameRegistry([new CounterGame(), new TicTacToe()]),
            new Rng(static fn (int $min, int $max): int => $min),
            clock: fn (): int => $this->nowMs,
        );
    }

    private function assertApiError(int $status, string $code, callable $fn): void
    {
        try {
            $fn();
            $this->fail("Verwachtte een ApiException met status $status.");
        } catch (ApiException $e) {
            $this->assertSame($status, $e->status, $e->getMessage());
            $this->assertSame($code, $e->errorCode);
        }
    }

    /** Start een spel en laat de aftelling verlopen; geeft de lobbyview van de maker terug. */
    private function begin(string $code, string $token): array
    {
        if ($this->lobbies->start($code, $token)['status'] === 'waiting') {
            $this->pdo->exec('UPDATE seats SET is_ready = 1');
            $this->lobbies->start($code, $token);
        }
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');

        return $this->lobbies->poll($code, $token, null);
    }

    /** @return array{code: string, host: string, guest: string} */
    private function twoHumans(): array
    {
        $created = $this->lobbies->create('counter', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $guest = $this->lobbies->join($code, 'Anna', null);
        $this->begin($code, $created['token']);

        return ['code' => $code, 'host' => $created['token'], 'guest' => $guest['token']];
    }

    /** @param list<array<string, mixed>> $events @return list<string> */
    private function types(array $events): array
    {
        return array_map(static fn (array $event): string => $event['type'], $events);
    }

    public function testStartingTheGameWritesTheFirstEventWithSequenceOne(): void
    {
        $lobby = $this->twoHumans();

        $view = $this->lobbies->viewFor($lobby['code'], $lobby['guest']);

        $this->assertSame([['seq' => 1, 'type' => 'started', 'seats' => [0, 1]]], $view['events']);
    }

    public function testMovesAppendEventsWithIncreasingSequenceAndEveryoneSeesTheSameLog(): void
    {
        $lobby = $this->twoHumans();

        $this->lobbies->move($lobby['code'], $lobby['host'], ['type' => 'add', 'amount' => 2]);
        $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'add', 'amount' => 1]);

        $host = $this->lobbies->viewFor($lobby['code'], $lobby['host'])['events'];
        $guest = $this->lobbies->viewFor($lobby['code'], $lobby['guest'])['events'];
        $this->assertSame($host, $guest);
        $this->assertSame([1, 2, 3], array_column($host, 'seq'));
        $this->assertSame(['started', 'added', 'added'], $this->types($host));
        $this->assertSame(3, $host[2]['total']);
    }

    public function testTheLogNeverContainsHiddenInformationOfOtherPlayers(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->move($lobby['code'], $lobby['host'], ['type' => 'add', 'amount' => 1]);

        $guestView = $this->lobbies->viewFor($lobby['code'], $lobby['guest']);

        // De geheime getallen (7000 en 7001) staan alleen in de eigen gameView, nooit in de zetlog.
        $this->assertSame(7001, $guestView['gameView']['secret']);
        $this->assertStringNotContainsString('700', json_encode($guestView['events'], JSON_THROW_ON_ERROR));
    }

    public function testBotMovesAreWrittenToTheLogInOrderWithinTheSameRequest(): void
    {
        $created = $this->lobbies->create('counter', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 5);
        $this->begin($code, $created['token']);

        $view = $this->lobbies->move($code, $created['token'], ['type' => 'add', 'amount' => 1]);

        $this->assertSame(['started', 'added', 'added'], $this->types($view['events']));
        $this->assertSame([0, 1], [$view['events'][1]['seat'], $view['events'][2]['seat']]);
        $this->assertSame([1, 2, 3], array_column($view['events'], 'seq'));
    }

    public function testAFreeMoveIsAllowedOutOfTurnButARegularMoveIsNot(): void
    {
        $lobby = $this->twoHumans();

        $this->assertApiError(409, 'not_your_turn', fn () => $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'add', 'amount' => 1]));

        $view = $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'note']);

        $this->assertSame('noted', $view['events'][1]['type']);
        $this->assertSame(1, $view['events'][1]['seat']);
        // De beurt is niet doorgeschoven door de vrije zet.
        $this->assertSame([0], $view['activeSeats']);
    }

    public function testTheGameCanEnforceARateLimitWithTheServerClock(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'note']);

        $this->nowMs += CounterGame::NOTE_INTERVAL_MS - 1;
        $this->assertApiError(422, 'invalid_move', fn () => $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'note']));

        $this->nowMs += 1;
        $view = $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'note']);

        $this->assertSame(['started', 'noted', 'noted'], $this->types($view['events']));
    }

    public function testFreeMovesAreRejectedAfterTheGameIsOver(): void
    {
        $lobby = $this->twoHumans();
        foreach ([[$lobby['host'], 2], [$lobby['guest'], 2], [$lobby['host'], 1]] as [$token, $amount]) {
            $view = $this->lobbies->move($lobby['code'], $token, ['type' => 'add', 'amount' => $amount]);
        }
        $this->assertSame('finished', $view['status']);

        $this->assertApiError(409, 'not_playing', fn () => $this->lobbies->move($lobby['code'], $lobby['guest'], ['type' => 'note']));
    }

    public function testAGameWithoutAnEventLogJustHasAnEmptyList(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $guest = $this->lobbies->join($code, 'Anna', null);
        if ($this->lobbies->start($code, $created['token'])['status'] === 'waiting') {
            $this->pdo->exec('UPDATE seats SET is_ready = 1');
            $this->lobbies->start($code, $created['token']);
        }
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');
        $view = $this->lobbies->poll($code, $guest['token'], null);

        $this->assertSame('playing', $view['status']);
        $this->assertSame([], $view['events']);
    }

    public function testARematchStartsWithAnEmptyLog(): void
    {
        $lobby = $this->twoHumans();
        foreach ([[$lobby['host'], 2], [$lobby['guest'], 2], [$lobby['host'], 1]] as [$token, $amount]) {
            $this->lobbies->move($lobby['code'], $token, ['type' => 'add', 'amount' => $amount]);
        }

        $this->lobbies->rematch($lobby['code'], $lobby['host']);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM game_events')->fetchColumn());

        $view = $this->begin($lobby['code'], $lobby['host']);

        $this->assertSame([['seq' => 1, 'type' => 'started', 'seats' => [0, 1]]], $view['events']);
    }

    public function testOnlyTheMostRecentEventsGoIntoTheViewAndOldOnesAreCleanedUp(): void
    {
        $lobby = $this->twoHumans();
        $lobbyId = (int) $this->pdo->query('SELECT id FROM lobbies')->fetchColumn();
        $insert = $this->pdo->prepare('INSERT INTO game_events (lobby_id, seq, event) VALUES (?, ?, ?)');
        for ($seq = 2; $seq <= 700; $seq++) {
            $insert->execute([$lobbyId, $seq, json_encode(['type' => 'filler'])]);
        }

        $view = $this->lobbies->move($lobby['code'], $lobby['host'], ['type' => 'add', 'amount' => 1]);

        $this->assertCount(100, $view['events']);
        $this->assertSame(701, $view['events'][99]['seq']);
        $this->assertSame('added', $view['events'][99]['type']);
        $this->assertSame(500, (int) $this->pdo->query('SELECT COUNT(*) FROM game_events')->fetchColumn());
    }
}
