<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Lobbies\LobbyService;

/** Wegvallen en terugkomen: wie beslist, een bot die overneemt, en het spel beëindigen. */
final class DisconnectTest extends DbTestCase
{
    private LobbyService $lobbies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lobbies = new LobbyService($this->pdo, GameRegistry::default(), new Rng(static fn (int $min, int $max): int => $min));
    }

    /** Start het spel nadat iedereen zich ready gemeld heeft (de ready-regels zelf testen we in ReadyCheckTest). */
    private function startReady(string $code, ?string $token): array
    {
        $this->pdo->exec('UPDATE seats SET is_ready = 1');

        return $this->lobbies->start($code, $token);
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

    /** Laat een speler "weg" raken: geen heartbeat meer, en een andere speler ziet dat bij zijn poll. */
    private function makeAway(string $code, string $name, string $observerToken): void
    {
        $this->pdo->prepare('UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 30 SECOND WHERE name = ?')->execute([$name]);
        $this->lobbies->poll($code, $observerToken, null);
    }

    /** Lobby met twee mensen in een lopend spel; Anna (plaats 1) begint. @return array{code: string, percy: string, anna: string} */
    private function runningGame(): array
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);
        $this->lobbies->updateSettings($code, $created['token'], ['starter' => 'second']);
        $this->startReady($code, $created['token']);
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');
        $this->lobbies->poll($code, $created['token'], null);

        return ['code' => $code, 'percy' => $created['token'], 'anna' => $anna['token']];
    }

    /** Wachtkamer met drie mensen (Percy maker, Anna beheerder, Piet gewoon) voor de beheerregels. */
    private function threePlayers(): array
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->pdo->exec('UPDATE lobbies SET max_players = 4');
        $anna = $this->lobbies->join($code, 'Anna', null);
        $piet = $this->lobbies->join($code, 'Piet', null);
        $this->lobbies->setPromoted($code, $created['token'], 1, true);

        return ['code' => $code, 'percy' => $created['token'], 'anna' => $anna['token'], 'piet' => $piet['token']];
    }

    private function canManage(string $code, string $token): bool
    {
        return $this->lobbies->viewFor($code, $token)['me']['canManage'];
    }

    public function testManagementStaysWithCreatorAndPromotedWhileTheyArePresent(): void
    {
        $lobby = $this->threePlayers();

        $this->assertTrue($this->canManage($lobby['code'], $lobby['percy']));
        $this->assertTrue($this->canManage($lobby['code'], $lobby['anna']));
        $this->assertFalse($this->canManage($lobby['code'], $lobby['piet']));
        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->addBot($lobby['code'], $lobby['piet'], 5));
    }

    public function testPromotedPlayerDecidesWhenTheCreatorIsAway(): void
    {
        $lobby = $this->threePlayers();

        $this->makeAway($lobby['code'], 'Percy', $lobby['anna']);

        $this->assertTrue($this->canManage($lobby['code'], $lobby['anna']));
        $this->assertFalse($this->canManage($lobby['code'], $lobby['piet']));
        $this->lobbies->addBot($lobby['code'], $lobby['anna'], 5);
    }

    public function testNextPlayerInLineDecidesWhenAllManagersAreAway(): void
    {
        $lobby = $this->threePlayers();
        $this->lobbies->poll($lobby['code'], $lobby['piet'], null);

        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 30 SECOND WHERE name IN ('Percy', 'Anna')");
        $this->lobbies->poll($lobby['code'], $lobby['piet'], null);

        $this->assertTrue($this->canManage($lobby['code'], $lobby['piet']));
        $this->lobbies->addBot($lobby['code'], $lobby['piet'], 3);
    }

    public function testManagementReturnsToTheCreatorWhenHeComesBack(): void
    {
        $lobby = $this->threePlayers();
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 30 SECOND WHERE name IN ('Percy', 'Anna')");
        $this->lobbies->poll($lobby['code'], $lobby['piet'], null);
        $this->assertTrue($this->canManage($lobby['code'], $lobby['piet']));

        $this->lobbies->poll($lobby['code'], $lobby['percy'], null);

        $this->assertTrue($this->canManage($lobby['code'], $lobby['percy']));
        $this->assertFalse($this->canManage($lobby['code'], $lobby['piet']));
    }

    public function testManagerWithAStaleAwayFlagCanStillAct(): void
    {
        $lobby = $this->threePlayers();
        $this->makeAway($lobby['code'], 'Percy', $lobby['piet']);

        // Percy is net terug en klikt meteen, nog voor zijn eerste poll de vlag heeft gewist.
        $view = $this->lobbies->addBot($lobby['code'], $lobby['percy'], 5);

        $this->assertFalse($view['seats'][0]['isAway']);
        $this->assertTrue($view['me']['canManage']);
    }

    public function testManagerReplacesAnAwayPlayerWithABotThatTakesOverTheTurn(): void
    {
        $game = $this->runningGame();
        $this->makeAway($game['code'], 'Anna', $game['percy']);
        $waiting = $this->lobbies->poll($game['code'], $game['percy'], null);
        $this->assertTrue($waiting['seats'][1]['isAway']);
        $this->assertSame([1], $waiting['activeSeats'], 'Het spel wacht op Anna.');

        $view = $this->lobbies->replaceWithBot($game['code'], $game['percy'], 1, 10);

        $this->assertSame('bot', $view['seats'][1]['kind']);
        $this->assertSame('Anna (bot)', $view['seats'][1]['name']);
        $this->assertSame(10, $view['seats'][1]['botLevel']);
        $this->assertFalse($view['seats'][1]['isAway']);
        $this->assertSame('playing', $view['status']);
        $this->assertSame(1, $view['gameView']['moves'], 'De bot deed meteen de zet waar Anna aan toe was.');
        $this->assertSame([0], $view['activeSeats']);
        $this->assertGreaterThan($waiting['version'], $view['version']);
    }

    public function testTheReplacedPlayersOldPhoneLosesAccess(): void
    {
        $game = $this->runningGame();
        $this->makeAway($game['code'], 'Anna', $game['percy']);
        $this->lobbies->replaceWithBot($game['code'], $game['percy'], 1, 5);

        $this->assertNull($this->lobbies->poll($game['code'], $game['anna'], null)['me']);
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->move($game['code'], $game['anna'], ['cell' => 0]));
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->sendChat($game['code'], $game['anna'], 'Hallo?'));
    }

    public function testOnlyAnAwayHumanCanBeReplacedAndTheFirstActionWins(): void
    {
        $game = $this->runningGame();

        $this->assertApiError(409, 'not_away', fn () => $this->lobbies->replaceWithBot($game['code'], $game['percy'], 1, 5));
        $this->assertApiError(409, 'not_away', fn () => $this->lobbies->replaceWithBot($game['code'], $game['percy'], 0, 5));
        $this->assertApiError(404, 'seat_not_found', fn () => $this->lobbies->replaceWithBot($game['code'], $game['percy'], 9, 5));
        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->replaceWithBot($game['code'], $game['anna'], 0, 5));

        $this->makeAway($game['code'], 'Anna', $game['percy']);
        $this->assertApiError(422, 'bad_level', fn () => $this->lobbies->replaceWithBot($game['code'], $game['percy'], 1, 11));
        $this->lobbies->replaceWithBot($game['code'], $game['percy'], 1, 5);
        // Een tweede beheerder die hetzelfde wil, komt te laat: de plaats is al van een bot.
        $this->assertApiError(409, 'not_away', fn () => $this->lobbies->replaceWithBot($game['code'], $game['percy'], 1, 5));
    }

    public function testWhenTheCreatorIsReplacedTheCreatorRoleMovesToAHuman(): void
    {
        $game = $this->runningGame();
        $this->makeAway($game['code'], 'Percy', $game['anna']);
        $this->assertTrue($this->canManage($game['code'], $game['anna']), 'Anna is de volgende in de rij.');

        $view = $this->lobbies->replaceWithBot($game['code'], $game['anna'], 0, 7);

        $this->assertSame('bot', $view['seats'][0]['kind']);
        $this->assertFalse($view['seats'][0]['isCreator']);
        $this->assertTrue($view['seats'][1]['isCreator']);
        $this->assertTrue($view['me']['isCreator']);
    }

    public function testManagerCanEndTheGameAndThenStartOver(): void
    {
        $game = $this->runningGame();
        $this->makeAway($game['code'], 'Anna', $game['percy']);

        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->endGame($game['code'], $game['anna']));
        $ended = $this->lobbies->endGame($game['code'], $game['percy']);

        $this->assertSame('ended', $ended['status']);
        $this->assertArrayNotHasKey('gameView', $ended);
        $this->assertApiError(409, 'not_playing', fn () => $this->lobbies->move($game['code'], $game['percy'], ['cell' => 0]));
        $this->assertApiError(409, 'not_playing', fn () => $this->lobbies->endGame($game['code'], $game['percy']));
        $this->assertSame([], $this->lobbies->listForGame('tic-tac-toe'), 'Een beëindigd spel staat niet meer in de lijst.');

        $again = $this->lobbies->rematch($game['code'], $game['percy']);
        $this->assertSame('waiting', $again['status']);
    }

    public function testEndingNeedsARunningGameOrCountdown(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->assertApiError(409, 'not_playing', fn () => $this->lobbies->endGame($code, $created['token']));

        $this->lobbies->addBot($code, $created['token'], 3);
        $this->startReady($code, $created['token']);
        $this->assertSame('ended', $this->lobbies->endGame($code, $created['token'])['status']);
    }

    public function testAnAwayPlayerComingBackFindsTheirSeatAndTheGameWaiting(): void
    {
        $game = $this->runningGame();
        $this->makeAway($game['code'], 'Anna', $game['percy']);

        $back = $this->lobbies->poll($game['code'], $game['anna'], null);

        $this->assertFalse($back['seats'][1]['isAway']);
        $this->assertSame(1, $back['me']['seatNo']);
        $this->assertSame([1], $back['activeSeats']);
        $this->assertSame('playing', $back['status']);
        $this->lobbies->move($game['code'], $game['anna'], ['cell' => 4]);
    }

    public function testGameWaitsWithoutATimeout(): void
    {
        $game = $this->runningGame();
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 3 DAY WHERE name = 'Anna'");
        $this->lobbies->poll($game['code'], $game['percy'], null);

        $view = $this->lobbies->poll($game['code'], $game['percy'], null);

        $this->assertSame('playing', $view['status']);
        $this->assertTrue($view['seats'][1]['isAway']);
    }
}
