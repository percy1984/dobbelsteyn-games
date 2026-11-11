<?php

declare(strict_types=1);

namespace Dg\Games;

/**
 * De bots van 31-en, niveau 1 (bijna willekeurig) tot en met 10 (sterk). De niveaus staan in
 * `PROFILES` en in docs/31-en.md.
 *
 * Een bot gebruikt alleen wat een mens ook weet: zijn eigen hand, de pot en wat openbaar bekend is.
 * Dat laatste is `known` in de spelstaat: welke kaart een speler uit de pot nam en waar die in zijn
 * hand ligt, tot hij hem verplaatst of de ronde voorbij is. De dichte kaarten van anderen en de stok
 * gebruikt hij nooit, ook niet "per ongeluk" (de tests controleren dat).
 *
 * Wat een niveau bepaalt:
 *  - `error`: kans op een willekeurige, maar geldige zet;
 *  - `passScore`: bij de lagere niveaus past de bot vanaf deze score;
 *  - `risk`, `samples` en `memory`: bij de hogere niveaus schat de bot met `samples` gokken over de
 *    handen van tegenstanders (bekende kaarten uit de laatste `memory` acties, de rest geschat uit de
 *    kaarten die hij niet ziet) hoe groot de kans is dat hij de laagste score heeft, en past als die
 *    kans maximaal `risk` is;
 *  - `bluff`: kans dat hij bewust vroeg past (met een redelijke hand) of juist laat (met een goede);
 *  - `swapAll`: of hij alles ruilen gebruikt (nooit, soms, of slim als de pot veel beter is).
 */
final class ThirtyOneBot
{
    /** @var array<int, array{memory: int, error: float, passScore: int, risk: float|null, samples: int, bluff: float, swapAll: string}> */
    public const PROFILES = [
        1 => ['memory' => 0, 'error' => 0.60, 'passScore' => 26, 'risk' => null, 'samples' => 0, 'bluff' => 0.00, 'swapAll' => 'never'],
        2 => ['memory' => 0, 'error' => 0.45, 'passScore' => 25, 'risk' => null, 'samples' => 0, 'bluff' => 0.00, 'swapAll' => 'never'],
        3 => ['memory' => 0, 'error' => 0.35, 'passScore' => 24, 'risk' => null, 'samples' => 0, 'bluff' => 0.00, 'swapAll' => 'never'],
        4 => ['memory' => 0, 'error' => 0.25, 'passScore' => 23, 'risk' => null, 'samples' => 0, 'bluff' => 0.00, 'swapAll' => 'random'],
        5 => ['memory' => 0, 'error' => 0.18, 'passScore' => 22, 'risk' => null, 'samples' => 0, 'bluff' => 0.00, 'swapAll' => 'random'],
        6 => ['memory' => 8, 'error' => 0.12, 'passScore' => 21, 'risk' => 0.50, 'samples' => 10, 'bluff' => 0.05, 'swapAll' => 'smart'],
        7 => ['memory' => 14, 'error' => 0.08, 'passScore' => 21, 'risk' => 0.40, 'samples' => 20, 'bluff' => 0.08, 'swapAll' => 'smart'],
        8 => ['memory' => 24, 'error' => 0.04, 'passScore' => 21, 'risk' => 0.30, 'samples' => 30, 'bluff' => 0.10, 'swapAll' => 'smart'],
        9 => ['memory' => 48, 'error' => 0.02, 'passScore' => 21, 'risk' => 0.22, 'samples' => 40, 'bluff' => 0.12, 'swapAll' => 'smart'],
        10 => ['memory' => PHP_INT_MAX, 'error' => 0.00, 'passScore' => 21, 'risk' => 0.15, 'samples' => 60, 'bluff' => 0.12, 'swapAll' => 'smart'],
    ];

    /** @var list<string> */
    private array $allCards = [];

