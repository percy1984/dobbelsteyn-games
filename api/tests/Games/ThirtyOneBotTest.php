<?php

declare(strict_types=1);

namespace Dg\Tests\Games;

use Dg\Games\InvalidMove;
use Dg\Games\Rng;
use Dg\Games\ThirtyOne;
use Dg\Games\ThirtyOneBot;
use PHPUnit\Framework\TestCase;

/** De botniveaus van 31-en (zie ThirtyOneBot::PROFILES en docs/31-en.md). */
final class ThirtyOneBotTest extends TestCase
{
    private ThirtyOne $game;

    protected function setUp(): void
    {
        $this->game = new ThirtyOne();
    }

    private function rng(int $seed): Rng
    {
        mt_srand($seed);

        return new Rng(static fn (int $min, int $max): int => mt_rand($min, $max));
    }

    /** @param array<string, string> $settings @param list<int> $seats @return array<string, mixed> */
    private function table(array $settings = [], array $seats = [0, 1, 2], int $seed = 1): array
    {
        return $this->game->startStep($seats, $settings, $this->rng($seed), 0)->state;
    }

    /**
     * @param array<string, mixed> $state
     * @param array<int, list<string>> $hands
     * @param list<string> $pot
     * @return array<string, mixed>
     */
    private function rig(array $state, array $hands, array $pot): array
    {
        $state['hands'] = $hands;
        $state['pot'] = $pot;
        $all = [];
        foreach (['S', 'H', 'D', 'C'] as $suit) {
            foreach (['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as $rank) {
                $all[] = $suit . $rank;
            }
        }
        $state['deck'] = array_values(array_diff($all, $pot, ...array_values($hands)));

        return $state;
    }

    /**
     * Speelt een hele wedstrijd met de gegeven niveaus per plaats. Geeft de winnaars terug, of null
     * als het spel (onverwacht) niet eindigde.
     *
     * @param array<int, int> $levels niveau per plaats
     * @param array<string, string> $settings
     * @return list<int>|null
     */
    private function playMatch(array $levels, array $settings, int $seed): ?array
    {
        $seats = array_keys($levels);
        $rng = $this->rng($seed);
        $state = $this->game->startStep($seats, $settings, $rng, 0)->state;
        for ($i = 0; $i < 4000 && $this->game->outcome($state) === null; $i++) {
            $seat = $this->game->activeSeats($state)[0];
            $state = $this->game->apply($state, $seat, $this->game->botMove($state, $seat, $levels[$seat], $rng), $rng);
        }

        return $this->game->outcome($state)['winners'] ?? null;
    }

    // --- de tabel met niveaus ------------------------------------------------------------------

    public function testThereAreTenLevelsThatGetStrongerStepByStep(): void
    {
        $this->assertSame(range(1, 10), array_keys(ThirtyOneBot::PROFILES));

        $previous = null;
        foreach (ThirtyOneBot::PROFILES as $level => $profile) {
            if ($previous !== null) {
                $this->assertGreaterThanOrEqual($previous['memory'], $profile['memory'], "Geheugen op niveau $level");
                $this->assertLessThanOrEqual($previous['error'], $profile['error'], "Foutkans op niveau $level");
                $this->assertGreaterThanOrEqual($previous['samples'], $profile['samples'], "Gokken op niveau $level");
                $this->assertGreaterThanOrEqual($previous['bluff'], $profile['bluff'], "Bluf op niveau $level");
                if ($previous['risk'] !== null && $profile['risk'] !== null) {
                    $this->assertLessThanOrEqual($previous['risk'], $profile['risk'], "Risico op niveau $level");
                }
            }
            $previous = $profile;
        }
    }

    public function testLevelOneIsAlmostRandomAndLevelTenNeverMakesAMistakeOnPurpose(): void
    {
        $this->assertGreaterThanOrEqual(0.5, ThirtyOneBot::profile(1)['error']);
        $this->assertSame(0.0, ThirtyOneBot::profile(10)['error']);
        $this->assertSame(PHP_INT_MAX, ThirtyOneBot::profile(10)['memory']);
        $this->assertSame(0, ThirtyOneBot::profile(1)['memory']);
    }

    public function testLevelsOutsideTheRangeFallBackToTheNearestOne(): void
    {
        $this->assertSame(ThirtyOneBot::profile(1), ThirtyOneBot::profile(0));
        $this->assertSame(ThirtyOneBot::profile(1), ThirtyOneBot::profile(-4));
        $this->assertSame(ThirtyOneBot::profile(10), ThirtyOneBot::profile(11));
    }

    public function testOnlyTheHigherLevelsEstimateOpponentsAndRemember(): void
    {
        foreach (range(1, 5) as $level) {
            $this->assertNull(ThirtyOneBot::profile($level)['risk']);
            $this->assertSame(0, ThirtyOneBot::profile($level)['samples']);
        }
        foreach (range(6, 10) as $level) {
            $this->assertNotNull(ThirtyOneBot::profile($level)['risk']);
            $this->assertGreaterThan(0, ThirtyOneBot::profile($level)['samples']);
            $this->assertGreaterThan(0, ThirtyOneBot::profile($level)['memory']);
        }
    }

    // --- altijd geldige zetten -----------------------------------------------------------------

    /** @return array<string, array{0: array<string, string>, 1: list<int>}> */
    public static function variants(): array
    {
        return [
            'standaard, 2 spelers' => [[], [0, 1]],
            'standaard, 4 spelers' => [[], [0, 1, 2, 3]],
            'acht spelers en vuile was breed' => [['dirtyLaundry' => 'broad', 'lives' => '2'], [0, 1, 2, 3, 4, 5, 6, 7]],
            'pasregel na 1 ronde en alles ruilen voor iedereen' => [['passRule' => 'after-round', 'swapAll' => 'everyone', 'lives' => '3'], [0, 2, 5]],
            'overslaan aan en vuile was klassiek' => [['skip' => 'on', 'dirtyLaundry' => 'classic', 'lives' => '3'], [1, 3, 4]],
            'alles ruilen uit' => [['swapAll' => 'off', 'lives' => '3'], [0, 1, 2]],
        ];
    }

    /** @dataProvider variants */
    #[\PHPUnit\Framework\Attributes\DataProvider('variants')]
    public function testEveryLevelOnlyPlaysLegalMovesAndTheMatchEnds(array $settings, array $seats): void
    {
        foreach (range(1, 10) as $level) {
            $levels = array_fill_keys($seats, $level);
            try {
                $winners = $this->playMatch($levels, $settings, 100 + $level);
            } catch (InvalidMove $e) {
                $this->fail("Niveau $level deed een ongeldige zet: " . $e->getMessage());
            }
            $this->assertNotNull($winners, "Niveau $level: het spel eindigde niet.");
        }
    }

    public function testMixedLevelsAtOneTableAlsoFinish(): void
    {
        $winners = $this->playMatch([0 => 1, 1 => 5, 2 => 10, 3 => 7], ['lives' => '3'], 9);

        $this->assertNotNull($winners);
    }

    // --- spelen ------------------------------------------------------------------------------

    public function testAStrongBotKeepsAGoodHandAndPassesWhenAllowed(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['SA', 'HA', 'DA'],
            2 => ['C7', 'D8', 'S9'],
            0 => ['H7', 'D9', 'C8'],
        ], ['S7', 'H8', 'C9']);

