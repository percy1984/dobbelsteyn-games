<?php

declare(strict_types=1);

namespace Dg\Tests\Games;

use Dg\Games\Game;
use Dg\Games\GameRegistry;
use Dg\Games\GameStep;
use Dg\Games\InvalidMove;
use Dg\Games\Rng;
use Dg\Games\ThirtyOne;

/**
 * Regels van 31-en. Het contract met het platform (JSON-staat, geldige botzetten, enzovoort) wordt
 * door de basisklasse bewaakt; hier staan de spelregels.
 *
 * De meeste tests gebruiken drie spelers (plaatsen 0, 1 en 2) met een vaste toevalsbron: plaats 0 is
 * deler, plaats 1 begint en de volgorde is 1, 2, 0. De handen worden daarna met `rig()` vastgezet.
 */
final class ThirtyOneTest extends GameContractTestCase
{
    protected function game(): Game
    {
        return new ThirtyOne();
    }

    private function thirty(): ThirtyOne
    {
        return new ThirtyOne();
    }

    private function fixedRng(): Rng
    {
        return new Rng(static fn (int $min, int $max): int => $min);
    }

    /**
     * Toevalsbron die precies de gevraagde decks oplevert, in de volgorde waarin ze geschud worden.
     * De eerste waarde is de index van de deler; daarna volgt per deck de Fisher-Yates reeks die
     * het gevraagde deck oplevert. Een kaart op index 0 van het deck wordt als eerste gedeeld.
     *
     * @param list<list<string>> $decks
     */
    private function scriptedRng(int $dealerIndex, array ...$decks): Rng
    {
        $queue = [$dealerIndex];
        foreach ($decks as $target) {
            $work = $this->fullDeck();
            for ($i = count($work) - 1; $i > 0; $i--) {
                $j = (int) array_search($target[$i], array_slice($work, 0, $i + 1), true);
                $queue[] = $j;
                [$work[$i], $work[$j]] = [$work[$j], $work[$i]];
            }
            $this->assertSame($target, $work, 'Het gescripte deck moet kloppen.');
        }

        return new Rng(static function (int $min, int $max) use (&$queue): int {
            $value = array_shift($queue);
            if ($value === null || $value < $min || $value > $max) {
                throw new \LogicException('De gescripte toevalsbron raakte uit de pas.');
            }

            return $value;
        });
    }

    /** @return list<string> */
    private function fullDeck(): array
    {
        $deck = [];
        foreach (['S', 'H', 'D', 'C'] as $suit) {
            foreach (['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as $rank) {
                $deck[] = $suit . $rank;
            }
        }

        return $deck;
    }

    /** @param array<string, string> $settings @param list<int> $seats @return array<string, mixed> */
    private function table(array $settings = [], array $seats = [0, 1, 2]): array
    {
        return $this->thirty()->startStep($seats, $settings, $this->fixedRng(), 0)->state;
    }

    /**
     * Zet de handen en de pot vast. De rest van de kaarten gaat in de stok.
     *
     * @param array<string, mixed> $state
     * @param array<int, list<string>> $hands
     * @param list<string> $pot
     * @return array<string, mixed>
     */
    private function rig(array $state, array $hands, array $pot = ['DA', 'HA', 'S8']): array
    {
        $state['hands'] = $hands;
        $state['pot'] = $pot;
        $used = [...$pot, ...array_merge(...array_values($hands))];
        $state['deck'] = array_values(array_diff($this->fullDeck(), $used));

        return $state;
    }

    /** Drie spelers met scores 9 (plaats 1), 19 (plaats 2) en 20 (plaats 0), pot DA HA S8. */
    private function rigged(array $settings = []): array
    {
        return $this->rig($this->table($settings), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['C9', 'CT', 'D7'],
            0 => ['SK', 'SQ', 'H9'],
        ]);
    }

    /** @param array<string, mixed> $move */
    private function act(array $state, int $seat, array $move, int $nowMs = 0): GameStep
    {
        return $this->thirty()->applyStep($state, $seat, $move, $this->fixedRng(), $nowMs);
    }

    /** Wisselt de eerste handkaart met de eerste potkaart. @return array<string, mixed> */
    private function swapFirst(array $state, int $seat): array
    {
        $move = ['type' => 'swap', 'handCard' => $state['hands'][$seat][0], 'potCard' => $state['pot'][0]];

        return $this->act($state, $seat, $move)->state;
    }

    /** @param list<array<string, mixed>> $events @return list<string> */
    private function types(array $events): array
    {
        return array_map(static fn (array $event): string => $event['type'], $events);
    }

    private function assertInvalid(callable $fn, string $message = ''): void
    {
        try {
            $fn();
            $this->fail('Verwachtte InvalidMove. ' . $message);
        } catch (InvalidMove) {
            $this->addToAssertionCount(1);
        }
    }

    // --- score ---------------------------------------------------------------------------------

