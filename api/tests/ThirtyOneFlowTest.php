<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Lobbies\LobbyService;

/** 31-en via de echte lobbyservice: bots, een hele wedstrijd, vrije zetten en wat spelers te zien krijgen. */
final class ThirtyOneFlowTest extends DbTestCase
{
    private LobbyService $lobbies;
    private int $nowMs = 1_000_000;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lobbies = new LobbyService(
            $this->pdo,
            GameRegistry::default(),
            new Rng(static fn (int $min, int $max): int => mt_rand($min, $max)),
            clock: fn (): int => $this->nowMs,
        );
        mt_srand(7);
    }

    private function begin(string $code, string $token): array
    {
        if ($this->lobbies->start($code, $token)['status'] === 'waiting') {
            $this->pdo->exec('UPDATE seats SET is_ready = 1');
            $this->lobbies->start($code, $token);
        }
        $this->pdo->exec('UPDATE lobbies SET countdown_ends_at = NOW(3) - INTERVAL 1 SECOND');

        return $this->lobbies->poll($code, $token, null);
    }

    /** @param list<array<string, mixed>> $events @return list<string> */
    private function types(array $events): array
    {
        return array_map(static fn (array $event): string => $event['type'], $events);
    }

    public function testAHumanAgainstBotsPlaysAWholeMatchThroughTheLobby(): void
    {
        $created = $this->lobbies->create('31-en', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $this->lobbies->addBot($code, $created['token'], 3);
        $this->lobbies->addBot($code, $created['token'], 8);
        $this->lobbies->updateSettings($code, $created['token'], ['lives' => '2']);
        $view = $this->begin($code, $created['token']);

        $this->assertSame('playing', $view['status']);
        $this->assertSame('started', $view['events'][0]['type']);
        $this->assertCount(3, $view['gameView']['hand']);

        for ($i = 0; $i < 300 && $view['status'] === 'playing'; $i++) {
            $this->assertSame([0], $view['activeSeats'], 'Bots spelen door, dus alleen de mens kan aan de beurt zijn.');
            $view = $this->lobbies->move($code, $created['token'], ['type' => 'pass']);
        }

        $this->assertSame('finished', $view['status']);
        $this->assertNotNull($view['result']);
        $this->assertContains('settled', $this->types($view['events']));
    }

    public function testAnotherPlayerMayMoveCardsOutOfTurnWithTheRateLimit(): void
    {
        $created = $this->lobbies->create('31-en', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $guest = $this->lobbies->join($code, 'Anna', null);
        $view = $this->begin($code, $created['token']);

        // Wie niet aan de beurt is, mag wel verplaatsen.
        $idle = $view['activeSeats'] === [0] ? $guest['token'] : $created['token'];
        $idleSeat = $view['activeSeats'] === [0] ? 1 : 0;
        $hand = $this->lobbies->viewFor($code, $idle)['gameView']['hand'];

        $after = $this->lobbies->move($code, $idle, ['type' => 'move', 'cards' => [$hand[0], $hand[2]]]);

        $this->assertSame([$hand[2], $hand[1], $hand[0]], $after['gameView']['hand']);
        $moved = array_values(array_filter($after['events'], static fn (array $e): bool => $e['type'] === 'moved'));
        $this->assertEquals([['seq' => $moved[0]['seq'], 'type' => 'moved', 'seat' => $idleSeat, 'a' => 0, 'b' => 2]], $moved);

        try {
            $this->lobbies->move($code, $idle, ['type' => 'move', 'cards' => [$hand[0], $hand[1]]]);
            $this->fail('De tweede verplaatsing binnen 5 seconden moest geweigerd worden.');
        } catch (ApiException $e) {
            $this->assertSame('invalid_move', $e->errorCode);
        }

        $this->nowMs += 5000;
        $this->lobbies->move($code, $idle, ['type' => 'move', 'cards' => [$hand[0], $hand[1]]]);
        // Een gewone zet buiten de beurt blijft verboden.
        $this->expectException(ApiException::class);
        $this->lobbies->move($code, $idle, ['type' => 'pass']);
    }

    public function testNeitherTheViewNorTheLogShowsAnotherPlayersClosedCards(): void
    {
        $created = $this->lobbies->create('31-en', 'Percy', false, null);
        $code = $created['lobby']['code'];
        $guest = $this->lobbies->join($code, 'Anna', null);
        $this->begin($code, $created['token']);

        $hostView = $this->lobbies->viewFor($code, $created['token']);
        $guestView = $this->lobbies->viewFor($code, $guest['token']);

        $this->assertNotSame($hostView['gameView']['hand'], $guestView['gameView']['hand']);
        $guestJson = json_encode($hostView, JSON_THROW_ON_ERROR);
        foreach ($guestView['gameView']['hand'] as $card) {
            $this->assertStringNotContainsString('"' . $card . '"', $guestJson);
        }
        $this->assertSame($hostView['events'], $guestView['events']);
    }
}
