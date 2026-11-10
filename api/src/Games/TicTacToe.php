<?php

declare(strict_types=1);

namespace Dg\Games;

use InvalidArgumentException;

/**
 * Tic-Tac-Toe voor twee spelers: de referentie-implementatie van het spelcontract.
 *
 * Staat: ['players' => [seatNo, seatNo], 'board' => 9 x (null|0|1), 'turn' => 0|1,
 *         'moves' => int, 'winner' => null|0|1, 'line' => null|list<int>]
 * Waarden in `board`, `turn` en `winner` zijn indexen in `players` (0 = X, 1 = O).
 */
final class TicTacToe implements Game
{
    private const STARTERS = ['random', 'first', 'second'];
    private const LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    public function slug(): string
    {
        return 'tic-tac-toe';
    }

    public function minPlayers(): int
    {
        return 2;
    }

    public function maxPlayers(): int
    {
        return 2;
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => 'starter', 'type' => 'choice', 'default' => 'random', 'choices' => self::STARTERS],
        ];
    }

    public function normalizeSettings(array $settings): array
    {
        $starter = $settings['starter'] ?? 'random';
        if (!is_string($starter) || !in_array($starter, self::STARTERS, true)) {
            throw new InvalidArgumentException('Ongeldige waarde voor starter.');
        }

        return ['starter' => $starter];
    }

    public function start(array $seatNos, array $settings, Rng $rng): array
    {
        if (count($seatNos) !== 2) {
            throw new InvalidArgumentException('Tic-Tac-Toe heeft precies twee spelers nodig.');
        }

        $first = match ($settings['starter'] ?? 'random') {
            'first' => 0,
            'second' => 1,
            default => $rng->int(0, 1),
        };

        return [
            'players' => array_values($seatNos),
            'board' => array_fill(0, 9, null),
            'turn' => $first,
            'moves' => 0,
            'winner' => null,
            'line' => null,
        ];
    }

    public function view(array $state, int $seatNo): array
    {
        $marks = ['X', 'O'];
        $players = $state['players'];

        return [
            'board' => array_map(static fn (?int $cell): ?string => $cell === null ? null : $marks[$cell], $state['board']),
            // Welke plaats welk teken speelt.
            'marks' => [(string) $players[0] => 'X', (string) $players[1] => 'O'],
            'yourMark' => $this->playerIndex($state, $seatNo) === null ? null : $marks[$this->playerIndex($state, $seatNo)],
            'turnSeat' => $this->isFinished($state) ? null : $players[$state['turn']],
            'winnerSeat' => $state['winner'] === null ? null : $players[$state['winner']],
            'line' => $state['line'],
            'moves' => $state['moves'],
        ];
    }

    public function activeSeats(array $state): array
    {
        return $this->isFinished($state) ? [] : [$state['players'][$state['turn']]];
    }

    public function apply(array $state, int $seatNo, array $move, Rng $rng): array
    {
        if ($this->isFinished($state)) {
            throw new InvalidMove('Het spel is afgelopen.');
        }
        if ($this->activeSeats($state) !== [$seatNo]) {
            throw new InvalidMove('Je bent niet aan de beurt.');
        }

        $cell = $move['cell'] ?? null;
        if (!is_int($cell) || $cell < 0 || $cell > 8) {
            throw new InvalidMove('Kies een vakje van 0 tot en met 8.');
        }
        if ($state['board'][$cell] !== null) {
            throw new InvalidMove('Dat vakje is al bezet.');
        }

        $player = $state['turn'];
        $state['board'][$cell] = $player;
        $state['moves']++;

        foreach (self::LINES as $line) {
            if ($state['board'][$line[0]] === $player && $state['board'][$line[1]] === $player && $state['board'][$line[2]] === $player) {
                $state['winner'] = $player;
                $state['line'] = $line;

                return $state;
            }
        }

        $state['turn'] = 1 - $player;

        return $state;
    }

    public function outcome(array $state): ?array
    {
        if ($state['winner'] !== null) {
            return ['winners' => [$state['players'][$state['winner']]]];
        }

        return $state['moves'] >= 9 ? ['winners' => []] : null;
    }

    public function botMove(array $state, int $seatNo, int $level, Rng $rng): array
    {
        $player = $this->playerIndex($state, $seatNo);
        if ($player === null || $this->activeSeats($state) !== [$seatNo]) {
            throw new InvalidMove('De bot is niet aan de beurt.');
        }

        $free = array_keys(array_filter($state['board'], static fn (?int $cell): bool => $cell === null));
        $level = max(1, min(10, $level));

        // Niveau 1 speelt 10% van de zetten sterk, niveau 10 altijd (kans lineair ertussen).
        $strongChance = (int) round(($level - 1) / 9 * 100);
        if ($rng->int(1, 100) <= max(10, $strongChance) || $level === 10) {
            return ['cell' => $rng->pick($this->bestCells($state['board'], $player, $free))];
        }

        return ['cell' => $rng->pick($free)];
    }

    /**
     * Alle vakjes met de beste minimax-waarde voor `$player`.
     *
     * @param list<int|null> $board
     * @param list<int> $free
     * @return non-empty-list<int>
     */
    private function bestCells(array $board, int $player, array $free): array
    {
        $best = null;
        $cells = [];
        $memo = [];
        foreach ($free as $cell) {
            $board[$cell] = $player;
            $score = -$this->negamax($board, 1 - $player, $memo);
            $board[$cell] = null;

            if ($best === null || $score > $best) {
                $best = $score;
                $cells = [$cell];
            } elseif ($score === $best) {
                $cells[] = $cell;
            }
        }

        return $cells;
    }

    /**
     * Waarde van de stelling voor de speler die aan zet is: positief winst, 0 gelijk, negatief verlies
     * (hoe sneller de winst, hoe hoger).
     *
     * @param list<int|null> $board
     * @param array<string, int> $memo reeds berekende standen (er zijn er maar enkele duizenden)
     */
    private function negamax(array $board, int $player, array &$memo): int
    {
        $key = $player . ':' . implode('', array_map(static fn (?int $c): string => $c === null ? '-' : (string) $c, $board));
        if (isset($memo[$key])) {
            return $memo[$key];
        }

        foreach (self::LINES as $line) {
            $owner = $board[$line[0]];
            if ($owner !== null && $owner === $board[$line[1]] && $owner === $board[$line[2]]) {
                // De vorige speler maakte deze lijn: de speler aan zet heeft verloren.
                return $memo[$key] = ($owner === $player ? 100 : -100);
            }
        }

        $best = null;
        foreach ($board as $cell => $value) {
            if ($value !== null) {
                continue;
            }
            $board[$cell] = $player;
            $score = -$this->negamax($board, 1 - $player, $memo);
            $board[$cell] = null;
            // Een snellere winst (of tragere nederlaag) is beter: de waarde loopt per zet naar 0.
            $score += $score > 0 ? -1 : ($score < 0 ? 1 : 0);
            $best = $best === null ? $score : max($best, $score);
        }

        return $memo[$key] = ($best ?? 0);
    }

    /** @param array<string, mixed> $state */
    private function isFinished(array $state): bool
    {
        return $this->outcome($state) !== null;
    }

    /** @param array<string, mixed> $state */
    private function playerIndex(array $state, int $seatNo): ?int
    {
        $index = array_search($seatNo, $state['players'], true);

        return $index === false ? null : $index;
    }
}