    public function testScoreIsTheBestSuitSum(): void
    {
        $this->assertSame(24.0, $this->thirty()->score(['S7', 'S8', 'S9']));
        $this->assertSame(18.0, $this->thirty()->score(['S7', 'SA', 'H9']));
        $this->assertSame(21.0, $this->thirty()->score(['SA', 'SQ', 'H9']));
    }

    public function testThreeDifferentSuitsScoreTheHighestCard(): void
    {
        $this->assertSame(9.0, $this->thirty()->score(['S7', 'H8', 'D9']));
        $this->assertSame(11.0, $this->thirty()->score(['SA', 'H8', 'D9']));
    }

    public function testThreeOfTheSameRankScoreThirtyAndAHalf(): void
    {
        $this->assertSame(30.5, $this->thirty()->score(['S8', 'H8', 'D8']));
        $this->assertSame(30.5, $this->thirty()->score(['SK', 'HK', 'DK']));
        $this->assertSame(30.5, $this->thirty()->score(['SA', 'HA', 'DA']));
    }

    public function testTenJackAndQueenAreEachTenPointsButNotThirtyAndAHalf(): void
    {
        $this->assertSame(10.0, $this->thirty()->score(['ST', 'HJ', 'DQ']));
    }

    public function testThirtyOneIsAnAceAndTwoTensInTheSameSuit(): void
    {
        $this->assertSame(31.0, $this->thirty()->score(['SA', 'SK', 'SQ']));
        $this->assertSame(31.0, $this->thirty()->score(['HA', 'HT', 'HJ']));
    }

    // --- delen ---------------------------------------------------------------------------------

    public function testDealingGivesEveryoneThreeCardsAndThreeAreOpenInThePot(): void
    {
        $state = $this->table();

        foreach ([0, 1, 2] as $seat) {
            $this->assertCount(3, $state['hands'][$seat]);
        }
        $this->assertCount(3, $state['pot']);
        $this->assertCount(32 - 12, $state['deck']);
        $all = [...$state['pot'], ...$state['deck'], ...array_merge(...array_values($state['hands']))];
        $this->assertCount(32, array_unique($all));
    }

    public function testThePlayerAfterTheDealerBeginsAndPlaysClockwise(): void
    {
        $state = $this->table();

        $this->assertSame(0, $state['dealer']);
        $this->assertSame([1], $this->thirty()->activeSeats($state));
        $events = $this->thirty()->startStep([0, 1, 2], [], $this->fixedRng(), 0)->events;
        $this->assertSame('dealt', $events[1]['type']);
        $this->assertSame([1, 2, 0], $events[1]['order']);
    }

    public function testEightPlayersLeaveFiveCardsInTheDeck(): void
    {
        $state = $this->table([], range(0, 7));

        $this->assertCount(5, $state['deck']);
    }

    public function testNumberOfPlayersMustBeBetweenTwoAndEight(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->thirty()->startStep([0], [], $this->fixedRng(), 0);
    }

    public function testTheDealerRoleMovesOnToTheNextPlayerEachRound(): void
    {
        $events = $this->settleByPassing($this->rigged());
        $dealt = array_values(array_filter($events, static fn (array $e): bool => $e['type'] === 'dealt'))[0];

        $this->assertSame(1, $dealt['dealer']);
        $this->assertSame([2, 0, 1], $dealt['order']);
        $this->assertSame(2, $dealt['round']);
    }

    public function testPlayersWhoAreOutAreSkippedWhenDealingAndTheLastOneStandingWins(): void
    {
        $state = $this->rigged(['lives' => '1']);
        // Plaats 1 heeft de laagste score (9) en gaat er direct uit.
        $state = $this->act($state, 1, ['type' => 'pass'])->state;
        $state = $this->act($state, 2, ['type' => 'pass'])->state;
        $state = $this->act($state, 0, ['type' => 'pass'])->state;

        $this->assertSame(0, $state['lives'][1]);
        $this->assertSame(2, $state['round']);
        // Na deler 0 komt plaats 1 (af), dus plaats 2 is deler en plaats 0 begint.
        $this->assertSame(2, $state['dealer']);
        $this->assertSame([0], $this->thirty()->activeSeats($state));
        $this->assertArrayNotHasKey(1, $state['hands']);

        $state = $this->rig($state, [0 => ['S7', 'H8', 'D9'], 2 => ['SK', 'SQ', 'H9']]);
        $state = $this->act($state, 0, ['type' => 'pass'])->state;
        $state = $this->act($state, 2, ['type' => 'pass'])->state;

        $this->assertTrue($state['finished']);
        $this->assertSame(['winners' => [2]], $this->thirty()->outcome($state));
    }

    // --- zetten, wisselen ----------------------------------------------------------------------

    public function testSwappingPutsThePotCardOnTheSamePositionAndOpensTheHandCard(): void
    {
        $state = $this->rigged();

        $step = $this->act($state, 1, ['type' => 'swap', 'handCard' => 'H8', 'potCard' => 'HA']);

        $this->assertSame(['S7', 'HA', 'D9'], $step->state['hands'][1]);
        $this->assertSame(['DA', 'H8', 'S8'], $step->state['pot']);
        $this->assertSame([2], $this->thirty()->activeSeats($step->state));
        $this->assertSame(
            [['type' => 'swap', 'seat' => 1, 'handPos' => 1, 'potPos' => 1, 'taken' => 'HA', 'given' => 'H8']],
            $step->events,
        );
    }