    public function __construct(private readonly ThirtyOne $game)
    {
        foreach (['S', 'H', 'D', 'C'] as $suit) {
            foreach (['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as $rank) {
                $this->allCards[] = $suit . $rank;
            }
        }
    }

    /** @return array{memory: int, error: float, passScore: int, risk: float|null, samples: int, bluff: float, swapAll: string} */
    public static function profile(int $level): array
    {
        return self::PROFILES[max(1, min(10, $level))];
    }

    /**
     * @param array<string, mixed> $state
     * @return array<string, mixed> een geldige zet voor `ThirtyOne::applyStep()`
     */
    public function move(array $state, int $seat, int $level, Rng $rng): array
    {
        $profile = self::profile($level);
        $allowed = $this->game->allowed($state, $seat);
        $hand = $state['hands'][$seat];
        $pot = $state['pot'];

        // Foutkans: een willekeurige zet, maar wel een geldige.
        if ($rng->int(1, 1000) <= (int) round($profile['error'] * 1000)) {
            return $rng->pick($this->legalMoves($hand, $pot, $allowed));
        }

        $current = $this->game->score($hand);
        [$bestMove, $bestScore] = $this->bestSwap($hand, $pot, $rng);
        $improves = $bestScore > $current;

        if ($allowed['swapAll'] && $this->wantsSwapAll($profile, $pot, $bestScore, $rng)) {
            return ['type' => 'swapAll'];
        }

        if (!$allowed['pass']) {
            // Passen mag nog niet: verbeter je hand, sla anders over (als dat mag) of wissel de beste.
            if ($improves) {
                return $bestMove;
            }

            return $allowed['skip'] ? ['type' => 'skip'] : $bestMove;
        }

        // Laatste beurtenronde: nog één kans om te verbeteren, anders houd je je hand (Pas).
        if ($state['final']) {
            return $improves ? $bestMove : ['type' => 'pass'];
        }

        $wantsPass = !$improves || $this->goodEnough($state, $seat, $profile, $current, $rng);
        if ($profile['bluff'] > 0 && $rng->int(1, 1000) <= (int) round($profile['bluff'] * 1000)) {
            if ($wantsPass && $improves) {
                $wantsPass = false;
            } elseif (!$wantsPass && $current >= 18) {
                $wantsPass = true;
            }
        }

        return $wantsPass ? ['type' => 'pass'] : $bestMove;
    }

    /**
     * Alle geldige hoofdacties, voor een willekeurige zet.
     *
     * @param list<string> $hand
     * @param list<string> $pot
     * @param array{swap: bool, swapAll: bool, pass: bool, skip: bool} $allowed
     * @return list<array<string, mixed>>
     */
    private function legalMoves(array $hand, array $pot, array $allowed): array
    {
        $moves = [];
        foreach ($hand as $handCard) {
            foreach ($pot as $potCard) {
                $moves[] = ['type' => 'swap', 'handCard' => $handCard, 'potCard' => $potCard];
            }
        }
        foreach (['swapAll', 'pass', 'skip'] as $type) {
            if ($allowed[$type]) {
                $moves[] = ['type' => $type];
            }
        }

        return $moves;
    }

    /**
     * De wissel met de hoogste score erna; bij gelijke scores kiest de bot er willekeurig één.
     *
     * @param list<string> $hand
     * @param list<string> $pot
     * @return array{0: array<string, mixed>, 1: float}
     */
    private function bestSwap(array $hand, array $pot, Rng $rng): array
    {
        $best = [];
        $bestScore = -1.0;
        foreach ($hand as $handCard) {
            foreach ($pot as $potCard) {
                $score = $this->game->score($this->replaced($hand, $handCard, $potCard));
                if ($score > $bestScore) {
                    $bestScore = $score;
                    $best = [];
                }
                if ($score === $bestScore) {
                    $best[] = ['type' => 'swap', 'handCard' => $handCard, 'potCard' => $potCard];
                }
            }
        }

        return [$rng->pick($best), $bestScore];
    }

    /**
     * Alles ruilen telt ook als Pas. Slim: alleen als de pot als hand duidelijk beter is dan wat een
     * enkele wissel oplevert.
     *
     * @param array{memory: int, error: float, passScore: int, risk: float|null, samples: int, bluff: float, swapAll: string} $profile
     * @param list<string> $pot
     */
    private function wantsSwapAll(array $profile, array $pot, float $bestSwapScore, Rng $rng): bool
    {
        return match ($profile['swapAll']) {
            'smart' => ($score = $this->game->score($pot)) >= 21 && $score >= $bestSwapScore + 3,
            'random' => $rng->int(1, 100) <= 8,
            default => false,
        };
    }

    /**
     * Is de hand goed genoeg om te passen? Lage niveaus kijken alleen naar hun eigen score; hogere
     * schatten de kans dat ze de laagste score hebben.
     *
     * @param array<string, mixed> $state
     * @param array{memory: int, error: float, passScore: int, risk: float|null, samples: int, bluff: float, swapAll: string} $profile
     */
    private function goodEnough(array $state, int $seat, array $profile, float $current, Rng $rng): bool
    {
        if ($profile['risk'] === null) {
            return $current >= $profile['passScore'];
        }

        return $this->riskOfLowest($state, $seat, $profile, $current, $rng) <= $profile['risk'];
    }

    /**
     * De kans dat deze score de laagste is (gelijk telt als laagste: dan verlies je een leven). De
     * handen van tegenstanders worden gegokt uit openbare kennis plus de kaarten die de bot niet ziet.
     * Wie nog een beurt krijgt, mag zijn hand nog één keer verbeteren met de huidige pot.
     *
     * @param array<string, mixed> $state
     * @param array{memory: int, error: float, passScore: int, risk: float|null, samples: int, bluff: float, swapAll: string} $profile
     */
    private function riskOfLowest(array $state, int $seat, array $profile, float $current, Rng $rng): float
    {
        $opponents = array_values(array_filter(
            $state['seats'],
            static fn (int $other): bool => $other !== $seat && $state['lives'][$other] > 0,
        ));
        if ($opponents === [] || $profile['samples'] <= 0) {
            return 0.0;
        }

        // Wat de bot van anderen onthouden heeft: bekende kaarten uit de laatste `memory` acties.
        $known = [];
        $visible = [...$state['hands'][$seat], ...$state['pot']];
        foreach ($opponents as $other) {
            for ($position = 0; $position < 3; $position++) {
                $card = $state['known'][$other][$position] ?? null;
                $age = $state['actionNo'] - ($state['knownAt'][$other][$position] ?? 0);
                if ($card !== null && $age <= $profile['memory']) {
                    $known[$other][$position] = $card;
                    $visible[] = $card;
                }
            }
        }
        $pool = array_values(array_diff($this->allCards, $visible));

        $lost = 0;
        for ($sample = 0; $sample < $profile['samples']; $sample++) {
            $shuffled = $rng->shuffle($pool);
            $next = 0;
            $lowest = PHP_FLOAT_MAX;
            foreach ($opponents as $other) {
                $theirs = [];
                for ($position = 0; $position < 3; $position++) {
                    $theirs[] = $known[$other][$position] ?? $shuffled[$next++];
                }
                $score = $this->game->score($theirs);
                $canImprove = !in_array($other, $state['locked'], true)
                    && (!$state['final'] || in_array($other, $state['toPlay'], true));
                if ($canImprove) {
                    $score = max($score, $this->bestSwapScore($theirs, $state['pot']));
                }
                $lowest = min($lowest, $score);
            }
            if ($current <= $lowest) {
                $lost++;
            }
        }

        return $lost / $profile['samples'];
    }

    /**
     * @param list<string> $hand
     * @param list<string> $pot
     */
    private function bestSwapScore(array $hand, array $pot): float
    {
        $best = $this->game->score($hand);
        foreach ($hand as $handCard) {
            foreach ($pot as $potCard) {
                $best = max($best, $this->game->score($this->replaced($hand, $handCard, $potCard)));
            }
        }

        return $best;
    }

    /**
     * @param list<string> $hand
     * @return list<string>
     */
    private function replaced(array $hand, string $out, string $in): array
    {
        return array_map(static fn (string $card): string => $card === $out ? $in : $card, $hand);
    }
}