        $move = $this->game->botMove($state, 1, 10, $this->rng(3));

        $this->assertSame(['type' => 'pass'], $move);
    }

    public function testABotImprovesAWeakHandInsteadOfPassing(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['SK', 'SQ', 'H9'],
            0 => ['C7', 'D8', 'S9'],
        ], ['HA', 'HK', 'S8']);

        $move = $this->game->botMove($state, 1, 10, $this->rng(3));

        $this->assertSame('swap', $move['type']);
        $this->assertContains($move['potCard'], ['HA', 'HK']);
    }

    public function testAStrongBotDoesNotPassWhenAnOpponentIsKnownToHoldAStrongHand(): void
    {
        // Plaats 1 heeft 20 en kan verbeteren. Plaats 2 heeft openbaar (alle drie kaarten gezien) 29.
        $state = $this->rig($this->table(['passRule' => 'direct']), [
            1 => ['HK', 'HQ', 'D7'],
            2 => ['SK', 'SQ', 'S9'],
            0 => ['C7', 'D8', 'C9'],
        ], ['H8', 'C8', 'S8']);
        $state['known'][2] = ['SK', 'SQ', 'S9'];
        $state['knownAt'][2] = [0, 0, 0];

        $swaps = 0;
        for ($seed = 1; $seed <= 40; $seed++) {
            $swaps += $this->game->botMove($state, 1, 10, $this->rng($seed))['type'] === 'swap' ? 1 : 0;
        }

        // Niveau 10 bluft soms (hooguit 12%) en past dan toch; de rest van de tijd wisselt hij.
        $this->assertGreaterThanOrEqual(32, $swaps, 'Met 20 tegen een bekende 29 past een sterke bot niet.');
    }

    public function testAStrongBotPassesWhenTheKnownHandsAreWeak(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['HK', 'HQ', 'D7'],
            2 => ['C7', 'D8', 'S9'],
            0 => ['C8', 'D9', 'S7'],
        ], ['H8', 'C9', 'S8']);
        $state['known'][2] = ['C7', 'D8', 'S9'];
        $state['known'][0] = ['C8', 'D9', 'S7'];
        $state['knownAt'][2] = [0, 0, 0];
        $state['knownAt'][0] = [0, 0, 0];

        $passes = 0;
        for ($seed = 1; $seed <= 40; $seed++) {
            $passes += $this->game->botMove($state, 1, 10, $this->rng($seed))['type'] === 'pass' ? 1 : 0;
        }

        // Hooguit een late bluf (12%) houdt hem af van passen.
        $this->assertGreaterThanOrEqual(32, $passes);
    }

    public function testKnowledgeOlderThanTheBotsMemoryIsTreatedAsUnknown(): void
    {
        $base = $this->rig($this->table(), [
            1 => ['HK', 'HQ', 'D7'],
            2 => ['SK', 'SQ', 'S9'],
            0 => ['C7', 'D8', 'C9'],
        ], ['H8', 'C8', 'S8']);
        $withOldKnowledge = $base;
        $withOldKnowledge['known'][2] = ['SK', 'SQ', 'S9'];
        $withOldKnowledge['knownAt'][2] = [0, 0, 0];
        $withOldKnowledge['actionNo'] = 40; // niveau 6 onthoudt de laatste 8 acties

        foreach ([1, 2, 3, 4] as $seed) {
            $this->assertSame(
                $this->game->botMove($base, 1, 6, $this->rng($seed)),
                $this->game->botMove($withOldKnowledge, 1, 6, $this->rng($seed)),
                'Verouderde kennis telt niet mee op niveau 6.',
            );
        }
    }

    public function testPassingIsNotChosenWhenItIsNotAllowedYet(): void
    {
        $state = $this->rig($this->table(['passRule' => 'after-round']), [
            1 => ['SA', 'HA', 'DA'],
            2 => ['C7', 'D8', 'S9'],
            0 => ['H7', 'D9', 'C8'],
        ], ['S7', 'H8', 'C9']);

        for ($level = 1; $level <= 10; $level++) {
            $move = $this->game->botMove($state, 1, $level, $this->rng($level));

            $this->assertNotSame('pass', $move['type'], "Niveau $level mag nog niet passen.");
        }
    }

    public function testABotSkipsInsteadOfWorseningItsHandWhenSkippingIsAllowedAndPassingIsNot(): void
    {
        $state = $this->rig($this->table(['passRule' => 'after-round', 'skip' => 'on', 'swapAll' => 'off']), [
            1 => ['SA', 'SK', 'H8'],
            2 => ['C7', 'D9', 'S9'],
            0 => ['H9', 'C8', 'D7'],
        ], ['H7', 'C9', 'D8']);

        $move = $this->game->botMove($state, 1, 10, $this->rng(6));

        $this->assertSame(['type' => 'skip'], $move);
    }

    public function testInTheLastRoundABotImprovesIfItCanAndOtherwiseKeepsItsHand(): void
    {
        $state = $this->table();
        $first = $state['turn'];
        $others = array_values(array_diff([0, 1, 2], [$first]));
        $state = $this->rig($state, [
            $first => ['S7', 'H8', 'D9'],
            $others[0] => ['SK', 'SQ', 'H9'],
            $others[1] => ['C7', 'D8', 'S9'],
        ], ['HA', 'HK', 'S8']);
        $state = $this->game->applyStep($state, $first, ['type' => 'pass'], $this->rng(1), 0)->state;
        $this->assertTrue($state['final']);
        $second = $state['turn'];

        // Er is een verbetering mogelijk (de pot heeft een aas en een heer): de bot gebruikt die.
        $move = $this->game->botMove($state, $second, 8, $this->rng(2));
        $this->assertSame('swap', $move['type']);

        // Met drie azen (30,5) is er niets te verbeteren: de bot houdt zijn hand (Pas).
        $state['hands'][$second] = ['SA', 'HA', 'DA'];
        $state['pot'] = ['H7', 'C8', 'S8'];
        $this->assertSame(['type' => 'pass'], $this->game->botMove($state, $second, 10, $this->rng(2)));
    }

    public function testLevelOneRegularlyMakesAMistakeAndLevelTenDoesNot(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['SA', 'HA', 'DA'],
            2 => ['C7', 'D8', 'S9'],
            0 => ['H7', 'D9', 'C8'],
        ], ['S7', 'H8', 'C9']);

        $level1Passes = 0;
        $level10Passes = 0;
        for ($seed = 1; $seed <= 60; $seed++) {
            $level1Passes += $this->game->botMove($state, 1, 1, $this->rng($seed))['type'] === 'pass' ? 1 : 0;
            $level10Passes += $this->game->botMove($state, 1, 10, $this->rng($seed))['type'] === 'pass' ? 1 : 0;
        }

        $this->assertLessThan(60, $level1Passes, 'Niveau 1 maakt zo nu en dan een andere zet.');
        $this->assertGreaterThan(15, $level1Passes, 'Maar hij past ook regelmatig, want er valt niets te verbeteren.');
        $this->assertGreaterThanOrEqual(50, $level10Passes, 'Niveau 10 past bijna altijd met een 30,5 (hooguit een bluf).');
    }

    // --- eerlijk spel ---------------------------------------------------------------------------

    /**
     * Speelt een spel met bots en geeft de staat na elke zet terug.
     *
     * @return list<array<string, mixed>>
     */
    private function states(int $seed, int $players = 4): array
    {
        $seats = range(0, $players - 1);
        $rng = $this->rng($seed);
        $state = $this->game->startStep($seats, ['lives' => '3'], $rng, 0)->state;
        $states = [$state];
        for ($i = 0; $i < 400 && $this->game->outcome($state) === null; $i++) {
            $seat = $this->game->activeSeats($state)[0];
            $state = $this->game->apply($state, $seat, $this->game->botMove($state, $seat, 1 + ($seat * 3) % 10, $rng), $rng);
            $states[] = $state;
        }

        return $states;
    }

    public function testTheKnowledgeKeptAboutOtherHandsIsAlwaysTrue(): void
    {
        foreach ([1, 2, 3] as $seed) {
            foreach ($this->states($seed) as $state) {
                foreach ($state['known'] as $seat => $cards) {
                    foreach ($cards as $position => $card) {
                        if ($card !== null) {
                            $this->assertSame($state['hands'][$seat][$position], $card, "Seed $seed: bekende kaart klopt niet.");
                        }
                    }
                }
            }
        }
    }

    public function testAMoveDoesNotDependOnTheClosedCardsOfOthersOrTheDeck(): void
    {
        $checked = 0;
        foreach ([1, 2, 3, 4] as $seed) {
            foreach ($this->states($seed) as $index => $state) {
                if ($this->game->outcome($state) !== null || $index % 3 !== 0) {
                    continue;
                }
                $seat = $this->game->activeSeats($state)[0];
                $variant = $this->shuffleHidden($state, $seat, $seed + $index);
                foreach ([1, 4, 6, 8, 10] as $level) {
                    $this->assertSame(
                        $this->game->botMove($state, $seat, $level, $this->rng(7)),
                        $this->game->botMove($variant, $seat, $level, $this->rng(7)),
                        "Niveau $level liet zijn zet afhangen van dichte kaarten (seed $seed, stap $index).",
                    );
                    $checked++;
                }
            }
        }
        $this->assertGreaterThan(50, $checked);
    }

    /**
     * Dezelfde staat, maar met de dichte kaarten van anderen en de stok door elkaar. Wat openbaar bekend
     * is (de pot, jouw hand en `known`) blijft staan.
     *
     * @param array<string, mixed> $state
     * @return array<string, mixed>
     */
    private function shuffleHidden(array $state, int $seat, int $seed): array
    {
        $slots = [];
        $cards = [];
        foreach ($state['hands'] as $other => $hand) {
            if ($other === $seat) {
                continue;
            }
            foreach ($hand as $position => $card) {
                if (($state['known'][$other][$position] ?? null) === null) {
                    $slots[] = [$other, $position];
                    $cards[] = $card;
                }
            }
        }
        $deckStart = count($cards);
        foreach ($state['deck'] as $card) {
            $cards[] = $card;
        }
        mt_srand($seed);
        $order = range(0, count($cards) - 1);
        shuffle($order);
        $shuffled = array_map(static fn (int $i): string => $cards[$i], $order);

        foreach ($slots as $index => [$other, $position]) {
            $state['hands'][$other][$position] = $shuffled[$index];
        }
        $state['deck'] = array_slice($shuffled, $deckStart);

        return $state;
    }

    // --- sterkte ------------------------------------------------------------------------------

    public function testLevelTenBeatsLevelOneAtTheSameTable(): void
    {
        $wins = 0;
        $games = 30;
        for ($seed = 1; $seed <= $games; $seed++) {
            $winners = $this->playMatch([0 => 10, 1 => 1, 2 => 1], ['lives' => '3'], 500 + $seed);
            $this->assertNotNull($winners);
            $wins += $winners === [0] ? 1 : 0;
        }

        // Bij gelijke sterkte wint elke speler ongeveer een derde.
        $this->assertGreaterThan($games * 0.5, $wins, "Niveau 10 won $wins van $games.");
    }

    public function testLevelSevenBeatsLevelTwoAtTheSameTable(): void
    {
        $wins = 0;
        $games = 30;
        for ($seed = 1; $seed <= $games; $seed++) {
            $winners = $this->playMatch([0 => 7, 1 => 2, 2 => 2], ['lives' => '3'], 900 + $seed);
            $this->assertNotNull($winners);
            $wins += $winners === [0] ? 1 : 0;
        }

        $this->assertGreaterThan($games * 0.45, $wins, "Niveau 7 won $wins van $games.");
    }
}
