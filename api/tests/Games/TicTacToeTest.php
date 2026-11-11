<?php

declare(strict_types=1);

namespace Dg\Tests\Games;

use Dg\Games\Game;
use Dg\Games\GameRegistry;
use Dg\Games\InvalidMove;
use Dg\Games\Rng;
use Dg\Games\TicTacToe;

final class TicTacToeTest extends GameContractTestCase
{
    protected function game(): Game
    {
        return new TicTacToe();
    }

    private function fixed(int ...$values): Rng
    {
        return new Rng(static function () use (&$values): int {
            return array_shift($values) ?? 0;
        });
    }

    /** Speelt de gegeven cellen om en om, te beginnen met plaats 3 (X). */
    private function play(array $cells): array
    {
        $game = $this->game();
        $state = $game->start([3, 7], ['starter' => 'first'], $this->fixed());
        $seats = [3, 7];
        foreach ($cells as $i => $cell) {
            $state = $game->apply($state, $seats[$i % 2], ['cell' => $cell], $this->fixed());
        }

        return $state;
    }

    public function testStarterSettingDecidesWhoBegins(): void
    {
        $game = $this->game();

        $this->assertSame([3], $game->activeSeats($game->start([3, 7], ['starter' => 'first'], $this->fixed())));
        $this->assertSame([7], $game->activeSeats($game->start([3, 7], ['starter' => 'second'], $this->fixed())));
        $this->assertSame([7], $game->activeSeats($game->start([3, 7], ['starter' => 'random'], $this->fixed(1))));
    }

    public function testWinningLineEndsTheGame(): void
    {
        $state = $this->play([0, 3, 1, 4, 2]);
        $game = $this->game();

        $this->assertSame(['winners' => [3]], $game->outcome($state));
        $this->assertSame([0, 1, 2], $game->view($state, 7)['line']);
        $this->assertSame(3, $game->view($state, 7)['winnerSeat']);
        $this->assertNull($game->view($state, 7)['turnSeat']);
    }

    public function testFullBoardWithoutLineIsADraw(): void
    {
        $state = $this->play([0, 1, 2, 4, 3, 5, 7, 6, 8]);

        $this->assertSame(['winners' => []], $this->game()->outcome($state));
    }

    public function testRejectsIllegalMoves(): void
    {
        $game = $this->game();
        $state = $this->play([4]);

        foreach ([['cell' => 4], ['cell' => 9], ['cell' => -1], ['cell' => '3'], []] as $move) {
            try {
                $game->apply($state, 7, $move, $this->fixed());
                $this->fail('Zet had geweigerd moeten worden: ' . json_encode($move));
            } catch (InvalidMove) {
                $this->addToAssertionCount(1);
            }
        }

        $this->expectException(InvalidMove::class);
        $game->apply($state, 3, ['cell' => 0], $this->fixed()); // niet aan de beurt
    }

    public function testCannotMoveAfterTheGameEnded(): void
    {
        $state = $this->play([0, 3, 1, 4, 2]);

        $this->expectException(InvalidMove::class);
        $this->game()->apply($state, 7, ['cell' => 8], $this->fixed());
    }

    public function testViewShowsMarksAndYourMark(): void
    {
        $view = $this->game()->view($this->play([4]), 7);

        $this->assertSame('X', $view['board'][4]);
        $this->assertSame('O', $view['yourMark']);
        $this->assertSame(['3' => 'X', '7' => 'O'], $view['marks']);
        $this->assertSame(7, $view['turnSeat']);
    }

    public function testLevelTenBotBlocksAnImmediateLoss(): void
    {
        $game = $this->game();
        // X heeft 0 en 1; O (plaats 7) moet 2 blokkeren.
        $state = $this->play([0, 4, 1]);

        $move = $game->botMove($state, 7, 10, $this->fixed());

        $this->assertSame(['cell' => 2], $move);
    }

    public function testLevelTenBotTakesAWinningMove(): void
    {
        $game = $this->game();
        // O heeft 3 en 4 en is aan zet; vakje 5 wint.
        $state = $this->play([0, 3, 1, 4, 8]);

        $this->assertSame(['cell' => 5], $game->botMove($state, 7, 10, $this->fixed()));
    }

    public function testTwoLevelTenBotsAlwaysDraw(): void
    {
        $game = $this->game();
        for ($seed = 1; $seed <= 5; $seed++) {
            $rng = $this->rng($seed);
            $state = $game->start([3, 7], ['starter' => 'random'], $rng);
            while ($game->outcome($state) === null) {
                $seat = $game->activeSeats($state)[0];
                $state = $game->apply($state, $seat, $game->botMove($state, $seat, 10, $rng), $rng);
            }
            $this->assertSame(['winners' => []], $game->outcome($state));
        }
    }

    public function testEmptyBoardBotMoveIsFast(): void
    {
        $game = $this->game();
        $state = $game->start([3, 7], ['starter' => 'first'], $this->fixed());

        $start = microtime(true);
        $game->botMove($state, 3, 10, $this->fixed());

        $this->assertLessThan(0.5, microtime(true) - $start);
    }

    public function testRegistryKnowsTicTacToe(): void
    {
        $registry = GameRegistry::default();

        $this->assertTrue($registry->has('tic-tac-toe'));
        $this->assertFalse($registry->has('mancala'));
        $this->assertSame('tic-tac-toe', $registry->get('tic-tac-toe')->slug());
        $this->assertSame(['tic-tac-toe', '31-en'], $registry->slugs());
    }

    public function testRegistryRejectsUnknownGame(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        GameRegistry::default()->get('mancala');
    }
}
