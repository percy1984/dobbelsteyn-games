<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Lobbies\LobbyService;

/**
 * Starten gaat altijd via een ready-check: de beheerder drukt op Start (en is dan zelf ready), de
 * andere mensen melden zich ready en daarna begint de aftelling vanzelf.
 */
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

    /** Drie mensen (Percy maker, Anna, Piet); de lobby is daarvoor opgerekt naar vier plaatsen. @return array{code: string, percy: string, anna: string, piet: string} */
    private function threePlayers(): array
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->pdo->exec('UPDATE lobbies SET max_players = 4');
        $anna = $this->lobbies->join($code, 'Anna', null);
        $piet = $this->lobbies->join($code, 'Piet', null);

        return ['code' => $code, 'percy' => $created['token'], 'anna' => $anna['token'], 'piet' => $piet['token']];
    }

    /** @return list<bool> isReady per plaats */
    private function readyFlags(string $code, string $token): array
    {
        return array_map(static fn (array $seat): bool => $seat['isReady'], $this->lobbies->viewFor($code, $token)['seats']);
    }

    public function testStartBeginsAReadyCheckInWhichTheStarterIsAlreadyReady(): void
    {
        $lobby = $this->twoPlayers();

        $view = $this->lobbies->start($lobby['code'], $lobby['percy']);

        $this->assertSame('waiting', $view['status'], 'Het spel begint nog niet.');
        $this->assertTrue($view['readyCheck']);
        $this->assertSame([true, false], $this->readyFlags($lobby['code'], $lobby['percy']));
        $this->assertTrue($this->lobbies->viewFor($lobby['code'], $lobby['anna'])['readyCheck']);
        $this->assertTrue($this->lobbies->poll($lobby['code'], null, null)['readyCheck'], 'Ook voor wie net kijkt.');
    }

    public function testTheCountdownStartsAsSoonAsTheLastPlayerIsReady(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);

        $view = $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->assertSame('waiting', $view['status'], 'Piet is nog niet ready.');
        $this->assertTrue($view['readyCheck']);

        $view = $this->lobbies->setReady($lobby['code'], $lobby['piet'], true);

        $this->assertSame('countdown', $view['status']);
        $this->assertFalse($view['readyCheck']);
        $this->assertGreaterThan(0, $view['countdownMs']);
        $this->assertLessThanOrEqual(LobbyService::COUNTDOWN_SECONDS * 1000, $view['countdownMs']);
    }

    public function testAfterTheCountdownTheGameBegins(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');

        $this->assertSame('playing', $this->lobbies->poll($lobby['code'], $lobby['anna'], null)['status']);
    }

    public function testWithOnlyBotsAsOpponentsTheCountdownStartsImmediately(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 5);

        $view = $this->lobbies->start($code, $created['token']);

        $this->assertSame('countdown', $view['status']);
        $this->assertFalse($view['readyCheck']);
    }

    public function testStartNeedsEnoughPlayersAndAManager(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $this->assertApiError(409, 'not_enough_players', fn () => $this->lobbies->start($code, $created['token']));

        $anna = $this->lobbies->join($code, 'Anna', null);
        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->start($code, $anna['token']));
        $this->assertFalse($this->lobbies->viewFor($code, $anna['token'])['readyCheck']);
    }

    public function testReadyChangesBumpTheVersionSoOthersSeeThem(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $version = $this->lobbies->poll($lobby['code'], $lobby['percy'], null)['version'];

        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $seen = $this->lobbies->poll($lobby['code'], $lobby['percy'], $version);

        $this->assertGreaterThan($version, $seen['version']);
        $this->assertTrue($seen['seats'][1]['isReady']);
    }

    public function testReadyUpIsOnlyForPlayersInTheLobbyDuringAReadyCheck(): void
    {
        $lobby = $this->twoPlayers();

        $this->assertApiError(409, 'no_ready_check', fn () => $this->lobbies->setReady($lobby['code'], $lobby['anna'], true));

        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->setReady($lobby['code'], null, true));
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->setReady($lobby['code'], 'verkeerd', true));

        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->assertApiError(409, 'cannot_change', fn () => $this->lobbies->setReady($lobby['code'], $lobby['anna'], false));
    }

    public function testASecondManagerPressingStartJustJoinsTheRunningCheck(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->setPromoted($lobby['code'], $lobby['percy'], 1, true);
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['piet'], true);

        $view = $this->lobbies->start($lobby['code'], $lobby['anna']);

        $this->assertSame('countdown', $view['status'], 'Percy en Piet blijven ready; Anna was de laatste.');
    }

    public function testTheCountdownStartsWhenTheOnlyNotReadyPlayerLeaves(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);

        $this->lobbies->leave($lobby['code'], $lobby['piet']);

        $this->assertSame('countdown', $this->lobbies->viewFor($lobby['code'], $lobby['percy'])['status']);
    }

    public function testTheCheckStopsWhenTooFewPlayersAreLeft(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);

        $this->lobbies->leave($lobby['code'], $lobby['anna']);
        $view = $this->lobbies->viewFor($lobby['code'], $lobby['percy']);

        $this->assertSame('waiting', $view['status']);
        $this->assertFalse($view['readyCheck']);
    }

    public function testTheCountdownStartsWhenTheLastNotReadyPlayerIsReplacedByABot(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 30 SECOND WHERE name = 'Anna'");
        $this->lobbies->poll($lobby['code'], $lobby['percy'], null);

        $view = $this->lobbies->replaceWithBot($lobby['code'], $lobby['percy'], 1, 5);

        $this->assertSame('countdown', $view['status']);
    }

    public function testANewPlayerJoiningDuringTheCheckIsNotReadyAndSeesTheCheck(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->pdo->exec('UPDATE lobbies SET max_players = 4');
        $this->lobbies->join($code, 'Anna', null);
        $this->lobbies->start($code, $created['token']);

        $piet = $this->lobbies->join($code, 'Piet', null);

        $this->assertTrue($piet['lobby']['readyCheck']);
        $this->assertFalse($piet['lobby']['seats'][2]['isReady']);
    }

    public function testManagerCanCancelTheReadyCheckAndThenNobodyIsReadyAnymore(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);

        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->cancelReadyCheck($lobby['code'], $lobby['anna']));
        $view = $this->lobbies->cancelReadyCheck($lobby['code'], $lobby['percy']);

        $this->assertFalse($view['readyCheck']);
        $this->assertSame('waiting', $view['status']);
        $this->assertSame([false, false, false], $this->readyFlags($lobby['code'], $lobby['percy']));
    }

    public function testANewCheckStartsCleanAfterACancelledOne(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->lobbies->cancelReadyCheck($lobby['code'], $lobby['percy']);

        $view = $this->lobbies->start($lobby['code'], $lobby['percy']);

        $this->assertTrue($view['readyCheck']);
        $this->assertSame([true, false, false], $this->readyFlags($lobby['code'], $lobby['percy']));
    }

    public function testARematchNeedsANewReadyCheck(): void
    {
        $lobby = $this->twoPlayers();
        $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->lobbies->setReady($lobby['code'], $lobby['anna'], true);
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');
        $this->lobbies->poll($lobby['code'], $lobby['percy'], null);
        $this->pdo->exec("UPDATE lobbies SET status = 'finished'");

        $view = $this->lobbies->rematch($lobby['code'], $lobby['percy']);

        $this->assertSame('waiting', $view['status']);
        $this->assertSame([false, false], array_map(static fn (array $s): bool => $s['isReady'], $view['seats']));
        $this->assertFalse($view['readyCheck']);

        $again = $this->lobbies->start($lobby['code'], $lobby['percy']);
        $this->assertSame('waiting', $again['status'], 'Anna moet zich opnieuw ready melden.');
        $this->assertTrue($again['readyCheck']);
    }

    public function testStartWorksForADisconnectedCreatorViaTheNextManager(): void
    {
        $lobby = $this->twoPlayers();
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 30 SECOND WHERE name = 'Percy'");
        $this->lobbies->poll($lobby['code'], $lobby['anna'], null);

        $view = $this->lobbies->start($lobby['code'], $lobby['anna']);

        $this->assertTrue($view['readyCheck']);
        $this->assertSame([false, true], $this->readyFlags($lobby['code'], $lobby['anna']));
    }
}
