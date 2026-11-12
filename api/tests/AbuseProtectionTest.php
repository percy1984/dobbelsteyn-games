<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\Api;
use Dg\ApiException;
use Dg\Config;
use Dg\Games\GameRegistry;
use Dg\Limits;
use Dg\Lobbies\Cleanup;
use Dg\Lobbies\LobbyService;
use Dg\RateLimiter;
use Dg\Request;
use Dg\Response;
use Dg\Router;

/** Rate limiting, opruimen en andere misbruikbescherming. */
final class AbuseProtectionTest extends DbTestCase
{
    private function assertRateLimited(callable $fn): void
    {
        try {
            $fn();
            $this->fail('Verwachtte een 429.');
        } catch (ApiException $e) {
            $this->assertSame(429, $e->status);
            $this->assertSame('rate_limited', $e->errorCode);
        }
    }

    private function service(?Limits $limits = null): LobbyService
    {
        return new LobbyService($this->pdo, GameRegistry::default(), null, LobbyService::AWAY_AFTER_SECONDS, $limits ?? new Limits());
    }

    // --- RateLimiter ---------------------------------------------------------------------------

    public function testRateLimiterCountsWithinAWindowAndKeepsBucketsApart(): void
    {
        $limiter = new RateLimiter($this->pdo);

        $this->assertSame(1, $limiter->record('a', 60));
        $this->assertSame(2, $limiter->record('a', 60));
        $this->assertSame(1, $limiter->record('b', 60));
        $this->assertSame(2, $limiter->count('a', 60));
        $this->assertSame(0, $limiter->count('nieuw', 60));
    }

    public function testRateLimiterHitStopsWhenTheLimitIsExceeded(): void
    {
        $limiter = new RateLimiter($this->pdo);

        $limiter->hit('x', 2, 60);
        $limiter->hit('x', 2, 60);
        $this->assertRateLimited(fn () => $limiter->hit('x', 2, 60));
    }

    public function testRateLimiterStartsAFreshWindowAfterItExpired(): void
    {
        $limiter = new RateLimiter($this->pdo);
        $limiter->record('x', 60);
        $limiter->record('x', 60);
        $this->pdo->exec("UPDATE rate_limits SET window_start = NOW(3) - INTERVAL 61 SECOND WHERE bucket = 'x'");

        $this->assertSame(0, $limiter->count('x', 60));
        $this->assertSame(1, $limiter->record('x', 60));
    }

    public function testAssertBelowDoesNotCountAndOnceOnlyFiresFirst(): void
    {
        $limiter = new RateLimiter($this->pdo);

        $limiter->assertBelow('y', 1, 60);
        $limiter->assertBelow('y', 1, 60);
        $this->assertSame(0, $limiter->count('y', 60));

        $this->assertTrue($limiter->once('taak', 60));
        $this->assertFalse($limiter->once('taak', 60));
        $this->assertFalse($limiter->once('taak', 60));
    }

