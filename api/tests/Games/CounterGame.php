<?php

declare(strict_types=1);

namespace Dg\Tests\Games;

use Dg\Games\EventedGame;
use Dg\Games\GameStep;
use Dg\Games\InvalidMove;
use Dg\Games\Rng;

/**
 * Minimale testgame voor de zetlog, vrije zetten en de klok. Spelers tellen om de beurt 1 of 2
 * bij een totaal; wie het totaal op 5 of hoger brengt, wint. Buiten de beurt mag je een notitie
 * plaatsen (vrije zet), hooguit één per 5 seconden. Elke speler heeft een geheim getal dat nooit in
 * de zetlog of in de view van een ander mag komen.
 */
final class CounterGame implements EventedGame
{
    public const GOAL = 5;
    public const NOTE_INTERVAL_MS = 5000;

    public function slug(): string
    {
        return 'counter';
    }

    public function minPlayers(): int
    {
        return 2;
    }

    public function maxPlayers(): int
    {
        return 3;
    }

    public function settingsSchema(): array
    {
        return [];
    }

    public function normalizeSettings(array $settings): array
    {
        return [];
    }

    public function start(array $seatNos, array $settings, Rng $rng): array
    {
        return $this->startStep($seatNos, $settings, $rng, 0)->state;
    }

    public function startStep(array $seatNos, array $settings, Rng $rng, int $nowMs): GameStep
    {
        $secrets = [];
        foreach ($seatNos as $seatNo) {
            $secrets[(string) $seatNo] = 7000 + $seatNo;
        }

        return new GameStep(
            [
                'seats' => $seatNos,
                'turn' => 0,
                'total' => 0,
                'winner' => null,
                'secrets' => $secrets,
                'lastNoteMs' => [],
            ],
            [['type' => 'started', 'seats' => $seatNos]],
        );
    }

    public function view(array $state, int $seatNo): array
    {
        return [
            'total' => $state['total'],
            'turn' => $state['seats'][$state['turn']],
            'secret' => $state['secrets'][(string) $seatNo] ?? null,
        ];
    }

    public function activeSeats(array $state): array
    {
        return $state['winner'] === null ? [$state['seats'][$state['turn']]] : [];
    }

    public function apply(array $state, int $seatNo, array $move, Rng $rng): array
    {
        return $this->applyStep($state, $seatNo, $move, $rng, 0)->state;
    }

    public function applyStep(array $state, int $seatNo, array $move, Rng $rng, int $nowMs): GameStep
    {
        if ($state['winner'] !== null) {
            throw new InvalidMove('Het spel is afgelopen.');
        }

        if (($move['type'] ?? null) === 'note') {
            return $this->note($state, $seatNo, $nowMs);
        }

        $amount = $move['amount'] ?? null;
        if (($move['type'] ?? null) !== 'add' || !in_array($amount, [1, 2], true)) {
            throw new InvalidMove('Onbekende zet.');
        }
        if ($state['seats'][$state['turn']] !== $seatNo) {
            throw new InvalidMove('Je bent niet aan de beurt.');
        }

        $state['total'] += $amount;
        $events = [['type' => 'added', 'seat' => $seatNo, 'amount' => $amount, 'total' => $state['total']]];
        if ($state['total'] >= self::GOAL) {
            $state['winner'] = $seatNo;
            $events[] = ['type' => 'finished', 'winner' => $seatNo];
        } else {
            $state['turn'] = ($state['turn'] + 1) % count($state['seats']);
        }

        return new GameStep($state, $events);
    }

    public function isFreeMove(array $state, array $move): bool
    {
        return ($move['type'] ?? null) === 'note';
    }

    public function outcome(array $state): ?array
    {
        return $state['winner'] === null ? null : ['winners' => [$state['winner']]];
    }

    public function botMove(array $state, int $seatNo, int $level, Rng $rng): array
    {
        return ['type' => 'add', 'amount' => 1];
    }

    /** @param array<string, mixed> $state */
    private function note(array $state, int $seatNo, int $nowMs): GameStep
    {
        if (!in_array($seatNo, $state['seats'], true)) {
            throw new InvalidMove('Je doet niet mee.');
        }
        $last = $state['lastNoteMs'][(string) $seatNo] ?? null;
        if ($last !== null && $nowMs - $last < self::NOTE_INTERVAL_MS) {
            throw new InvalidMove('Je mag maar één keer per 5 seconden.');
        }
        $state['lastNoteMs'][(string) $seatNo] = $nowMs;

        return new GameStep($state, [['type' => 'noted', 'seat' => $seatNo]]);
    }
}
