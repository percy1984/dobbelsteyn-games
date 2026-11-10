<?php

declare(strict_types=1);

namespace Dg\Tests\Games;

use Dg\Games\Game;
use Dg\Games\InvalidMove;
use Dg\Games\Rng;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * Basistest die elke game moet doorstaan. Een nieuwe game maakt een subklasse met alleen `game()`
 * en voegt zijn eigen regel-tests toe. Zo blijft het contract met het platform bewaakt.
 */
abstract class GameContractTestCase extends TestCase
{
    abstract protected function game(): Game;

    /** Vaste toevalsreeks, zodat tests herhaalbaar zijn. */
    protected function rng(int $seed = 1): Rng
    {
        mt_srand($seed);

        return new Rng(static fn (int $min, int $max): int => mt_rand($min, $max));
    }

    /** @return list<int> */
    private function seatNos(): array
    {
        // Bewust niet 0..n-1: plaatsnummers hoeven niet opeenvolgend te zijn.
        return array_map(static fn (int $i): int => $i * 2 + 1, range(0, $this->game()->minPlayers() - 1));
    }

    /** @return array<string, mixed> */
    private function newGame(int $seed = 1): array
    {
        $game = $this->game();

        return $game->start($this->seatNos(), $game->normalizeSettings([]), $this->rng($seed));
    }

    public function testMetadataIsConsistent(): void
    {
        $game = $this->game();

        $this->assertMatchesRegularExpression('/^[a-z0-9]+(-[a-z0-9]+)*$/', $game->slug());
        $this->assertGreaterThanOrEqual(1, $game->minPlayers());
        $this->assertGreaterThanOrEqual($game->minPlayers(), $game->maxPlayers());
    }

    public function testDefaultSettingsAreValidAndStable(): void
    {
        $game = $this->game();
        $defaults = $game->normalizeSettings([]);

        $this->assertSame($defaults, $game->normalizeSettings($defaults));
        foreach ($game->settingsSchema() as $field) {
            $this->assertContains($field['default'], $field['choices']);
            $this->assertSame($field['default'], $defaults[$field['key']]);
        }
    }

    public function testInvalidSettingsAreRejected(): void
    {
        $game = $this->game();
        $schema = $game->settingsSchema();
        if ($schema === []) {
            $this->markTestSkipped('Deze game heeft geen instellingen.');
        }

        $this->expectException(InvalidArgumentException::class);
        $game->normalizeSettings([$schema[0]['key'] => 'bestaat-niet']);
    }

    public function testUnknownSettingKeysAreDropped(): void
    {
        $this->assertSame(
            $this->game()->normalizeSettings([]),
            $this->game()->normalizeSettings(['onbekend' => 'x']),
        );
    }

    public function testStartStateIsJsonSerializableAndRunning(): void
    {
        $game = $this->game();
        $state = $this->newGame();

        $this->assertSame($state, json_decode(json_encode($state, JSON_THROW_ON_ERROR), true));
        $this->assertNull($game->outcome($state));
        $this->assertNotSame([], $game->activeSeats($state));
    }

    public function testViewIsJsonSerializableForEverySeat(): void
    {
        $game = $this->game();
        $state = $this->newGame();

        foreach ($this->seatNos() as $seatNo) {
            $this->assertIsArray(json_decode(json_encode($game->view($state, $seatNo), JSON_THROW_ON_ERROR), true));
        }
    }

    public function testSeatThatIsNotActiveCannotMove(): void
    {
        $game = $this->game();
        $state = $this->newGame();
        $active = $game->activeSeats($state);
        $inactive = array_values(array_diff($this->seatNos(), $active));
        if ($inactive === []) {
            $this->markTestSkipped('Alle plaatsen zijn tegelijk aan de beurt.');
        }

        $this->expectException(InvalidMove::class);
        $game->apply($state, $inactive[0], $game->botMove($state, $active[0], 5, $this->rng()), $this->rng());
    }

    public function testApplyDoesNotMutateItsInput(): void
    {
        $game = $this->game();
        $state = $this->newGame();
        $before = json_encode($state);
        $seat = $game->activeSeats($state)[0];

        $game->apply($state, $seat, $game->botMove($state, $seat, 5, $this->rng()), $this->rng());

        $this->assertSame($before, json_encode($state));
    }

    /** Elk botniveau speelt een heel spel met alleen geldige zetten en bereikt een uitkomst. */
    public function testBotsOfEveryLevelFinishAGameWithLegalMoves(): void
    {
        $game = $this->game();

        for ($level = 1; $level <= 10; $level++) {
            $rng = $this->rng($level);
            $state = $this->newGame($level);

            for ($turn = 0; $turn < 2000 && $game->outcome($state) === null; $turn++) {
                $seats = $game->activeSeats($state);
                $this->assertNotSame([], $seats, "Niveau $level: geen actieve plaats maar ook geen uitkomst.");
                foreach ($seats as $seat) {
                    $state = $game->apply($state, $seat, $game->botMove($state, $seat, $level, $rng), $rng);
                    if ($game->outcome($state) !== null) {
                        break;
                    }
                }
            }

            $outcome = $game->outcome($state);
            $this->assertNotNull($outcome, "Niveau $level: spel eindigde niet.");
            $this->assertSame([], $game->activeSeats($state), 'Na afloop is niemand meer aan de beurt.');
            foreach ($outcome['winners'] as $winner) {
                $this->assertContains($winner, $this->seatNos());
            }
        }
    }
}