    public function testClientKeyDoesNotRevealTheAddress(): void
    {
        $key = RateLimiter::client('203.0.113.7');

        $this->assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $key);
        $this->assertStringNotContainsString('203', $key);
        $this->assertNotSame($key, RateLimiter::client('203.0.113.8'));
    }

    public function testPurgeRemovesOldCountersOnly(): void
    {
        $limiter = new RateLimiter($this->pdo);
        $limiter->record('oud', 60);
        $limiter->record('nieuw', 60);
        $this->pdo->exec("UPDATE rate_limits SET window_start = NOW(3) - INTERVAL 2 DAY WHERE bucket = 'oud'");

        $this->assertSame(1, $limiter->purge());
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM rate_limits')->fetchColumn());
    }

    // --- Chat en PIN ---------------------------------------------------------------------------

    public function testChatSpamIsSlowedDownPerPlayer(): void
    {
        $lobbies = $this->service(new Limits(chatMessages: 3, chatWindowSeconds: 10));
        $created = $lobbies->create('tic-tac-toe', 'Percy', false, null);
        $anna = $lobbies->join($created['lobby']['code'], 'Anna', null);
        $code = $created['lobby']['code'];

        for ($i = 1; $i <= 3; $i++) {
            $lobbies->sendChat($code, $created['token'], "bericht $i");
        }
        $this->assertRateLimited(fn () => $lobbies->sendChat($code, $created['token'], 'te veel'));

        // Een andere speler heeft zijn eigen teller, en geweigerde berichten staan er niet in.
        $view = $lobbies->sendChat($code, $anna['token'], 'ik mag wel');
        $this->assertCount(4, $view['chat']);
        $this->assertSame('ik mag wel', $view['chat'][3]['body']);
    }

    public function testChatWorksAgainAfterTheWindow(): void
    {
        $lobbies = $this->service(new Limits(chatMessages: 1, chatWindowSeconds: 10));
        $created = $lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $lobbies->sendChat($code, $created['token'], 'een');
        $this->assertRateLimited(fn () => $lobbies->sendChat($code, $created['token'], 'twee'));

        $this->pdo->exec('UPDATE rate_limits SET window_start = NOW(3) - INTERVAL 11 SECOND');

        $this->assertCount(2, $lobbies->sendChat($code, $created['token'], 'drie')['chat']);
    }

    public function testGuessingAPinIsStoppedAfterTooManyWrongTriesEvenWithTheRightPin(): void
    {
        $lobbies = $this->service(new Limits(pinFailuresPerClient: 3, pinFailuresPerLobby: 100));
        $code = $lobbies->create('tic-tac-toe', 'Percy', true, 'K7P2')['lobby']['code'];

        foreach (['AAAA', 'BBBB', 'CCCC'] as $guess) {
            try {
                $lobbies->join($code, 'Rader', $guess, 'client-1');
                $this->fail('Foute PIN had geweigerd moeten worden.');
            } catch (ApiException $e) {
                $this->assertSame(403, $e->status);
            }
        }

        $this->assertRateLimited(fn () => $lobbies->join($code, 'Rader', 'K7P2', 'client-1'));
        // Iemand anders met de juiste PIN kan gewoon meedoen.
        $this->assertSame(1, $lobbies->join($code, 'Anna', 'K7P2', 'client-2')['seatNo']);
    }

    public function testPinGuessesAreAlsoCountedPerLobbyAcrossClients(): void
    {
        $lobbies = $this->service(new Limits(pinFailuresPerClient: 100, pinFailuresPerLobby: 3));
        $code = $lobbies->create('tic-tac-toe', 'Percy', true, 'K7P2')['lobby']['code'];

        foreach (['c1', 'c2', 'c3'] as $client) {
            try {
                $lobbies->join($code, 'Rader', 'AAAA', $client);
            } catch (ApiException) {
            }
        }

        $this->assertRateLimited(fn () => $lobbies->join($code, 'Anna', 'K7P2', 'c4'));
    }

    public function testWrongPinsStayCountedEvenThoughTheTransactionRollsBack(): void
    {
        $lobbies = $this->service();
        $created = $lobbies->create('tic-tac-toe', 'Percy', true, 'K7P2');
        $lobbyId = (int) $this->pdo->query('SELECT id FROM lobbies')->fetchColumn();

        try {
            $lobbies->join($created['lobby']['code'], 'Rader', 'ZZZZ', 'c1');
        } catch (ApiException) {
        }

        $this->assertSame(1, (new RateLimiter($this->pdo))->count("pin:$lobbyId:c1", 600));
    }

    // --- Plafond -------------------------------------------------------------------------------

    public function testServerSaysBusyWhenThereAreTooManyLobbies(): void
    {
        $lobbies = $this->service(new Limits(maxLobbies: 2));
        $lobbies->create('tic-tac-toe', 'A', false, null);
        $lobbies->create('tic-tac-toe', 'B', false, null);

        try {
            $lobbies->create('tic-tac-toe', 'C', false, null);
            $this->fail('Verwachtte "server druk".');
        } catch (ApiException $e) {
            $this->assertSame(503, $e->status);
            $this->assertSame('server_busy', $e->errorCode);
        }
    }

    // --- Opruimen ------------------------------------------------------------------------------

    private function setStatusAndAge(string $code, string $status, int $minutesSinceActivity): void
    {
        $this->pdo->prepare(
            'UPDATE lobbies SET status = ?, last_activity_at = NOW(3) - INTERVAL ? MINUTE WHERE code = ?'
        )->execute([$status, $minutesSinceActivity, $code]);
        $this->pdo->prepare(
            'UPDATE seats SET last_seen_at = NOW(3) - INTERVAL ? MINUTE WHERE lobby_id = (SELECT id FROM lobbies WHERE code = ?)'
        )->execute([$minutesSinceActivity, $code]);
    }

    /** @return array<string, bool> bestaat de lobby nog, per code */
    private function exists(string ...$codes): array
    {
        $found = [];
        foreach ($codes as $code) {
            $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM lobbies WHERE code = ?');
            $stmt->execute([$code]);
            $found[$code] = (int) $stmt->fetchColumn() === 1;
        }

        return $found;
    }

    public function testCleanupRemovesAbandonedLobbiesButKeepsActiveOnes(): void
    {
        $lobbies = $this->service();
        $codes = [];
        foreach (['oud wachtend', 'vers wachtend', 'oud afgelopen', 'oud lopend', 'lang lopend'] as $name) {
            $codes[$name] = $lobbies->create('tic-tac-toe', 'P' . count($codes), false, null)['lobby']['code'];
        }
        $this->setStatusAndAge($codes['oud wachtend'], 'waiting', 6);
        $this->setStatusAndAge($codes['vers wachtend'], 'waiting', 3);
        $this->setStatusAndAge($codes['oud afgelopen'], 'finished', 6);
        $this->setStatusAndAge($codes['oud lopend'], 'playing', 23 * 60);        // wacht nog op spelers
        $this->setStatusAndAge($codes['lang lopend'], 'playing', 25 * 60);       // al meer dan een dag niemand

        $removed = (new Cleanup($this->pdo))->run();

        $this->assertSame(3, $removed);
        $this->assertSame(
            [$codes['oud wachtend'] => false, $codes['vers wachtend'] => true, $codes['oud afgelopen'] => false, $codes['oud lopend'] => true, $codes['lang lopend'] => false],
            $this->exists(...array_values($codes)),
        );
    }

    public function testCleanupKeepsALobbyWhileAnyHumanStillSendsHeartbeats(): void
    {
        $lobbies = $this->service();
        $created = $lobbies->create('tic-tac-toe', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $lobbies->join($code, 'Anna', null);
        $this->setStatusAndAge($code, 'waiting', 120);
        // Anna is er nog (recente heartbeat), Percy al twee uur niet.
        $this->pdo->exec("UPDATE seats SET last_seen_at = NOW(3) WHERE name = 'Anna'");

        (new Cleanup($this->pdo))->run();

        $this->assertTrue($this->exists($code)[$code]);
    }

    public function testCleanupRemovesTheSeatsChatAndGameStateOfADeletedLobby(): void
    {
        $lobbies = $this->service();
        $created = $lobbies->create('tic-tac-toe', 'Percy', false, null);
        $lobbies->sendChat($created['lobby']['code'], $created['token'], 'hoi');
        $this->setStatusAndAge($created['lobby']['code'], 'waiting', 60);

        (new Cleanup($this->pdo))->run();

        foreach (['lobbies', 'seats', 'chat_messages', 'game_states'] as $table) {
            $this->assertSame(0, (int) $this->pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn(), $table);
        }
    }

    // --- Via de API (per IP) -------------------------------------------------------------------

    private function api(Limits $limits): Router
    {
        $router = new Router();
        Api::register($router, Config::load(__DIR__ . '/../config.php'), __DIR__ . '/../migrations', null, $limits);

        return $router;
    }

    /** @param array<string, mixed> $body */
    private function call(Router $router, string $method, string $path, array $body, string $ip): Response
    {
        return $router->dispatch($method, $path, new Request($method, [], $body, [], $ip));
    }

    public function testCreatingLobbiesIsLimitedPerIpAddress(): void
    {
        $router = $this->api(new Limits(createPerHour: 2));
        $body = ['game' => 'tic-tac-toe', 'name' => 'Percy'];

        $this->assertSame(201, $this->call($router, 'POST', '/lobbies', $body, '203.0.113.7')->status);
        $this->assertSame(201, $this->call($router, 'POST', '/lobbies', $body, '203.0.113.7')->status);
        $this->assertRateLimited(fn () => $this->call($router, 'POST', '/lobbies', $body, '203.0.113.7'));
        $this->assertSame(201, $this->call($router, 'POST', '/lobbies', $body, '203.0.113.8')->status, 'Een ander IP is niet geraakt.');
    }

    public function testJoiningAndListingAreLimitedPerIpAddress(): void
    {
        $router = $this->api(new Limits(joinPerMinute: 1, listPerMinute: 2));
        $code = $this->call($router, 'POST', '/lobbies', ['game' => 'tic-tac-toe', 'name' => 'Percy'], '198.51.100.1')->data['lobby']['code'];

        $this->assertSame(200, $this->call($router, 'POST', "/lobbies/$code/join", ['name' => 'Anna'], '198.51.100.2')->status);
        $this->assertRateLimited(fn () => $this->call($router, 'POST', "/lobbies/$code/join", ['name' => 'Piet'], '198.51.100.2'));

        $list = fn (string $ip) => $router->dispatch('GET', '/lobbies', new Request('GET', ['game' => 'tic-tac-toe'], [], [], $ip));
        $list('198.51.100.3');
        $list('198.51.100.3');
        $this->assertRateLimited(fn () => $list('198.51.100.3'));
    }

    public function testHousekeepingRemovesAbandonedLobbiesDuringARequestAtMostOncePerMinute(): void
    {
        $lobbies = $this->service();
        $old = $lobbies->create('tic-tac-toe', 'Oud', false, null)['lobby']['code'];
        $this->setStatusAndAge($old, 'waiting', 60);
        $router = $this->api(new Limits());

        $router->dispatch('GET', '/lobbies', new Request('GET', ['game' => 'tic-tac-toe'], [], [], '203.0.113.9'));
        $this->assertFalse($this->exists($old)[$old], 'De eerste aanroep ruimt op.');

        $second = $lobbies->create('tic-tac-toe', 'Ook oud', false, null)['lobby']['code'];
        $this->setStatusAndAge($second, 'waiting', 60);
        $router->dispatch('GET', '/lobbies', new Request('GET', ['game' => 'tic-tac-toe'], [], [], '203.0.113.9'));
        $this->assertTrue($this->exists($second)[$second], 'Binnen een minuut niet nog een keer.');
    }
}
