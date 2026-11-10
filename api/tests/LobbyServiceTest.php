<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Lobbies\LobbyService;

final class LobbyServiceTest extends DbTestCase
{
    private LobbyService $lobbies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lobbies = new LobbyService($this->pdo, GameRegistry::default());
    }

    private function assertApiError(int $status, callable $fn): void
    {
        try {
            $fn();
            $this->fail("Verwachtte een ApiException met status $status.");
        } catch (ApiException $e) {
            $this->assertSame($status, $e->status, $e->getMessage());
        }
    }

    public function testCreateMakesALobbyWithTheCreatorInSeatZero(): void
    {
        $result = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);

        $this->assertMatchesRegularExpression('/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/', $result['lobby']['code']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $result['token']);
        $this->assertSame(0, $result['seatNo']);
        $this->assertSame('waiting', $result['lobby']['status']);
        $this->assertFalse($result['lobby']['isPrivate']);
        $this->assertNull($result['lobby']['pin']);
        $this->assertSame(2, $result['lobby']['maxPlayers']);
        $this->assertSame(['starter' => 'random'], $result['lobby']['settings']);
        $this->assertTrue($result['lobby']['me']['isCreator']);
        $this->assertTrue($result['lobby']['me']['canManage']);
        $this->assertSame('Percy', $result['lobby']['seats'][0]['name']);
    }

    public function testTokenIsStoredOnlyAsAHash(): void
    {
        $result = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);

        $stored = $this->pdo->query('SELECT token_hash FROM seats')->fetchColumn();
        $this->assertSame(hash('sha256', $result['token']), $stored);
        $this->assertNotSame($result['token'], $stored);
    }

    public function testPrivateLobbyUsesTheGivenPinOrGeneratesOne(): void
    {
        $given = $this->lobbies->create('tic-tac-toe', 'A', true, 'ab12');
        $generated = $this->lobbies->create('tic-tac-toe', 'B', true, '');

        $this->assertTrue($given['lobby']['isPrivate']);
        $this->assertSame('AB12', $given['lobby']['pin']);
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{4}$/', $generated['lobby']['pin']);
    }

    public function testCreateRejectsBadInput(): void
    {
        $this->assertApiError(404, fn () => $this->lobbies->create('mancala', 'Percy', false, null));
        $this->assertApiError(422, fn () => $this->lobbies->create('tic-tac-toe', '', false, null));
        $this->assertApiError(422, fn () => $this->lobbies->create('tic-tac-toe', 'Percy', true, 'abc'));
    }

    public function testJoinTakesTheNextFreeSeat(): void
    {
        $code = $this->lobbies->create('tic-tac-toe', 'Percy', false, null)['lobby']['code'];

        $joined = $this->lobbies->join(strtolower($code), 'Anna', null);

        $this->assertSame(1, $joined['seatNo']);
        $this->assertCount(2, $joined['lobby']['seats']);
        $this->assertFalse($joined['lobby']['me']['isCreator']);
        $this->assertFalse($joined['lobby']['me']['canManage']);
    }

    public function testJoinRejectsDuplicateNamesFullLobbiesAndUnknownCodes(): void
    {
        $code = $this->lobbies->create('tic-tac-toe', 'Percy', false, null)['lobby']['code'];

        $this->assertApiError(409, fn () => $this->lobbies->join($code, ' percy ', null));
        $this->lobbies->join($code, 'Anna', null);
        $this->assertApiError(409, fn () => $this->lobbies->join($code, 'Piet', null));
        $this->assertApiError(404, fn () => $this->lobbies->join('ZZZZ', 'Piet', null));
        $this->assertApiError(404, fn () => $this->lobbies->join('x', 'Piet', null));
    }

    public function testPrivateLobbyNeedsTheRightPinCaseInsensitive(): void
    {
        $code = $this->lobbies->create('tic-tac-toe', 'Percy', true, 'K7P2')['lobby']['code'];

        $this->assertApiError(403, fn () => $this->lobbies->join($code, 'Anna', null));
        $this->assertApiError(403, fn () => $this->lobbies->join($code, 'Anna', 'WRONG'));
        $this->assertApiError(403, fn () => $this->lobbies->join($code, 'Anna', 'k7p3'));

        $joined = $this->lobbies->join($code, 'Anna', 'k7p2');
        $this->assertSame('K7P2', $joined['lobby']['pin']);
    }

    public function testCannotJoinAfterTheGameStarted(): void
    {
        $code = $this->lobbies->create('tic-tac-toe', 'Percy', false, null)['lobby']['code'];
        $this->pdo->exec("UPDATE lobbies SET status = 'playing'");

        $this->assertApiError(409, fn () => $this->lobbies->join($code, 'Anna', null));
    }

    public function testViewWithoutValidTokenIsPublicOnly(): void
    {
        $result = $this->lobbies->create('tic-tac-toe', 'Percy', true, 'K7P2');
        $code = $result['lobby']['code'];

        foreach ([null, '', 'verkeerd', str_repeat('a', 32)] as $token) {
            $view = $this->lobbies->viewFor($code, $token);
            $this->assertNull($view['me']);
            $this->assertArrayNotHasKey('pin', $view);
            $this->assertArrayNotHasKey('settings', $view);
        }
        $this->assertSame('K7P2', $this->lobbies->viewFor($code, $result['token'])['pin']);
        $this->assertApiError(404, fn () => $this->lobbies->viewFor('ZZZZ', null));
    }

    public function testTokenOfAnotherLobbyGivesNoAccess(): void
    {
        $a = $this->lobbies->create('tic-tac-toe', 'A', false, null);
        $b = $this->lobbies->create('tic-tac-toe', 'B', false, null);

        $this->assertNull($this->lobbies->viewFor($b['lobby']['code'], $a['token'])['me']);
    }

    public function testLeaveRemovesTheSeatAndFreesIt(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $this->lobbies->leave($code, $anna['token']);

        $this->assertCount(1, $this->lobbies->viewFor($code, $created['token'])['seats']);
        $this->assertSame(1, $this->lobbies->join($code, 'Piet', null)['seatNo']);
    }

    public function testCreatorLeavingPassesTheRoleToTheNextHuman(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $this->lobbies->leave($code, $created['token']);

        $view = $this->lobbies->viewFor($code, $anna['token']);
        $this->assertTrue($view['me']['isCreator']);
        $this->assertTrue($view['me']['canManage']);
    }

    public function testLastHumanLeavingRemovesTheLobby(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);

        $this->lobbies->leave($created['lobby']['code'], $created['token']);

        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM lobbies')->fetchColumn());
    }

    public function testLeaveNeedsAValidTokenAndAWaitingLobby(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $this->assertApiError(403, fn () => $this->lobbies->leave($code, null));
        $this->assertApiError(403, fn () => $this->lobbies->leave($code, 'verkeerd'));

        $this->pdo->exec("UPDATE lobbies SET status = 'playing'");
        $this->assertApiError(409, fn () => $this->lobbies->leave($code, $created['token']));
    }

    public function testEveryChangeBumpsTheVersion(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $v1 = $created['lobby']['version'];

        $joined = $this->lobbies->join($code, 'Anna', null);
        $v2 = $joined['lobby']['version'];
        $this->lobbies->leave($code, $joined['token']);
        $v3 = $this->lobbies->viewFor($code, $created['token'])['version'];

        $this->assertGreaterThan($v1, $v2);
        $this->assertGreaterThan($v2, $v3);
    }
}