    public function testASwapMustUseACardInTheHandAndACardInThePot(): void
    {
        $state = $this->rigged();

        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'swap', 'handCard' => 'SK', 'potCard' => 'HA']));
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'swap', 'handCard' => 'H8', 'potCard' => 'C7']));
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'swap', 'handCard' => 'H8']));
    }

    public function testOnlyThePlayerWhoseTurnItIsCanDoAMainAction(): void
    {
        $state = $this->rigged();

        $this->assertInvalid(fn () => $this->act($state, 2, ['type' => 'pass']));
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'onbekend']));
    }

    public function testAPlayerCannotSwapAndThenPassInTheSameTurn(): void
    {
        $state = $this->swapFirst($this->rigged(), 1);

        // De beurt is doorgeschoven; een tweede actie van plaats 1 mag niet.
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'pass']));
    }

    // --- Stop 31 -------------------------------------------------------------------------------

    public function testSwappingToThirtyOneStopsTheRoundAndSettles(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['SA', 'SK', 'H7'],
            2 => ['C9', 'CT', 'D7'],
            0 => ['H9', 'D8', 'C7'],
        ], ['SQ', 'HA', 'S8']);

        $step = $this->act($state, 1, ['type' => 'swap', 'handCard' => 'H7', 'potCard' => 'SQ']);

        $types = $this->types($step->events);
        $this->assertSame(['swap', 'stop31', 'settled', 'dealt'], array_slice($types, 0, 4));
        $settled = $step->events[2];
        $this->assertSame('stop31', $settled['reason']);
        // Plaats 0 heeft de laagste score (9) en verliest een leven; de rest niet.
        $this->assertSame([0], $settled['lost']);
        $this->assertSame(4, $step->state['lives'][0]);
        $this->assertSame(5, $step->state['lives'][1]);
        $this->assertSame(2, $step->state['round']);
    }

    public function testAHandOfThirtyOneStopsAutomaticallyWhenItIsThePlayersTurn(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['HA', 'HK', 'HQ'],
            0 => ['C7', 'D8', 'S9'],
        ], ['SA', 'DA', 'S8']);

        $step = $this->act($state, 1, ['type' => 'pass']);

        // Plaats 1 past; plaats 2 heeft 31 en moet bij zijn beurt stoppen.
        $this->assertSame(['pass', 'lastRound', 'stop31', 'settled'], array_slice($this->types($step->events), 0, 4));
        $this->assertSame(2, $step->events[2]['seat']);
        $this->assertSame('stop31', $step->events[3]['reason']);
    }

    public function testThirtyOneInTheMiddleOfTheLastRoundStopsImmediately(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['C9', 'CT', 'D7'],
            0 => ['HA', 'HK', 'HQ'],
        ], ['SA', 'DA', 'S8']);
        $state = $this->act($state, 1, ['type' => 'pass'])->state;

        $step = $this->act($state, 2, ['type' => 'pass']);

        $this->assertSame(['pass', 'stop31', 'settled'], array_slice($this->types($step->events), 0, 3));
        $this->assertSame('stop31', $step->events[2]['reason']);
    }

    // --- passen en de laatste beurtenronde -----------------------------------------------------

    public function testAfterAPassEveryoneElseGetsExactlyOneMoreTurnAndThenTheRoundIsSettled(): void
    {
        $state = $this->rigged();

        $step = $this->act($state, 1, ['type' => 'pass']);
        $this->assertSame(['pass', 'lastRound'], $this->types($step->events));
        $this->assertSame(1, $step->events[1]['startedBy']);
        $this->assertSame([2, 0], $step->events[1]['toPlay']);
        $this->assertTrue($step->state['final']);
        $view = $this->thirty()->view($step->state, 2);
        $this->assertTrue($view['finalRound']);
        $this->assertSame([2], $this->thirty()->activeSeats($step->state));

        $state = $this->swapFirst($step->state, 2);
        $this->assertSame([0], $this->thirty()->activeSeats($state));

        $step = $this->act($state, 0, ['type' => 'swap', 'handCard' => 'H9', 'potCard' => $state['pot'][0]]);
        $this->assertContains('settled', $this->types($step->events));
        $this->assertSame('lastRound', $step->events[array_search('settled', $this->types($step->events), true)]['reason']);
        // De speler die paste, kwam niet meer aan de beurt.
        $this->assertSame([], array_filter($step->events, static fn (array $e): bool => $e['type'] === 'swap' && $e['seat'] === 1));
    }

    public function testPassingInTheLastRoundJustKeepsTheHand(): void
    {
        $state = $this->act($this->rigged(), 1, ['type' => 'pass'])->state;
        $state = $this->act($state, 2, ['type' => 'pass'])->state;

        $this->assertSame([0], $this->thirty()->activeSeats($state));
        $step = $this->act($state, 0, ['type' => 'pass']);

        $this->assertContains('settled', $this->types($step->events));
        // Een tweede Pas start geen nieuwe laatste ronde: er was maar één 'lastRound'.
        $this->assertCount(0, array_filter($step->events, static fn (array $e): bool => $e['type'] === 'lastRound'));
    }

    public function testPassIsAllowedStraightAwayByDefault(): void
    {
        $step = $this->act($this->rigged(), 1, ['type' => 'pass']);

        $this->assertSame('pass', $step->events[0]['type']);
    }

    public function testPassRuleAfterOneFullRoundForbidsPassingBeforeEveryoneHadATurn(): void
    {
        $state = $this->rigged(['passRule' => 'after-round']);
        $this->assertFalse($this->thirty()->view($state, 1)['allowed']['pass']);

        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'pass']));
        $state = $this->swapFirst($state, 1);
        $this->assertInvalid(fn () => $this->act($state, 2, ['type' => 'pass']));
        $state = $this->swapFirst($state, 2);
        $this->assertInvalid(fn () => $this->act($state, 0, ['type' => 'pass']));
        $state = $this->swapFirst($state, 0);

        // Iedereen had één beurt: nu mag passen.
        $this->assertTrue($this->thirty()->view($state, 1)['allowed']['pass']);
        $this->assertSame('pass', $this->act($state, 1, ['type' => 'pass'])->events[0]['type']);
    }

    // --- overslaan -----------------------------------------------------------------------------

    public function testSkippingATurnIsForbiddenByDefault(): void
    {
        $this->assertInvalid(fn () => $this->act($this->rigged(), 1, ['type' => 'skip']));
    }

    public function testSkippingPassesTheTurnWhenAllowed(): void
    {
        $state = $this->rigged(['skip' => 'on']);

        $step = $this->act($state, 1, ['type' => 'skip']);

        $this->assertSame([['type' => 'skip', 'seat' => 1]], $step->events);
        $this->assertSame([2], $this->thirty()->activeSeats($step->state));
        $this->assertSame($state['hands'], $step->state['hands']);
    }

    public function testWhenEveryoneSkipsAFullRoundTheRoundIsSettled(): void
    {
        $state = $this->rigged(['skip' => 'on']);
        $state = $this->act($state, 1, ['type' => 'skip'])->state;
        $state = $this->act($state, 2, ['type' => 'skip'])->state;

        $step = $this->act($state, 0, ['type' => 'skip']);

        $settled = array_values(array_filter($step->events, static fn (array $e): bool => $e['type'] === 'settled'))[0];
        $this->assertSame('allSkipped', $settled['reason']);
        $this->assertSame([1], $settled['lost']);
    }

    public function testASwapBreaksTheSkipStreak(): void
    {
        $state = $this->rigged(['skip' => 'on']);
        $state = $this->act($state, 1, ['type' => 'skip'])->state;
        $state = $this->swapFirst($state, 2);
        $state = $this->act($state, 0, ['type' => 'skip'])->state;

        $this->assertSame([1], $this->thirty()->activeSeats($state));
        $this->assertSame(1, $state['skipStreak']);
    }

    public function testSkippingIsNotAllowedInTheLastRound(): void
    {
        $state = $this->act($this->rigged(['skip' => 'on']), 1, ['type' => 'pass'])->state;

        $this->assertFalse($this->thirty()->view($state, 2)['allowed']['skip']);
        $this->assertInvalid(fn () => $this->act($state, 2, ['type' => 'skip']));
    }

    // --- alles ruilen --------------------------------------------------------------------------

    public function testSwapAllCanBeSwitchedOff(): void
    {
        $state = $this->rigged(['swapAll' => 'off']);

        $this->assertFalse($this->thirty()->view($state, 1)['allowed']['swapAll']);
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'swapAll']));
    }

    public function testSwapAllForTheStarterOnlyWorksInTheStartersFirstTurn(): void
    {
        $state = $this->rigged();

        $this->assertFalse($this->thirty()->view($this->swapFirst($state, 1), 2)['allowed']['swapAll'] ?? false);
        $this->assertTrue($this->thirty()->view($state, 1)['allowed']['swapAll']);

        // Na een eerste rondje is het niet meer mogelijk, ook niet voor de beginspeler.
        $later = $this->swapFirst($this->swapFirst($this->swapFirst($state, 1), 2), 0);
        $this->assertFalse($this->thirty()->view($later, 1)['allowed']['swapAll']);
        $this->assertInvalid(fn () => $this->act($later, 1, ['type' => 'swapAll']));
    }

    public function testSwapAllForEveryoneIsAllowedInEveryTurnIncludingTheLastRound(): void
    {
        $state = $this->rigged(['swapAll' => 'everyone']);
        $state = $this->swapFirst($state, 1);

        $this->assertTrue($this->thirty()->view($state, 2)['allowed']['swapAll']);

        $state = $this->act($state, 2, ['type' => 'swapAll'])->state;
        // Alles ruilen is ook een Pas: de laatste beurtenronde loopt nu en plaats 2 komt niet meer aan de beurt.
        $this->assertTrue($state['final']);
        $this->assertSame([0, 1], $state['toPlay']);
        $this->assertTrue($this->thirty()->view($state, 0)['allowed']['swapAll']);
    }

    public function testSwapAllExchangesTheWholeHandPositionByPositionAndCountsAsAPass(): void
    {
        $state = $this->rigged();

        $step = $this->act($state, 1, ['type' => 'swapAll']);

        $this->assertSame(['DA', 'HA', 'S8'], $step->state['hands'][1]);
        $this->assertSame(['S7', 'H8', 'D9'], $step->state['pot']);
        $this->assertSame(['swapAll', 'lastRound'], $this->types($step->events));
        $this->assertSame([1], $step->state['locked']);
        $this->assertSame([2, 0], $step->state['toPlay']);
    }

    public function testSwapAllWithPassRuleAfterOneRoundStartsTheLastRoundOnlyAfterTheFirstRound(): void
    {
        $state = $this->rigged(['passRule' => 'after-round']);

        $step = $this->act($state, 1, ['type' => 'swapAll']);

        // Gepast, maar de andere spelers spelen de eerste ronde gewoon uit.
        $this->assertSame(['swapAll'], $this->types($step->events));
        $this->assertTrue($step->state['pendingFinal']);
        $this->assertFalse($step->state['final']);
        $this->assertTrue($this->thirty()->view($step->state, 2)['lastRoundPending']);
        $state = $step->state;
        $this->assertSame([2], $this->thirty()->activeSeats($state));

        $step = $this->act($state, 2, ['type' => 'swap', 'handCard' => 'C9', 'potCard' => $state['pot'][0]]);
        $state = $step->state;
        $this->assertSame([0], $this->thirty()->activeSeats($state));
        $this->assertFalse($state['final']);

        // Na de laatste speler van de eerste ronde begint de laatste beurtenronde: plaats 2 en 0 spelen opnieuw.
        $step = $this->act($state, 0, ['type' => 'swap', 'handCard' => 'H9', 'potCard' => $state['pot'][0]]);
        $state = $step->state;
        $this->assertSame(['swap', 'lastRound'], $this->types($step->events));
        $this->assertSame([2, 0], $step->events[1]['toPlay']);
        $this->assertSame([2], $this->thirty()->activeSeats($state));
        $this->assertNotContains(1, $this->thirty()->activeSeats($state));

        $state = $this->swapFirst($state, 2);
        $this->assertSame([0], $this->thirty()->activeSeats($state));
        $step = $this->act($state, 0, ['type' => 'pass']);

        $this->assertContains('settled', $this->types($step->events));
    }

    public function testWhenEveryoneIsLockedTheRoundIsSettledAtOnce(): void
    {
        // Twee spelers; plaats 1 ruilt alles (gepast, uitgesteld), plaats 0 ruilt ook alles.
        $state = $this->rig(
            $this->table(['passRule' => 'after-round', 'swapAll' => 'everyone'], [0, 1]),
            [1 => ['S7', 'H8', 'D9'], 0 => ['SK', 'SQ', 'H9']],
        );
        $state = $this->act($state, 1, ['type' => 'swapAll'])->state;

        $step = $this->act($state, 0, ['type' => 'swapAll']);

        $this->assertContains('settled', $this->types($step->events));
    }

    // --- afrekening ----------------------------------------------------------------------------

    /** @return list<array<string, mixed>> */
    private function settleByPassing(array $state): array
    {
        $events = [];
        foreach ([1, 2, 0] as $seat) {
            if (!in_array($seat, $this->thirty()->activeSeats($state), true)) {
                continue;
            }
            $step = $this->act($state, $seat, ['type' => 'pass']);
            $state = $step->state;
            array_push($events, ...$step->events);
        }

        return $events;
    }

    /** @param list<array<string, mixed>> $events */
    private function settled(array $events): array
    {
        return array_values(array_filter($events, static fn (array $e): bool => $e['type'] === 'settled'))[0];
    }

    public function testTheLowestScoreLosesALife(): void
    {
        $settled = $this->settled($this->settleByPassing($this->rigged()));

        $this->assertSame([1], $settled['lost']);
        $this->assertSame([], $settled['eliminated']);
        $this->assertSame(
            [['seat' => 0, 'cards' => ['SK', 'SQ', 'H9'], 'score' => 20.0], ['seat' => 1, 'cards' => ['S7', 'H8', 'D9'], 'score' => 9.0], ['seat' => 2, 'cards' => ['C9', 'CT', 'D7'], 'score' => 19.0]],
            $settled['hands'],
        );
        $this->assertSame([['seat' => 0, 'lives' => 5], ['seat' => 1, 'lives' => 4], ['seat' => 2, 'lives' => 5]], $settled['lives']);
    }

    public function testEveryoneWithTheSameLowestScoreLosesALife(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['H7', 'D8', 'C9'],
            0 => ['SK', 'SQ', 'H9'],
        ]);

        $settled = $this->settled($this->settleByPassing($state));

        $this->assertEqualsCanonicalizing([1, 2], $settled['lost']);
    }

    public function testWhenEveryoneIsTiedEveryoneLosesALifeAndNothingElseHappens(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['H7', 'D8', 'C9'],
            0 => ['D7', 'C8', 'S9'],
        ]);

        $settled = $this->settled($this->settleByPassing($state));

        $this->assertEqualsCanonicalizing([0, 1, 2], $settled['lost']);
        $this->assertSame([['seat' => 0, 'lives' => 4], ['seat' => 1, 'lives' => 4], ['seat' => 2, 'lives' => 4]], $settled['lives']);
    }

    public function testSharingTheHighestScoreHasNoConsequences(): void
    {
        $state = $this->rig($this->table(), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['HK', 'HQ', 'D7'],
            0 => ['SK', 'SQ', 'H9'],
        ]);

        $settled = $this->settled($this->settleByPassing($state));

        $this->assertSame([1], $settled['lost']);
    }

    public function testAPlayerWithZeroLivesIsOutAndTheLastOneStandingWins(): void
    {
        $state = $this->rig($this->table(['lives' => '1'], [0, 1]), [1 => ['S7', 'H8', 'D9'], 0 => ['SK', 'SQ', 'H9']]);
        $state = $this->act($state, 1, ['type' => 'pass'])->state;

        $step = $this->act($state, 0, ['type' => 'pass']);

        $this->assertSame(['pass', 'settled', 'finished'], $this->types($step->events));
        $this->assertSame([1], $step->events[1]['eliminated']);
        $this->assertSame(['winners' => [0]], $this->thirty()->outcome($step->state));
        $this->assertSame([], $this->thirty()->activeSeats($step->state));
    }

    public function testTheLastPlayersReachingZeroTogetherAllLoseAndThereIsNoWinner(): void
    {
        $state = $this->rig($this->table(['lives' => '1'], [0, 1]), [1 => ['S7', 'H8', 'D9'], 0 => ['H7', 'D8', 'C9']]);
        $state = $this->act($state, 1, ['type' => 'pass'])->state;

        $step = $this->act($state, 0, ['type' => 'pass']);

        $this->assertSame(['winners' => []], $this->thirty()->outcome($step->state));
        $this->assertEqualsCanonicalizing([0, 1], $step->events[1]['eliminated']);
        $this->assertSame(['pass', 'settled', 'finished'], $this->types($step->events));
    }

    public function testTwoPlayersReachingZeroTogetherLeaveTheThirdAsWinner(): void
    {
        $state = $this->rig($this->table(['lives' => '1']), [
            1 => ['S7', 'H8', 'D9'],
            2 => ['H7', 'D8', 'C9'],
            0 => ['SK', 'SQ', 'H9'],
        ]);

        $events = $this->settleByPassing($state);

        $this->assertSame('finished', $events[array_key_last($events)]['type']);
        $this->assertSame([0], $events[array_key_last($events)]['winners']);
    }

    public function testNoMoveIsPossibleAfterTheMatchIsOver(): void
    {
        $state = $this->rig($this->table(['lives' => '1'], [0, 1]), [1 => ['S7', 'H8', 'D9'], 0 => ['SK', 'SQ', 'H9']]);
        $state = $this->act($this->act($state, 1, ['type' => 'pass'])->state, 0, ['type' => 'pass'])->state;

        $this->assertInvalid(fn () => $this->act($state, 0, ['type' => 'pass']));
        $this->assertInvalid(fn () => $this->act($state, 0, ['type' => 'move', 'cards' => ['SK', 'SQ']]));
    }

    // --- vuile was -----------------------------------------------------------------------------

    /**
     * Een deck voor drie spelers (deler = plaats 0, volgorde 1, 2, 0): negen kaarten voor de handen,
     * dan de pot, dan wat daarna komt.
     *
     * @param list<string> $pot
     * @param list<string> $next de kaarten die na de pot bovenaan de stok liggen
     * @return list<string>
     */
    private function deckWithPot(array $pot, array $next = []): array
    {
        $rest = array_values(array_diff($this->fullDeck(), $pot, $next));

        return [...array_slice($rest, 0, 9), ...$pot, ...$next, ...array_slice($rest, 9)];
    }

    private function start(array $settings, Rng $rng, int $players = 3): GameStep
    {
        return $this->thirty()->startStep(range(0, $players - 1), $settings, $rng, 0);
    }

    public function testNoCheckHappensWithoutDirtyLaundry(): void
    {
        $deck = $this->deckWithPot(['S7', 'H8', 'D9'], ['SA', 'HK', 'DQ']);

        $step = $this->start([], $this->scriptedRng(0, $deck));

        $this->assertSame(['S7', 'H8', 'D9'], $step->state['pot']);
        $this->assertNotContains('dirtyLaundry', $this->types($step->events));
    }

    public function testClassicDirtyLaundryReplacesAPotWithASevenEightAndNine(): void
    {
        $deck = $this->deckWithPot(['S7', 'H8', 'D9'], ['SA', 'HK', 'DQ']);

        $step = $this->start(['dirtyLaundry' => 'classic'], $this->scriptedRng(0, $deck));

        $this->assertSame(['SA', 'HK', 'DQ'], $step->state['pot']);
        $this->assertCount(32 - 9 - 3 - 3, $step->state['deck']);
        $this->assertNotContains('S7', $step->state['deck'], 'De opzijgelegde pot gaat niet terug in de stok.');
        $dirty = array_values(array_filter($step->events, static fn (array $e): bool => $e['type'] === 'dirtyLaundry'));
        $this->assertSame([['type' => 'dirtyLaundry', 'pot' => ['S7', 'H8', 'D9'], 'newPot' => ['SA', 'HK', 'DQ'], 'reshuffle' => false]], $dirty);
    }

    public function testClassicDirtyLaundryNeedsAllThreeRanks(): void
    {
        $deck = $this->deckWithPot(['S7', 'H7', 'D8'], ['SA', 'HK', 'DQ']);

        $step = $this->start(['dirtyLaundry' => 'classic'], $this->scriptedRng(0, $deck));

        $this->assertSame(['S7', 'H7', 'D8'], $step->state['pot']);
    }

    public function testBroadDirtyLaundryReplacesAnyPotWithoutAnyCardOfTenPointsOrMore(): void
    {
        $deck = $this->deckWithPot(['S7', 'H7', 'D8'], ['SA', 'HK', 'DQ']);

        $step = $this->start(['dirtyLaundry' => 'broad'], $this->scriptedRng(0, $deck));

        $this->assertSame(['SA', 'HK', 'DQ'], $step->state['pot']);
    }

    public function testBroadDirtyLaundryLeavesAPotWithATenOrHigher(): void
    {
        $deck = $this->deckWithPot(['S7', 'H8', 'DT']);

        $step = $this->start(['dirtyLaundry' => 'broad'], $this->scriptedRng(0, $deck));

        $this->assertSame(['S7', 'H8', 'DT'], $step->state['pot']);
    }

    public function testDirtyLaundryChecksAgainWithTheNewPot(): void
    {
        $deck = $this->deckWithPot(['S7', 'H8', 'D9'], ['C7', 'C8', 'C9', 'SA', 'HK', 'DQ']);

        $step = $this->start(['dirtyLaundry' => 'classic'], $this->scriptedRng(0, $deck));

        $this->assertSame(['SA', 'HK', 'DQ'], $step->state['pot']);
        $this->assertCount(2, array_filter($step->events, static fn (array $e): bool => $e['type'] === 'dirtyLaundry' && $e['reshuffle'] === false));
    }

    public function testFewerThanThreeCardsInTheDeckReshufflesAndDealsEveryoneAgain(): void
    {
        // Acht spelers: na het delen zijn er maar vijf kaarten over. Zijn de eerste twee potten beide vuil,
        // dan zijn er nog twee kaarten over en wordt alles opnieuw geschud.
        $pot1 = ['S7', 'H8', 'D9'];
        $pot2 = ['C7', 'C8', 'C9'];
        $rest = array_values(array_diff($this->fullDeck(), $pot1, $pot2));
        $first = [...array_slice($rest, 0, 24), ...$pot1, ...$pot2, ...array_slice($rest, 24)];
        $second = array_reverse($this->fullDeck());

        $step = $this->start(['dirtyLaundry' => 'classic'], $this->scriptedRng(0, $first, $second), 8);

        $types = $this->types($step->events);
        $this->assertSame(['started', 'dealt', 'dirtyLaundry', 'dirtyLaundry', 'dealt'], $types);
        $this->assertTrue($step->events[3]['reshuffle']);
        $this->assertNull($step->events[3]['newPot']);
        $this->assertSame(array_slice($second, 24, 3), $step->state['pot']);
        $this->assertCount(5, $step->state['deck']);
        for ($seat = 0; $seat < 8; $seat++) {
            $this->assertCount(3, $step->state['hands'][$seat]);
        }
    }

    // --- verplaatsen ---------------------------------------------------------------------------

    public function testMovingSwapsThePositionsOfTwoHandCardsAndOnlyPublishesThePositions(): void
    {
        $state = $this->rigged();

        $step = $this->act($state, 1, ['type' => 'move', 'cards' => ['S7', 'D9']], 10_000);

        $this->assertSame(['D9', 'H8', 'S7'], $step->state['hands'][1]);
        $this->assertSame([['type' => 'moved', 'seat' => 1, 'a' => 0, 'b' => 2]], $step->events);
        // De beurt is niet doorgeschoven.
        $this->assertSame([1], $this->thirty()->activeSeats($step->state));
    }

    public function testMovingIsAFreeMoveAndAllowedOutOfTurn(): void
    {
        $state = $this->rigged();

        $this->assertTrue($this->thirty()->isFreeMove($state, ['type' => 'move', 'cards' => ['C9', 'CT']]));
        $this->assertFalse($this->thirty()->isFreeMove($state, ['type' => 'pass']));
        // Plaats 2 is niet aan de beurt, maar mag wel verplaatsen.
        $step = $this->act($state, 2, ['type' => 'move', 'cards' => ['C9', 'D7']], 10_000);

        $this->assertSame(['D7', 'CT', 'C9'], $step->state['hands'][2]);
    }

    public function testMovingIsLimitedToOncePerFiveSeconds(): void
    {
        $state = $this->act($this->rigged(), 2, ['type' => 'move', 'cards' => ['C9', 'D7']], 10_000)->state;

        $this->assertInvalid(fn () => $this->act($state, 2, ['type' => 'move', 'cards' => ['C9', 'CT']], 14_999));
        $step = $this->act($state, 2, ['type' => 'move', 'cards' => ['D7', 'CT']], 15_000);

        $this->assertSame(['CT', 'D7', 'C9'], $step->state['hands'][2]);
        $this->assertSame(15_000, $step->state['lastMoveMs'][2]);
    }

    public function testTheLimitIsPerPlayer(): void
    {
        $state = $this->act($this->rigged(), 2, ['type' => 'move', 'cards' => ['C9', 'D7']], 10_000)->state;

        $step = $this->act($state, 0, ['type' => 'move', 'cards' => ['SK', 'SQ']], 10_001);

        $this->assertSame(['SQ', 'SK', 'H9'], $step->state['hands'][0]);
    }

    public function testMovingNeedsTwoDifferentCardsFromYourOwnHand(): void
    {
        $state = $this->rigged();

        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'move', 'cards' => ['S7', 'S7']]));
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'move', 'cards' => ['S7', 'SK']]));
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'move', 'cards' => ['S7']]));
        $this->assertInvalid(fn () => $this->act($state, 1, ['type' => 'move']));
    }

    public function testAPlayerWhoIsOutCannotMove(): void
    {
        $state = $this->rigged(['lives' => '1']);
        $state['lives'][2] = 0;
        unset($state['hands'][2]);

        $this->assertInvalid(fn () => $this->act($state, 2, ['type' => 'move', 'cards' => ['C9', 'D7']], 10_000));
    }

    public function testASwapUsesTheCardSoAMoveBeforeItNeverChangesWhichCardIsSwapped(): void
    {
        $state = $this->rigged();
        // De speler verplaatst H8 naar een andere plek en wisselt dan toch "H8" met de pot.
        $state = $this->act($state, 1, ['type' => 'move', 'cards' => ['S7', 'H8']], 10_000)->state;

        $step = $this->act($state, 1, ['type' => 'swap', 'handCard' => 'H8', 'potCard' => 'HA']);

        $this->assertSame(['HA', 'S7', 'D9'], $step->state['hands'][1]);
        $this->assertSame(0, $step->events[0]['handPos']);
    }

    // --- zetlog en verborgen informatie --------------------------------------------------------

    public function testTheDealEventNeverContainsTheDealtHands(): void
    {
        $step = $this->start([], $this->fixedRng());
        $dealt = $step->events[1];

        $this->assertSame(['type', 'round', 'dealer', 'order', 'pot'], array_keys($dealt));
        $json = json_encode($step->events, JSON_THROW_ON_ERROR);
        foreach ($step->state['hands'] as $hand) {
            foreach ($hand as $card) {
                if (!in_array($card, $step->state['pot'], true)) {
                    $this->assertStringNotContainsString('"' . $card . '"', $json);
                }
            }
        }
    }

    public function testAPlayersViewHidesTheHandsOfOthersAndTheDeck(): void
    {
        $state = $this->rigged();

        $view = $this->thirty()->view($state, 1);
        $json = json_encode($view, JSON_THROW_ON_ERROR);

        $this->assertSame(['S7', 'H8', 'D9'], $view['hand']);
        $this->assertSame(9.0, $view['score']);
        $this->assertSame(['DA', 'HA', 'S8'], $view['pot']);
        $this->assertSame(32 - 12, $view['deckCount']);
        foreach (['C9', 'CT', 'SK', 'SQ'] as $hidden) {
            $this->assertStringNotContainsString('"' . $hidden . '"', $json);
        }
    }

    public function testTheViewOnlyListsAllowedActionsOnYourOwnTurn(): void
    {
        $state = $this->rigged();

        $this->assertNull($this->thirty()->view($state, 2)['allowed']);
        $this->assertSame(
            ['swap' => true, 'swapAll' => true, 'pass' => true, 'skip' => false],
            $this->thirty()->view($state, 1)['allowed'],
        );
    }

    public function testSettingsAreNormalizedAndInvalidValuesRejected(): void
    {
        $this->assertSame(
            ['lives' => '5', 'passRule' => 'direct', 'skip' => 'off', 'swapAll' => 'starter', 'dirtyLaundry' => 'off'],
            $this->thirty()->normalizeSettings([]),
        );
        $this->expectException(\InvalidArgumentException::class);
        $this->thirty()->normalizeSettings(['lives' => '11']);
    }

    public function testTheGameIsRegisteredForTheServer(): void
    {
        $this->assertTrue(GameRegistry::default()->has('31-en'));
    }
}
