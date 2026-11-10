<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Lobbies\LobbyService;

/** Het hele spelverloop via de lobbyservice: starten, aftellen, zetten, bots, einde en rematch. */
final class GameFlowTest extends DbTestCase
{
    private LobbyService $lobbies;

    protected function setUp(): void
    {
        parent::setUp();
        // Vaste "toevalsbron": altijd het laagste getal, zodat de tests herhaalbaar zijn.
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

    /** @return array{code: string, host: string, guest: string} lobby met twee mensen, starter = eerste plaats */
    private function twoHumans(): array
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $guest = $this->lobbies->join($code, 'Anna', null);
        $this->lobbies->updateSettings($code, $created['token'], ['starter' => 'first']);

        return ['code' => $code, 'host' => $created['token'], 'guest' => $guest['token']];
    }

    /** Laat de aftelling verlopen en haalt de lobby op (de poll zet het spel in gang). */
    private function finishCountdown(string $code, string $token): array
    {
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');

        return $this->lobbies->poll($code, $token, null);
    }

    public function testStartNeedsEnoughPlayersAndAManager(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->assertApiError(409, 'not_enough_players', fn () => $this->lobbies->start($code, $created['token']));

        $guest = $this->lobbies->join($code, 'Anna', null);
        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->start($code, $guest['token']));
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->start($code, null));
    }

    public function testBotsCountTowardsTheRequiredPlayers(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 5);

        $view = $this->lobbies->start($code, $created['token']);

        $this->assertSame('countdown', $view['status']);
    }

    public function testStartBeginsACountdownOfAboutThreeSeconds(): void
    {
        $lobby = $this->twoHumans();

        $view = $this->lobbies->start($lobby['code'], $lobby['host']);

        $this->assertSame('countdown', $view['status']);
        $this->assertGreaterThan(1500, $view['countdownMs']);
        $this->assertLessThanOrEqual(3000, $view['countdownMs']);
        $this->assertArrayNotHasKey('gameView', $view, 'Tijdens de aftelling is er nog geen spel.');
        $this->assertApiError(409, 'cannot_change', fn () => $this->lobbies->start($lobby['code'], $lobby['host']));
        $this->assertApiError(409, 'cannot_change', fn () => $this->lobbies->updateSettings($lobby['code'], $lobby['host'], ['starter' => 'second']));
        $this->assertApiError(409, 'not_playing', fn () => $this->lobbies->move($lobby['code'], $lobby['host'], ['cell' => 0]));
    }

    public function testGameBeginsWhenTheCountdownIsOverAndEveryoneGetsTheirOwnView(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);

        $stillCounting = $this->lobbies->poll($lobby['code'], $lobby['host'], null);
        $this->assertSame('countdown', $stillCounting['status']);

        $host = $this->finishCountdown($lobby['code'], $lobby['host']);
        $guest = $this->lobbies->poll($lobby['code'], $lobby['guest'], null);

        $this->assertSame('playing', $host['status']);
        $this->assertNull($host['countdownMs']);
        $this->assertSame([0], $host['activeSeats']);
        $this->assertSame('X', $host['gameView']['yourMark']);
        $this->assertSame('O', $guest['gameView']['yourMark']);
        $this->assertNull($host['result']);
        $this->assertSame(array_fill(0, 9, null), $host['gameView']['board']);
        $this->assertArrayNotHasKey('gameView', $this->lobbies->poll($lobby['code'], null, null), 'Zonder plaats geen spelstaat.');
    }

    public function testStartingTheGameTwiceViaAdvanceIsHarmless(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');

        $this->lobbies->advance($lobby['code']);
        $this->lobbies->advance($lobby['code']);
        $view = $this->lobbies->poll($lobby['code'], $lobby['host'], null);

        $this->assertSame('playing', $view['status']);
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM game_states')->fetchColumn());
        $this->assertSame(0, $view['turnNo']);
    }

    public function testMovesAreValidatedOnTheServer(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);
        $this->finishCountdown($lobby['code'], $lobby['host']);

        $this->assertApiError(409, 'not_your_turn', fn () => $this->lobbies->move($lobby['code'], $lobby['guest'], ['cell' => 4]));
        $this->assertApiError(422, 'invalid_move', fn () => $this->lobbies->move($lobby['code'], $lobby['host'], ['cell' => 9]));
        $this->assertApiError(422, 'invalid_move', fn () => $this->lobbies->move($lobby['code'], $lobby['host'], []));
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->move($lobby['code'], null, ['cell' => 4]));
        $this->assertApiError(403, 'not_in_lobby', fn () => $this->lobbies->move($lobby['code'], 'verkeerd', ['cell' => 4]));

        $view = $this->lobbies->move($lobby['code'], $lobby['host'], ['cell' => 4]);
        $this->assertSame('X', $view['gameView']['board'][4]);
        $this->assertSame([1], $view['activeSeats']);
        $this->assertSame(1, $view['turnNo']);
        $this->assertApiError(422, 'invalid_move', fn () => $this->lobbies->move($lobby['code'], $lobby['guest'], ['cell' => 4]));
    }

    public function testEveryMoveBumpsTheVersionSoOthersSeeIt(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);
        $playing = $this->finishCountdown($lobby['code'], $lobby['host']);

        $this->lobbies->move($lobby['code'], $lobby['host'], ['cell' => 0]);
        $seenByGuest = $this->lobbies->poll($lobby['code'], $lobby['guest'], $playing['version']);

        $this->assertArrayHasKey('gameView', $seenByGuest);
        $this->assertSame('X', $seenByGuest['gameView']['board'][0]);
        $this->assertGreaterThan($playing['version'], $seenByGuest['version']);
    }

    public function testWinningEndsTheGameAndNoMoreMovesAreAccepted(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);
        $this->finishCountdown($lobby['code'], $lobby['host']);

        foreach ([[0, 'host'], [3, 'guest'], [1, 'host'], [4, 'guest']] as [$cell, $who]) {
            $this->lobbies->move($lobby['code'], $lobby[$who], ['cell' => $cell]);
        }
        $final = $this->lobbies->move($lobby['code'], $lobby['host'], ['cell' => 2]);

        $this->assertSame('finished', $final['status']);
        $this->assertSame(['winners' => [0]], $final['result']);
        $this->assertSame([], $final['activeSeats']);
        $this->assertSame([0, 1, 2], $final['gameView']['line']);
        $this->assertApiError(409, 'not_playing', fn () => $this->lobbies->move($lobby['code'], $lobby['guest'], ['cell' => 8]));
    }

    public function testGameVersusBotPlaysOnTheServerUntilTheEnd(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 10);
        $this->lobbies->updateSettings($code, $created['token'], ['starter' => 'second']);
        $this->lobbies->start($code, $created['token']);

        $view = $this->finishCountdown($code, $created['token']);

        // De bot (plaats 1) begon en heeft zijn zet al gedaan, voordat de mens iets deed.
        $this->assertSame('playing', $view['status']);
        $this->assertSame([0], $view['activeSeats']);
        $this->assertSame(1, $view['gameView']['moves']);
        $this->assertSame('X', $view['gameView']['yourMark']);

        for ($turn = 0; $turn < 9 && $view['status'] === 'playing'; $turn++) {
            $free = array_keys(array_filter($view['gameView']['board'], static fn (?string $c): bool => $c === null));
            $view = $this->lobbies->move($code, $created['token'], ['cell' => $free[0]]);
            // Na elke zet van de mens heeft de bot al geantwoord (of het spel is afgelopen).
            $this->assertTrue($view['status'] === 'finished' || $view['activeSeats'] === [0]);
        }

        $this->assertSame('finished', $view['status']);
        $this->assertNotSame(['winners' => [0]], $view['result'], 'Een niveau-10-bot verliest niet van "eerste vrije vakje".');
    }

    public function testBotThatStartsMovesImmediatelyWhenTheGameBegins(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 1);
        $this->lobbies->updateSettings($code, $created['token'], ['starter' => 'second']);
        $this->lobbies->start($code, $created['token']);

        $view = $this->finishCountdown($code, $created['token']);

        $this->assertSame(1, $view['gameView']['moves']);
        $this->assertSame([0], $view['activeSeats']);
    }

    public function testRematchResetsAFinishedLobbyForTheSamePlayers(): void
    {
        $lobby = $this->twoHumans();
        $this->assertApiError(409, 'not_finished', fn () => $this->lobbies->rematch($lobby['code'], $lobby['host']));
        $this->lobbies->start($lobby['code'], $lobby['host']);
        $this->finishCountdown($lobby['code'], $lobby['host']);
        foreach ([[0, 'host'], [3, 'guest'], [1, 'host'], [4, 'guest'], [2, 'host']] as [$cell, $who]) {
            $this->lobbies->move($lobby['code'], $lobby[$who], ['cell' => $cell]);
        }

        $this->assertApiError(403, 'not_allowed', fn () => $this->lobbies->rematch($lobby['code'], $lobby['guest']));
        $view = $this->lobbies->rematch($lobby['code'], $lobby['host']);

        $this->assertSame('waiting', $view['status']);
        $this->assertCount(2, $view['seats']);
        $this->assertArrayNotHasKey('gameView', $view);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM game_states')->fetchColumn());

        $again = $this->lobbies->start($lobby['code'], $lobby['host']);
        $this->assertSame('countdown', $again['status']);
    }

    public function testCannotLeaveOrJoinOnceTheCountdownStarted(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);

        $this->assertApiError(409, 'cannot_leave', fn () => $this->lobbies->leave($lobby['code'], $lobby['guest']));
        $this->assertApiError(409, 'game_started', fn () => $this->lobbies->join($lobby['code'], 'Piet', null));
    }

    public function testFinishedLobbiesAreNotListed(): void
    {
        $lobby = $this->twoHumans();
        $this->lobbies->start($lobby['code'], $lobby['host']);
        $this->finishCountdown($lobby['code'], $lobby['host']);
        $this->assertCount(1, $this->lobbies->listForGame('tic-tac-toe'));

        foreach ([[0, 'host'], [3, 'guest'], [1, 'host'], [4, 'guest'], [2, 'host']] as [$cell, $who]) {
            $this->lobbies->move($lobby['code'], $lobby[$who], ['cell' => $cell]);
        }

        $this->assertSame([], $this->lobbies->listForGame('tic-tac-toe'));
    }
}
