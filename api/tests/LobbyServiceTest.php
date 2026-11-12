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

    private function ageSeat(string $name, int $seconds): void
    {
        $this->pdo->prepare('UPDATE seats SET last_seen_at = NOW(3) - INTERVAL ' . $seconds . ' SECOND WHERE name = ?')->execute([$name]);
    }

    public function testPollAnswersTinyWhenNothingChanged(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $version = $this->lobbies->poll($code, $created['token'], null)['version'];

        $this->assertSame(['changed' => false, 'version' => $version], $this->lobbies->poll($code, $created['token'], $version));
        $this->assertSame(['changed' => false, 'version' => $version], $this->lobbies->poll($code, null, $version));
    }

    public function testPollReturnsTheFullViewAfterAChangeOrWithAnOldVersion(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $old = $created['lobby']['version'];

        $this->lobbies->join($code, 'Anna', null);
        $view = $this->lobbies->poll($code, $created['token'], $old);

        $this->assertArrayHasKey('seats', $view);
        $this->assertCount(2, $view['seats']);
        $this->assertGreaterThan($old, $view['version']);
        $this->assertArrayHasKey('seats', $this->lobbies->poll($code, $created['token'], 999999));
    }

    public function testPlayerWithoutHeartbeatBecomesAwayOnce(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->join($code, 'Anna', null);
        $version = $this->lobbies->poll($code, $created['token'], null)['version'];

        $this->ageSeat('Anna', 30);
        $view = $this->lobbies->poll($code, $created['token'], $version);

        $this->assertGreaterThan($version, $view['version']);
        $this->assertFalse($view['seats'][0]['isAway']);
        $this->assertTrue($view['seats'][1]['isAway']);
        // Nogmaals pollen verandert niets meer: er wordt niet steeds opnieuw "weg" gemeld.
        $this->assertSame(
            ['changed' => false, 'version' => $view['version']],
            $this->lobbies->poll($code, $created['token'], $view['version']),
        );
    }

    public function testShortSilenceDoesNotCountAsAway(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->join($code, 'Anna', null);

        $this->ageSeat('Anna', 10);

        $this->assertFalse($this->lobbies->poll($code, $created['token'], null)['seats'][1]['isAway']);
    }

    public function testReturningPlayerIsNoLongerAwayAndOthersSeeIt(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);
        $this->ageSeat('Anna', 30);
        $away = $this->lobbies->poll($code, $created['token'], null);
        $this->assertTrue($away['seats'][1]['isAway']);

        $back = $this->lobbies->poll($code, $anna['token'], null);

        $this->assertFalse($back['seats'][1]['isAway']);
        $this->assertGreaterThan($away['version'], $back['version']);
        $seenByPercy = $this->lobbies->poll($code, $created['token'], $away['version']);
        $this->assertFalse($seenByPercy['seats'][1]['isAway']);
    }

    public function testHeartbeatWritesAreThrottled(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $before = $this->pdo->query('SELECT last_seen_at FROM seats')->fetchColumn();

        usleep(20_000);
        $this->lobbies->poll($code, $created['token'], null);

        $this->assertSame($before, $this->pdo->query('SELECT last_seen_at FROM seats')->fetchColumn());
    }

    public function testPollWithoutTokenIsNotAHeartbeat(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->ageSeat('Percy', 30);

        $this->lobbies->poll($code, null, null);
        $this->lobbies->poll($code, 'verkeerd', null);

        $seat = $this->pdo->query('SELECT last_seen_at < NOW(3) - INTERVAL 20 SECOND AS old FROM seats')->fetchColumn();
        $this->assertSame(1, (int) $seat);
    }

    public function testPollOfUnknownLobbyIs404(): void
    {
        $this->assertApiError(404, fn () => $this->lobbies->poll('ZZZZ', null, null));
    }

    public function testListShowsRunningLobbiesWithCountsLockAndHost(): void
    {
        $open = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $full = $this->lobbies->create('tic-tac-toe', 'Anna', true, 'K7P2');
        $this->lobbies->join($full['lobby']['code'], 'Piet', 'K7P2');

        $list = $this->lobbies->listForGame('tic-tac-toe');

        $this->assertCount(2, $list);
        $byCode = array_column($list, null, 'code');
        $this->assertSame(
            ['code' => $open['lobby']['code'], 'status' => 'waiting', 'isPrivate' => false, 'host' => 'Percy', 'playerCount' => 1, 'maxPlayers' => 2, 'joinable' => true],
            $byCode[$open['lobby']['code']],
        );
        $this->assertTrue($byCode[$full['lobby']['code']]['isPrivate']);
        $this->assertSame(2, $byCode[$full['lobby']['code']]['playerCount']);
        $this->assertFalse($byCode[$full['lobby']['code']]['joinable'], 'Een volle lobby is niet joinbaar.');
        $this->assertArrayNotHasKey('pin', $byCode[$full['lobby']['code']], 'De PIN lekt niet via de lijst.');
    }

    public function testListHidesFinishedLobbiesAndMarksRunningOnesNotJoinable(): void
    {
        $a = $this->lobbies->create('tic-tac-toe', 'A', false, null);
        $b = $this->lobbies->create('tic-tac-toe', 'B', false, null);
        $c = $this->lobbies->create('tic-tac-toe', 'C', false, null);
        $this->pdo->prepare("UPDATE lobbies SET status = 'playing' WHERE code = ?")->execute([$a['lobby']['code']]);
        $this->pdo->prepare("UPDATE lobbies SET status = 'finished' WHERE code = ?")->execute([$b['lobby']['code']]);

        $byCode = array_column($this->lobbies->listForGame('tic-tac-toe'), null, 'code');

        $this->assertCount(2, $byCode);
        $this->assertArrayNotHasKey($b['lobby']['code'], $byCode);
        $this->assertFalse($byCode[$a['lobby']['code']]['joinable']);
        $this->assertTrue($byCode[$c['lobby']['code']]['joinable']);
    }

    public function testListHidesALobbyOnceEveryHumanIsGoneAndShowsItAgainWhenSomeoneReturns(): void
    {
        $left = $this->lobbies->create('tic-tac-toe', 'Weg', false, null);
        $this->lobbies->addBot($left['lobby']['code'], $left['token'], 5);
        $stays = $this->lobbies->create('tic-tac-toe', 'Blijft', false, null);
        // De maker sloot zijn browser: geen heartbeat meer. De bot houdt de lobby niet in de lijst.
        $seconds = LobbyService::LISTED_WHILE_SEEN_SECONDS + 5;
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL $seconds SECOND WHERE name = 'Weg'");

        $this->assertSame([$stays['lobby']['code']], array_column($this->lobbies->listForGame('tic-tac-toe'), 'code'));

        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) - INTERVAL 20 SECOND WHERE name = 'Weg'");
        $this->assertCount(2, $this->lobbies->listForGame('tic-tac-toe'), 'Even weg (telefoon op zwart) is nog niet verdwenen.');
    }

    public function testListIsNewestFirstAndEmptyWhenThereAreNoLobbies(): void
    {
        $this->assertSame([], $this->lobbies->listForGame('tic-tac-toe'));

        $first = $this->lobbies->create('tic-tac-toe', 'Eerste', false, null);
        $second = $this->lobbies->create('tic-tac-toe', 'Tweede', false, null);

        $this->assertSame(
            [$second['lobby']['code'], $first['lobby']['code']],
            array_column($this->lobbies->listForGame('tic-tac-toe'), 'code'),
        );
    }

    public function testListRejectsAnUnknownGame(): void
    {
        $this->assertApiError(404, fn () => $this->lobbies->listForGame('mancala'));
        $this->assertApiError(404, fn () => $this->lobbies->listForGame(''));
    }

    public function testCreatorCanChangeSettingsAndEveryoneSeesThem(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $view = $this->lobbies->updateSettings($code, $created['token'], ['starter' => 'second']);

        $this->assertSame(['starter' => 'second'], $view['settings']);
        $this->assertSame(['starter' => 'second'], $this->lobbies->viewFor($code, $anna['token'])['settings']);
        $this->assertGreaterThan($created['lobby']['version'], $view['version']);
    }

    public function testOrdinaryPlayerCannotChangeSettings(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $this->assertApiError(403, fn () => $this->lobbies->updateSettings($code, $anna['token'], ['starter' => 'first']));
        $this->assertApiError(403, fn () => $this->lobbies->updateSettings($code, null, ['starter' => 'first']));
        $this->assertSame(['starter' => 'random'], $this->lobbies->viewFor($code, $created['token'])['settings']);
    }

    public function testPromotedPlayerMayChangeSettingsUntilDemoted(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $promoted = $this->lobbies->setPromoted($code, $created['token'], 1, true);
        $this->assertTrue($promoted['seats'][1]['isPromoted']);
        $this->assertTrue($this->lobbies->viewFor($code, $anna['token'])['me']['canManage']);
        $this->lobbies->updateSettings($code, $anna['token'], ['starter' => 'first']);

        $this->lobbies->setPromoted($code, $created['token'], 1, false);
        $this->assertApiError(403, fn () => $this->lobbies->updateSettings($code, $anna['token'], ['starter' => 'second']));
    }

    public function testOnlyTheCreatorMayPromote(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);
        $this->lobbies->setPromoted($code, $created['token'], 1, true);

        $this->assertApiError(403, fn () => $this->lobbies->setPromoted($code, $anna['token'], 0, true), );
        $this->assertApiError(403, fn () => $this->lobbies->setPromoted($code, null, 1, false));
    }

    public function testCreatorCannotBeDemotedAndBotsCannotBePromoted(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->pdo->exec("INSERT INTO seats (lobby_id, seat_no, kind, name, bot_level) SELECT id, 1, 'bot', 'Bot', 5 FROM lobbies");

        $this->assertApiError(409, fn () => $this->lobbies->setPromoted($code, $created['token'], 0, false));
        $this->assertApiError(409, fn () => $this->lobbies->setPromoted($code, $created['token'], 1, true));
        $this->assertApiError(404, fn () => $this->lobbies->setPromoted($code, $created['token'], 7, true));
        $this->assertTrue($this->lobbies->viewFor($code, $created['token'])['me']['isCreator']);
    }

    public function testInvalidSettingsAreRejectedAndNothingChanges(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $this->assertApiError(422, fn () => $this->lobbies->updateSettings($code, $created['token'], ['starter' => 'nooit']));
        $this->assertApiError(422, fn () => $this->lobbies->updateSettings($code, $created['token'], ['starter' => ['x']]));
        $this->assertSame(['starter' => 'random'], $this->lobbies->viewFor($code, $created['token'])['settings']);
    }

    public function testSettingsCannotChangeAfterTheGameStarted(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $this->pdo->exec("UPDATE lobbies SET status = 'playing'");

        $this->assertApiError(409, fn () => $this->lobbies->updateSettings($created['lobby']['code'], $created['token'], ['starter' => 'first']));
    }

    public function testManagerCanAddBotsWhichTakeFreeSeatsAndCountAsPlayers(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $view = $this->lobbies->addBot($code, $created['token'], 7);

        $this->assertCount(2, $view['seats']);
        $this->assertSame('bot', $view['seats'][1]['kind']);
        $this->assertSame('Bot 1', $view['seats'][1]['name']);
        $this->assertSame(7, $view['seats'][1]['botLevel']);
        $this->assertSame(1, $view['seats'][1]['seatNo']);
        $this->assertApiError(409, fn () => $this->lobbies->join($code, 'Anna', null));
        $this->assertGreaterThan($created['lobby']['version'], $view['version']);
    }

    public function testBotsCannotExceedMaxPlayersAndGetUniqueNames(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $this->lobbies->addBot($code, $created['token'], 3);
        $this->assertApiError(409, fn () => $this->lobbies->addBot($code, $created['token'], 3));

        $this->lobbies->removeBot($code, $created['token'], 1);
        $again = $this->lobbies->addBot($code, $created['token'], 4);
        $this->assertSame('Bot 1', $again['seats'][1]['name']);
    }

    public function testOnlyManagersChangeBots(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $this->assertApiError(403, fn () => $this->lobbies->addBot($code, $anna['token'], 5));
        $this->assertApiError(403, fn () => $this->lobbies->addBot($code, null, 5));

        // Een gepromoveerde speler mag bots beheren (hier is de lobby al vol, dus 409 in plaats van 403).
        $this->lobbies->setPromoted($code, $created['token'], 1, true);
        $this->assertApiError(409, fn () => $this->lobbies->addBot($code, $anna['token'], 5));
    }

    public function testBotLevelMustBeOneToTen(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        foreach ([0, 11, -1, '5', null, 5.5] as $bad) {
            $this->assertApiError(422, fn () => $this->lobbies->addBot($code, $created['token'], $bad));
        }
        $this->assertCount(1, $this->lobbies->viewFor($code, $created['token'])['seats']);
    }

    public function testBotLevelCanBeChangedAndHumansAreNotBots(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 2);

        $view = $this->lobbies->setBotLevel($code, $created['token'], 1, 9);

        $this->assertSame(9, $view['seats'][1]['botLevel']);
        $this->assertApiError(409, fn () => $this->lobbies->setBotLevel($code, $created['token'], 0, 9));
        $this->assertApiError(409, fn () => $this->lobbies->removeBot($code, $created['token'], 0));
        $this->assertApiError(404, fn () => $this->lobbies->removeBot($code, $created['token'], 5));
        $this->assertApiError(422, fn () => $this->lobbies->setBotLevel($code, $created['token'], 1, 12));
    }

    public function testBotsCannotBeChangedAfterTheGameStarted(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 2);
        $this->pdo->exec("UPDATE lobbies SET status = 'playing'");

        $this->assertApiError(409, fn () => $this->lobbies->setBotLevel($code, $created['token'], 1, 5));
        $this->assertApiError(409, fn () => $this->lobbies->removeBot($code, $created['token'], 1));
    }

    public function testLobbyWithOnlyBotsLeftIsRemovedWhenTheLastHumanLeaves(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $this->lobbies->addBot($created['lobby']['code'], $created['token'], 5);

        $this->lobbies->leave($created['lobby']['code'], $created['token']);

        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM lobbies')->fetchColumn());
    }

    public function testChatMessagesAreVisibleToEveryoneInTheLobbyOldestFirst(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);

        $this->lobbies->sendChat($code, $created['token'], 'Hoi Anna!');
        $view = $this->lobbies->sendChat($code, $anna['token'], '  Hoi   Percy  ');

        $this->assertCount(2, $view['chat']);
        $this->assertSame('Percy', $view['chat'][0]['name']);
        $this->assertSame(0, $view['chat'][0]['seatNo']);
        $this->assertSame('Hoi Anna!', $view['chat'][0]['body']);
        $this->assertSame('Hoi Percy', $view['chat'][1]['body']);
        $this->assertGreaterThan($view['chat'][0]['id'], $view['chat'][1]['id']);
        $this->assertEqualsWithDelta(time(), $view['chat'][1]['at'], 5);
        $this->assertCount(2, $this->lobbies->viewFor($code, $created['token'])['chat']);
    }

    public function testChatIsOnlyForPlayersInTheLobby(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->sendChat($code, $created['token'], 'Geheim');

        $this->assertApiError(403, fn () => $this->lobbies->sendChat($code, null, 'x'));
        $this->assertApiError(403, fn () => $this->lobbies->sendChat($code, 'verkeerd', 'x'));
        $this->assertArrayNotHasKey('chat', $this->lobbies->viewFor($code, null));
        $this->assertArrayNotHasKey('chat', $this->lobbies->poll($code, null, null));
    }

    public function testChatHasALengthLimitAndStripsControlCharacters(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];

        $this->assertApiError(422, fn () => $this->lobbies->sendChat($code, $created['token'], ''));
        $this->assertApiError(422, fn () => $this->lobbies->sendChat($code, $created['token'], "  \u{200B}  "));
        $this->assertApiError(422, fn () => $this->lobbies->sendChat($code, $created['token'], str_repeat('a', 301)));
        $this->assertApiError(422, fn () => $this->lobbies->sendChat($code, $created['token'], ['x']));

        $view = $this->lobbies->sendChat($code, $created['token'], str_repeat('a', 300));
        $this->assertSame(300, mb_strlen($view['chat'][0]['body']));

        $view = $this->lobbies->sendChat($code, $created['token'], "he\x07llo\u{202E} <b>wereld</b>");
        $this->assertSame('hello <b>wereld</b>', $view['chat'][1]['body'], 'Opschonen, niet vertalen: de frontend escapet bij tonen.');
    }

    public function testChatShowsOnlyTheLastFiftyMessages(): void
    {
        // Zonder chatgrens, anders remt de spamfilter de 55 berichten af.
        $this->lobbies = new LobbyService($this->pdo, GameRegistry::default(), null, LobbyService::AWAY_AFTER_SECONDS, \Dg\Limits::none());
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        for ($i = 1; $i <= 55; $i++) {
            $this->lobbies->sendChat($code, $created['token'], "bericht $i");
        }

        $chat = $this->lobbies->viewFor($code, $created['token'])['chat'];

        $this->assertCount(50, $chat);
        $this->assertSame('bericht 6', $chat[0]['body']);
        $this->assertSame('bericht 55', $chat[49]['body']);
    }

    public function testChatKeepsTheNameOfAPlayerWhoLeft(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);
        $this->lobbies->sendChat($code, $anna['token'], 'Doei!');

        $this->lobbies->leave($code, $anna['token']);
        $chat = $this->lobbies->viewFor($code, $created['token'])['chat'];

        $this->assertSame('Anna', $chat[0]['name']);
        $this->assertNull($chat[0]['seatNo']);
        $this->assertSame('Doei!', $chat[0]['body']);
    }

    public function testChatBumpsTheVersionSoOthersSeeIt(): void
    {
        $created = $this->lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $anna = $this->lobbies->join($code, 'Anna', null);
        $version = $this->lobbies->poll($code, $anna['token'], null)['version'];

        $this->lobbies->sendChat($code, $created['token'], 'Hoi');
        $seen = $this->lobbies->poll($code, $anna['token'], $version);

        $this->assertGreaterThan($version, $seen['version']);
        $this->assertSame('Hoi', $seen['chat'][0]['body']);
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
