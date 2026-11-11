<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Lobbies\LobbyService;

/** Ready melden, de ready-check van de beheerder, en dat starten daarvan afhangt. */
final class ReadyCheckTest extends DbTestCase
{
    private LobbyService $lobbies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lobbies = new LobbyService($this->pdo, GameRegistry::default(), new Rng(static fn (int $min, int $max): int => $min));
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

    /** @return array{code: string, percy: string, anna: string} */
    private function twoPlayers(): array
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        return ['code' => $code, 'percy' => $created['token'], 'anna' => $anna['token']];
    }

    /** @return list<bool> isReady per plaats */
    private function readyFlags(string $code, string $token): array
    {
        return array_map(static fn (array $seat): bool => $seat['isReady'], $this->lobbies->viewFor($code, $token)['seats']);
    }

    public function testNewPlayersAreNotReadyButBotsAre(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $view = $this->lobbies->addBot($code, $created['token'], 5);

        $this->assertSame([false, true], $this->readyFlags($code, $created['token']));
        $this->assertFalse($view['allReady']);
        $this->assertFalse($view['readyCheck']);
    }

    public function testStartingNeedsEveryHumanToBeReadyIncludingTheCreator(): void
    {
        $lobby = $this->twoPlayers();

        $this->assertApiError(409, 'not_ready', fn () => $this->lobbies->start($lobby['code'], $lobby['percy']));
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->assertApiError(409, 'not_ready', fn () => $this->lobbies->start($lobby['code'], $lobby['percy']));

        $view = $this->lobbies->setReady($lobby['code'], $lobby['percy'], true);
        $this->assertTrue($view['allReady']);
        $this->assertSame('countdown', $this->lobbies->start($lobby['code'], $lobby['percy'])['status']);
    }

    public function testAHumanVersusABotOnlyNeedsTheHumanToBeReady(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 5);

        $this->assertApiError(409, 'not_ready', fn () => $this->lobbies->start($code, $created['token']));
        $this->lobbies->setReady($code, $created['token'], true);

        $this->assertSame('countdown', $this->lobbies->start($code, $created['token'])['status']);
    }

    public function testNotEnoughPlayersIsReportedBeforeNotReady(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);

        $this->assertApiError(409, 'not_enough_players', fn () => $this->lobbies->start($created['lobby']['code'], $created['token']));
    }

    public function testPlayersCanToggleReadyAndEveryoneSeesIt(): void
    {
        $lobby = $this->twoPlayers();

        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->assertSame([false, true], $this->readyFlags($lobby['code'], $lobby['percy']));
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], false);
        $this->assertSame([false, false], $this->readyFlags($lobby['code'], $lobby['percy']));
    }

    public function testReadyChangesBumpTheVersionSoOthersSeeThem(): void
    {
        $lobby = $this->twoPlayers();
        $version = $this->lobbies->poll($lobby['code'], $lobby['percy'], null)['version'];

        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $seen = $this->lobbies->poll($lobby['code'], $lobby['percy'], $version);

        $this->assertGreaterThan($version, $seen['version']);
        $this->assertTrue($seen['seats'][1]['isReady']);
    }

    public function testOnlyPlayersInTheLobbyCanReadyUpAndOnlyWhileWaiting(): void
    {
        $lobby = $this->twoPlayers();

        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->setReady($lobby['code'], null, true));
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->setReady($lobby['code'], 'verkeerd', true));

        $this->lobbies->setReady($lobby['code'], $lobby['percy'], true);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->assertApiError(409, 'cannot_change', fn () => $this->lobbies->setReady($lobby['code'], $lobby['anna'], false));
    }

    public function testOnlyAManagerCanStartAReadyCheckAndEveryoneSeesIt(): void
    {
        $lobby = $this->twoPlayers();

        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->startReadyCheck($lobby['code'], $lobby['anna']));
        $this->assertFalse($this->lobbies->viewFor($lobby['code'], $lobby['anna'])['readyCheck']);

        $view = $this->lobbies->startReadyCheck($lobby['code'], $lobby['percy']);

        $this->assertTrue($view['readyCheck']);
        $this->assertTrue($this->lobbies->viewFor($lobby['code'], $lobby['anna'])['readyCheck']);
        $this->assertTrue($this->lobbies->poll($lobby['code'], null, null)['readyCheck'], 'Ook voor wie net kijkt.');
    }

    public function testNoReadyCheckWhenEveryoneIsAlreadyReady(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->setReady($lobby['code'], $lobby['percy'], true);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);

        $this->assertApiError(409, 'all_ready', fn () => $this->lobbies->startReadyCheck($lobby['code'], $lobby['percy']));
    }

    public function testReadyCheckEndsByItselfWhenTheLastPlayerIsReady(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->startReadyCheck($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['percy'], true);
        $this->assertTrue($this->lobbies->viewFor($lobby['code'], $lobby['anna'])['readyCheck'], 'Anna is nog niet ready.');

        $view = $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);

        $this->assertFalse($view['readyCheck']);
        $this->assertTrue($view['allReady']);
        // Wie daarna weer niet-ready wordt, opent de check niet opnieuw.
        $this->assertFalse($this->lobbies->setReady($lobby['code'], $lobby['anna'], false)['readyCheck']);
    }

    public function testReadyCheckEndsWhenTheOnlyNotReadyPlayerLeaves(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->setReady($lobby['code'], $lobby['percy'], true);
        $this->lobbies->startReadyCheck($lobby['code'], $lobby['percy']);

        $this->lobbies->leave($lobby['code'], $lobby['anna']);
        $view = $this->lobbies->viewFor($lobby['code'], $lobby['percy']);

        $this->assertFalse($view['readyCheck']);
        $this->assertTrue($view['allReady']);
    }

    public function testANewPlayerJoiningDuringTheCheckIsNotReadyAndSeesTheCheck(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->pdo->exec('UPDATE lobbies SET max_players = 4');
        $this->lobbies->setReady($code, $created['token'], true);
        $this->lobbies->join($code, 'Anna', null);
        $this->lobbies->startReadyCheck($code, $created['token']);

        $piet = $this->lobbies->join($code, 'Piet', null);

        $this->assertTrue($piet['lobby']['readyCheck']);
        $this->assertFalse($piet['lobby']['seats'][2]['isReady']);
    }

    public function testManagerCanCancelTheReadyCheck(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->startReadyCheck($lobby['code'], $lobby['percy']);

        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->cancelReadyCheck($lobby['code'], $lobby['anna']));
        $view = $this->lobbies->cancelReadyCheck($lobby['code'], $lobby['percy']);

        $this->assertFalse($view['readyCheck']);
        $this->assertFalse($view['allReady']);
    }

    public function testStartingEndsTheCheckAndARematchResetsEveryoneToNotReady(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->startReadyCheck($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['percy'], true);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');
        $this->lobbies->poll($lobby['code'], $lobby['percy'], null);
        $this->pdo->exec("UPDATE lobbies SET status = 'finished'");

        $view = $this->lobbies->rematch($lobby['code'], $lobby['percy']);

        $this->assertSame('waiting', $view['status']);
        $this->assertSame([false, false], array_map(static fn (array $s): bool => $s['isReady'], $view['seats']));
        $this->assertFalse($view['readyCheck']);
        $this->assertApiError(409, 'not_ready', fn () => $this->lobbies->start($lobby['code'], $lobby['percy']));
    }

    public function testReadyCheckWorksForADisconnectedCreatorViaTheNextManager(): void
    {
        $lobby = $this->twoPlayers();
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 30 SECOND WHERE name = 'Percy'");
        $this->lobbies->poll($lobby['code'], $lobby['anna'], null);

        $view = $this->lobbies->startReadyCheck($lobby['code'], $lobby['anna']);

        $this->assertTrue($view['readyCheck']);
    }
}
