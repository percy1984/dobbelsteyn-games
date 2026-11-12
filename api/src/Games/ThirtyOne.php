<?php

declare(strict_types=1);

namespace Dg\Games;

use InvalidArgumentException;

/**
 * 31-en (eenendertigen): 2 tot en met 8 spelers, 32 piketkaarten, iedere speler heeft drie kaarten.
 * De regels staan in issue #23 (en de comment daaronder). Samengevat:
 *
 *  - Een beurt is precies één hoofdactie: wisselen (één kaart met de pot), alles ruilen, passen of
 *    (als de instelling aan staat) overslaan. Alles ruilen is ook een Pas.
 *  - Heb je 31 (bij het delen of na een wissel), dan roept de server automatisch Stop 31: de ronde
 *    stopt en de afrekening volgt. Dat is verplicht en geen Pas.
 *  - Na een Pas (of alles ruilen) krijgt iedere andere speler nog precies één beurt; daarna volgt de
 *    afrekening. Staat de pasregel op "na 1 volledige beurtenronde", dan begint die laatste
 *    beurtenronde pas nadat iedereen één beurt gehad heeft.
 *  - De laagste score(s) verliezen een leven; wie op 0 staat is af. Blijft er één over, dan wint die.
 *  - Kaarten in je hand verplaatsen is een vrije zet: ook buiten je beurt, hooguit één per 5 seconden.
 *
 * Kaarten zijn tekenreeksen van kleur en rang: kleur S (schoppen), H (harten), D (ruiten), C
 * (klaveren), rang 7, 8, 9, T (tien), J (boer), Q (vrouw), K (heer), A (aas). Bijvoorbeeld `ST`.
 *
 * De zetlog bevat alleen publieke informatie: gewisselde kaarten (die liggen daarna open in de pot),
 * de pot bij het delen en bij de afrekening de handen. Wie welke dichte kaart heeft, staat er nooit
 * in, ook niet bij het delen of bij het verplaatsen (daar staan alleen posities).
 *
 * Zetten (`$move`):
 *  - `{type: 'swap', handCard: 'S7', potCard: 'HK'}`: wissel een handkaart met een potkaart.
 *  - `{type: 'swapAll'}`, `{type: 'pass'}`, `{type: 'skip'}`.
 *  - `{type: 'move', cards: ['S7', 'HK']}`: laat twee handkaarten van positie ruilen (vrije zet).
 * Wisselen en verplaatsen gaan op kaart en niet op positie, zodat een verplaatsing die tegelijk
 * binnenkomt nooit de verkeerde kaart wisselt.
 */
final class ThirtyOne implements EventedGame
{
    /** Minimale tijd tussen twee verplaatsingen van dezelfde speler (ms). */
    public const MOVE_INTERVAL_MS = 5000;

    private const SUITS = ['S', 'H', 'D', 'C'];
    private const RANKS = ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    private const LIVES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    private const PASS_RULES = ['direct', 'after-round'];
    private const SKIP = ['off', 'on'];
    private const SWAP_ALL = ['off', 'starter', 'everyone'];
    private const DIRTY_LAUNDRY = ['off', 'classic', 'broad'];

    /** Veiligheidsgrens voor het opnieuw delen bij vuile was (alleen bereikbaar met een kapotte Rng). */
    private const MAX_DEAL_ATTEMPTS = 200;

    public function slug(): string
    {
        return '31-en';
    }

    public function minPlayers(): int
    {
        return 2;
    }

    public function maxPlayers(): int
    {
        return 8;
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => 'lives', 'type' => 'choice', 'default' => '5', 'choices' => self::LIVES],
            ['key' => 'passRule', 'type' => 'choice', 'default' => 'direct', 'choices' => self::PASS_RULES],
            ['key' => 'skip', 'type' => 'choice', 'default' => 'off', 'choices' => self::SKIP],
            ['key' => 'swapAll', 'type' => 'choice', 'default' => 'everyone', 'choices' => self::SWAP_ALL],
            ['key' => 'dirtyLaundry', 'type' => 'choice', 'default' => 'off', 'choices' => self::DIRTY_LAUNDRY],
        ];
    }

    public function normalizeSettings(array $settings): array
    {
        $normalized = [];
        foreach ($this->settingsSchema() as $field) {
            $value = $settings[$field['key']] ?? $field['default'];
            if (!is_string($value) || !in_array($value, $field['choices'], true)) {
                throw new InvalidArgumentException('Ongeldige waarde voor ' . $field['key'] . '.');
            }
            $normalized[$field['key']] = $value;
        }

        return $normalized;
    }

    public function start(array $seatNos, array $settings, Rng $rng): array
    {
        return $this->startStep($seatNos, $settings, $rng, 0)->state;
    }

    public function startStep(array $seatNos, array $settings, Rng $rng, int $nowMs): GameStep
    {
        $seats = array_values($seatNos);
        if (count($seats) < $this->minPlayers() || count($seats) > $this->maxPlayers()) {
            throw new InvalidArgumentException('31-en heeft 2 tot en met 8 spelers nodig.');
        }
        $settings = $this->normalizeSettings($settings);

        $lives = [];
        foreach ($seats as $seat) {
            $lives[$seat] = (int) $settings['lives'];
        }

        $state = [
            'settings' => $settings,
            'seats' => $seats,
            'lives' => $lives,
            'dealer' => $seats[$rng->int(0, count($seats) - 1)],
            'round' => 0,
            'hands' => [],
            'pot' => [],
            'deck' => [],
            'turn' => null,
            'firstPlayer' => null,
            'turnsPlayed' => 0,
            'playersAtDeal' => 0,
            'locked' => [],
            'pendingFinal' => false,
            'final' => false,
            'toPlay' => [],
            'skipStreak' => 0,
            // Openbare kennis over de dichte kaarten van spelers (zie rememberTaken); alleen uit publieke gebeurtenissen.
            'known' => [],
            'knownAt' => [],
            'actionNo' => 0,
            'lastMoveMs' => [],
            'finished' => false,
            'winners' => [],
        ];

        $events = [[
            'type' => 'started',
            'seats' => $seats,
            'lives' => $this->livesList($state),
            'settings' => $settings,
        ]];
        $state = $this->deal($state, $rng, $events);

        return new GameStep($state, $events);
    }

    public function view(array $state, int $seatNo): array
    {
        $hand = $state['hands'][$seatNo] ?? [];
        $myTurn = !$state['finished'] && $state['turn'] === $seatNo;

        return [
            'round' => $state['round'],
            'dealer' => $state['dealer'],
            'firstPlayer' => $state['firstPlayer'],
            'turn' => $state['turn'],
            'players' => array_map(fn (int $seat): array => [
                'seat' => $seat,
                'lives' => $state['lives'][$seat],
                'locked' => in_array($seat, $state['locked'], true),
            ], $state['seats']),
            'pot' => $state['pot'],
            'deckCount' => count($state['deck']),
            'hand' => $hand,
            'score' => $hand === [] ? null : $this->score($hand),
            'finalRound' => $state['final'],
            'lastRoundPending' => $state['pendingFinal'],
            'toPlay' => $state['toPlay'],
            'allowed' => $myTurn ? $this->allowed($state, $seatNo) : null,
            'lastMoveMs' => $state['lastMoveMs'][$seatNo] ?? null,
            'moveIntervalMs' => self::MOVE_INTERVAL_MS,
            'settings' => $state['settings'],
        ];
    }

    public function activeSeats(array $state): array
    {
        return $state['finished'] || $state['turn'] === null ? [] : [$state['turn']];
    }

    public function apply(array $state, int $seatNo, array $move, Rng $rng): array
    {
        return $this->applyStep($state, $seatNo, $move, $rng, 0)->state;
    }

    public function applyStep(array $state, int $seatNo, array $move, Rng $rng, int $nowMs): GameStep
    {
        if ($state['finished']) {
            throw new InvalidMove('Het spel is afgelopen.');
        }

        $type = $move['type'] ?? null;
        $events = [];

        if ($type === 'move') {
            return new GameStep($this->moveCards($state, $seatNo, $move, $nowMs, $events), $events);
        }

        if ($state['turn'] !== $seatNo) {
            throw new InvalidMove('Je bent niet aan de beurt.');
        }

        $state = match ($type) {
            'swap' => $this->swap($state, $seatNo, $move, $rng, $events),
            'swapAll' => $this->swapAll($state, $seatNo, $rng, $events),
            'pass' => $this->pass($state, $seatNo, $rng, $events),
            'skip' => $this->skip($state, $seatNo, $rng, $events),
            default => throw new InvalidMove('Onbekende zet.'),
        };

        return new GameStep($state, $events);
    }

    public function isFreeMove(array $state, array $move): bool
    {
        return ($move['type'] ?? null) === 'move';
    }

    public function outcome(array $state): ?array
    {
        return $state['finished'] ? ['winners' => $state['winners']] : null;
    }

    /**
     * Een zet van een bot, niveau 1 (zwakst) tot en met 10 (sterkst). De bot gebruikt alleen wat een
     * mens ook weet: zijn eigen hand, de pot en wat openbaar bekend is (zie `known`). De niveaus staan
     * in `ThirtyOneBot::PROFILES` en in docs/31-en.md. De zet is altijd geldig.
     */
    public function botMove(array $state, int $seatNo, int $level, Rng $rng): array
    {
        return (new ThirtyOneBot($this))->move($state, $seatNo, $level, $rng);
    }

    /**
     * Score van een hand: de hoogste van de beste kleursom en 30,5 voor drie kaarten van dezelfde
     * rang. Maximaal 31.
     *
     * @param list<string> $hand
     */
    public function score(array $hand): float
    {
        $suits = [];
        $ranks = [];
        foreach ($hand as $card) {
            $suits[$card[0]] = ($suits[$card[0]] ?? 0) + $this->value($card);
            $ranks[$card[1]] = true;
        }
        $best = (float) max($suits);
        if (count($hand) === 3 && count($ranks) === 1) {
            $best = max($best, 30.5);
        }

        return $best;
    }

    /** @return array{swap: bool, swapAll: bool, pass: bool, skip: bool} wat de speler aan de beurt nu mag */
    public function allowed(array $state, int $seatNo): array
    {
        $settings = $state['settings'];
        $swapAll = match ($settings['swapAll']) {
            'everyone' => true,
            'starter' => $seatNo === $state['firstPlayer'] && $state['turnsPlayed'] === 0 && !$state['final'],
            default => false,
        };

        return [
            'swap' => true,
            'swapAll' => $swapAll,
            'pass' => $this->mayPass($state),
            'skip' => $settings['skip'] === 'on' && !$state['final'],
        ];
    }

    private function mayPass(array $state): bool
    {
        return $state['final']
            || $state['settings']['passRule'] === 'direct'
            || $state['turnsPlayed'] >= $state['playersAtDeal'];
    }

    /** @param list<array<string, mixed>> $events */
    private function swap(array $state, int $seat, array $move, Rng $rng, array &$events): array
    {
        $handCard = $move['handCard'] ?? null;
        $potCard = $move['potCard'] ?? null;
        $handPos = is_string($handCard) ? array_search($handCard, $state['hands'][$seat], true) : false;
        $potPos = is_string($potCard) ? array_search($potCard, $state['pot'], true) : false;
        if ($handPos === false || $potPos === false) {
            throw new InvalidMove('Kies een kaart uit je hand en een kaart uit de pot.');
        }

        $state['hands'][$seat][$handPos] = $potCard;
        $state['pot'][$potPos] = $handCard;
        $state['skipStreak'] = 0;
        $state['known'][$seat][$handPos] = $potCard;
        $state['knownAt'][$seat][$handPos] = $state['actionNo'];
        $events[] = ['type' => 'swap', 'seat' => $seat, 'handPos' => $handPos, 'potPos' => $potPos, 'taken' => $potCard, 'given' => $handCard];

        return $this->after($state, $seat, false, $rng, $events);
    }

    /** @param list<array<string, mixed>> $events */
    private function swapAll(array $state, int $seat, Rng $rng, array &$events): array
    {
        if (!$this->allowed($state, $seat)['swapAll']) {
            throw new InvalidMove('Alles ruilen mag nu niet.');
        }

        $given = $state['hands'][$seat];
        $taken = $state['pot'];
        $state['hands'][$seat] = $taken;
        $state['pot'] = $given;
        $state['skipStreak'] = 0;
        $state['known'][$seat] = array_values($taken);
        $state['knownAt'][$seat] = [$state['actionNo'], $state['actionNo'], $state['actionNo']];
        $events[] = ['type' => 'swapAll', 'seat' => $seat, 'taken' => $taken, 'given' => $given];

        // Alles ruilen is ook een Pas.
        return $this->after($state, $seat, true, $rng, $events);
    }

    /** @param list<array<string, mixed>> $events */
    private function pass(array $state, int $seat, Rng $rng, array &$events): array
    {
        if (!$this->mayPass($state)) {
            throw new InvalidMove('Je mag nog niet passen.');
        }

        $state['skipStreak'] = 0;
        $events[] = ['type' => 'pass', 'seat' => $seat];

        return $this->after($state, $seat, true, $rng, $events);
    }

    /** @param list<array<string, mixed>> $events */
    private function skip(array $state, int $seat, Rng $rng, array &$events): array
    {
        if (!$this->allowed($state, $seat)['skip']) {
            throw new InvalidMove('Een beurt overslaan mag niet.');
        }

        $state['skipStreak']++;
        $events[] = ['type' => 'skip', 'seat' => $seat];

        return $this->after($state, $seat, false, $rng, $events);
    }

    /**
     * Laat twee handkaarten van positie ruilen. Een vrije zet: mag ook buiten de beurt van de
     * speler, maar hooguit één keer per MOVE_INTERVAL_MS.
     *
     * @param list<array<string, mixed>> $events
     */
    private function moveCards(array $state, int $seat, array $move, int $nowMs, array &$events): array
    {
        if (($state['lives'][$seat] ?? 0) <= 0 || !isset($state['hands'][$seat])) {
            throw new InvalidMove('Je doet niet meer mee.');
        }

        $cards = $move['cards'] ?? null;
        if (!is_array($cards) || count($cards) !== 2 || !is_string($cards[0] ?? null) || !is_string($cards[1] ?? null) || $cards[0] === $cards[1]) {
            throw new InvalidMove('Kies twee verschillende kaarten uit je hand.');
        }
        $a = array_search($cards[0], $state['hands'][$seat], true);
        $b = array_search($cards[1], $state['hands'][$seat], true);
        if ($a === false || $b === false) {
            throw new InvalidMove('Kies twee verschillende kaarten uit je hand.');
        }

        $last = $state['lastMoveMs'][$seat] ?? null;
        if ($last !== null && $nowMs - $last < self::MOVE_INTERVAL_MS) {
            throw new InvalidMove('Je mag kaarten maar één keer per 5 seconden verplaatsen.');
        }

        [$state['hands'][$seat][$a], $state['hands'][$seat][$b]] = [$cards[1], $cards[0]];
        $state['lastMoveMs'][$seat] = $nowMs;
        [$state['known'][$seat][$a], $state['known'][$seat][$b]] = [$state['known'][$seat][$b], $state['known'][$seat][$a]];
        [$state['knownAt'][$seat][$a], $state['knownAt'][$seat][$b]] = [$state['knownAt'][$seat][$b], $state['knownAt'][$seat][$a]];
        // Alleen de posities zijn publiek; de kaarten blijven dicht.
        $events[] = ['type' => 'moved', 'seat' => $seat, 'a' => $a, 'b' => $b];

        return $state;
    }

    /**
     * Wat er na een hoofdactie gebeurt: Stop 31 bij 31, vergrendelen bij Pas of alles ruilen, de
     * laatste beurtenronde starten, de afrekening of de volgende beurt.
     *
     * @param list<array<string, mixed>> $events
     */
    private function after(array $state, int $seat, bool $locks, Rng $rng, array &$events): array
    {
        $state['actionNo']++;

        // Stop 31 is verplicht: na een wissel (of alles ruilen) naar 31 stopt de ronde meteen.
        if ($this->score($state['hands'][$seat]) === 31.0) {
            $events[] = ['type' => 'stop31', 'seat' => $seat];

            return $this->settle($state, 'stop31', $rng, $events);
        }

        $wasFinal = $state['final'];
        $state['turnsPlayed']++;

        if ($locks) {
            $state['locked'][] = $seat;
            if (!$state['final'] && !$state['pendingFinal']) {
                if ($this->mayPass($state)) {
                    $state = $this->activateFinal($state, $seat, $events);
                } else {
                    // Alles ruilen in de eerste beurtenronde met de pasregel "na 1 ronde": de speler
                    // is gepast, maar de laatste beurtenronde begint pas na de eerste ronde.
                    $state['pendingFinal'] = true;
                }
            }
        }
        if (!$state['final'] && $state['pendingFinal'] && $state['turnsPlayed'] >= $state['playersAtDeal']) {
            $state = $this->activateFinal($state, $seat, $events);
        }

        if ($state['final']) {
            // Was de laatste ronde al bezig, dan heeft deze speler zijn beurt daarin nu gehad.
            if ($wasFinal) {
                $state['toPlay'] = array_values(array_diff($state['toPlay'], [$seat]));
            }
            if ($state['toPlay'] === []) {
                return $this->settle($state, 'lastRound', $rng, $events);
            }
            $state['turn'] = $state['toPlay'][0];

            return $this->beginTurn($state, $rng, $events);
        }

        if ($state['skipStreak'] >= count($this->open($state))) {
            return $this->settle($state, 'allSkipped', $rng, $events);
        }
        $next = $this->open($state, $seat)[0] ?? null;
        if ($next === null) {
            return $this->settle($state, 'lastRound', $rng, $events);
        }
        $state['turn'] = $next;

        return $this->beginTurn($state, $rng, $events);
    }

    /**
     * Start de laatste beurtenronde: iedere speler die nog niet gepast heeft, krijgt nog precies één
     * beurt, te beginnen na $afterSeat.
     *
     * @param list<array<string, mixed>> $events
     */
    private function activateFinal(array $state, int $afterSeat, array &$events): array
    {
        $state['final'] = true;
        $state['pendingFinal'] = false;
        $state['toPlay'] = $this->open($state, $afterSeat);
        $events[] = ['type' => 'lastRound', 'startedBy' => $state['locked'][0], 'toPlay' => $state['toPlay']];

        return $state;
    }

    /**
     * Levende spelers die nog niet gepast hebben, in beurtvolgorde. Met $afterSeat beginnend na die
     * plaats, zonder blijft de volgorde van de tafel.
     *
     * @return list<int>
     */
    private function open(array $state, ?int $afterSeat = null): array
    {
        $order = $afterSeat === null ? $state['seats'] : $this->orderAfter($state, $afterSeat);

        return array_values(array_filter(
            $order,
            static fn (int $seat): bool => $state['lives'][$seat] > 0 && !in_array($seat, $state['locked'], true),
        ));
    }

    /**
     * Alle plaatsen in beurtvolgorde, beginnend na $seat en eindigend met $seat zelf.
     *
     * @return list<int>
     */
    private function orderAfter(array $state, int $seat): array
    {
        $seats = $state['seats'];
        $index = (int) array_search($seat, $seats, true);
        $order = [];
        for ($i = 1; $i <= count($seats); $i++) {
            $order[] = $seats[($index + $i) % count($seats)];
        }

        return $order;
    }

    /** Roept automatisch Stop 31 als de speler aan de beurt precies 31 heeft. */
    private function beginTurn(array $state, Rng $rng, array &$events): array
    {
        $seat = $state['turn'];
        if ($seat !== null && $this->score($state['hands'][$seat]) === 31.0) {
            $events[] = ['type' => 'stop31', 'seat' => $seat];

            return $this->settle($state, 'stop31', $rng, $events);
        }

        return $state;
    }

    /**
     * De afrekening: de laagste score(s) verliezen een leven. Daarna volgt de volgende ronde of het
     * einde van de wedstrijd.
     *
     * @param list<array<string, mixed>> $events
     */
    private function settle(array $state, string $reason, Rng $rng, array &$events): array
    {
        $scores = [];
        foreach ($state['seats'] as $seat) {
            if ($state['lives'][$seat] > 0) {
                $scores[$seat] = $this->score($state['hands'][$seat]);
            }
        }
        $lowest = min($scores);
        $lost = [];
        foreach ($scores as $seat => $score) {
            if ($score === $lowest) {
                $state['lives'][$seat]--;
                $lost[] = $seat;
            }
        }

        $events[] = [
            'type' => 'settled',
            'round' => $state['round'],
            'reason' => $reason,
            'hands' => array_map(
                fn (int $seat): array => ['seat' => $seat, 'cards' => $state['hands'][$seat], 'score' => $scores[$seat]],
                array_keys($scores),
            ),
            'lost' => $lost,
            'lives' => $this->livesList($state),
            'eliminated' => array_values(array_filter($lost, static fn (int $seat): bool => $state['lives'][$seat] <= 0)),
        ];

        $alive = array_values(array_filter($state['seats'], static fn (int $seat): bool => $state['lives'][$seat] > 0));
        if (count($alive) <= 1) {
            $state['finished'] = true;
            $state['winners'] = $alive;
            $state['turn'] = null;
            $state['toPlay'] = [];
            $events[] = ['type' => 'finished', 'winners' => $alive];

            return $state;
        }

        // De delersrol schuift door naar de volgende speler die nog meedoet.
        foreach ($this->orderAfter($state, $state['dealer']) as $seat) {
            if ($state['lives'][$seat] > 0) {
                $state['dealer'] = $seat;
                break;
            }
        }

        return $this->deal($state, $rng, $events);
    }

    /**
     * Schudt en deelt een nieuwe ronde: drie kaarten per speler, één voor één, en drie open in de pot.
     * Met vuile was wordt de pot vervangen zolang hij vuil is; zijn er dan minder dan drie kaarten
     * in de stok, dan wordt alles opnieuw geschud en gedeeld.
     *
     * @param list<array<string, mixed>> $events
     */
    private function deal(array $state, Rng $rng, array &$events): array
    {
        $state['round']++;
        $order = array_values(array_filter(
            $this->orderAfter($state, $state['dealer']),
            static fn (int $seat): bool => $state['lives'][$seat] > 0,
        ));

        for ($attempt = 0; $attempt < self::MAX_DEAL_ATTEMPTS; $attempt++) {
            $deck = $rng->shuffle($this->deck());
            $hands = [];
            for ($i = 0; $i < 3; $i++) {
                foreach ($order as $seat) {
                    $hands[$seat][] = array_shift($deck);
                }
            }
            $pot = array_splice($deck, 0, 3);
            $events[] = ['type' => 'dealt', 'round' => $state['round'], 'dealer' => $state['dealer'], 'order' => $order, 'pot' => $pot];

            $reshuffle = false;
            while ($this->isDirty($pot, $state['settings']['dirtyLaundry']) && $attempt < self::MAX_DEAL_ATTEMPTS - 1) {
                if (count($deck) < 3) {
                    $events[] = ['type' => 'dirtyLaundry', 'pot' => $pot, 'newPot' => null, 'reshuffle' => true];
                    $reshuffle = true;
                    break;
                }
                $newPot = array_splice($deck, 0, 3);
                $events[] = ['type' => 'dirtyLaundry', 'pot' => $pot, 'newPot' => $newPot, 'reshuffle' => false];
                $pot = $newPot;
            }
            if (!$reshuffle) {
                break;
            }
        }

        $state['hands'] = $hands;
        $state['pot'] = $pot;
        $state['deck'] = $deck;
        $state['firstPlayer'] = $order[0];
        $state['turn'] = $order[0];
        $state['turnsPlayed'] = 0;
        $state['playersAtDeal'] = count($order);
        $state['locked'] = [];
        $state['pendingFinal'] = false;
        $state['final'] = false;
        $state['toPlay'] = [];
        $state['skipStreak'] = 0;
        // Bij een nieuwe ronde is van niemand iets bekend.
        $state['known'] = [];
        $state['knownAt'] = [];
        foreach ($order as $seat) {
            $state['known'][$seat] = [null, null, null];
            $state['knownAt'][$seat] = [0, 0, 0];
        }

        return $this->beginTurn($state, $rng, $events);
    }

    /** @param list<string> $pot */
    private function isDirty(array $pot, string $mode): bool
    {
        $ranks = array_map(static fn (string $card): string => $card[1], $pot);
        if ($mode === 'classic') {
            sort($ranks);

            return $ranks === ['7', '8', '9'];
        }
        if ($mode === 'broad') {
            return array_diff($ranks, ['7', '8', '9']) === [];
        }

        return false;
    }

    /** @return list<string> */
    private function deck(): array
    {
        $deck = [];
        foreach (self::SUITS as $suit) {
            foreach (self::RANKS as $rank) {
                $deck[] = $suit . $rank;
            }
        }

        return $deck;
    }

    private function value(string $card): int
    {
        return match ($card[1]) {
            'A' => 11,
            'T', 'J', 'Q', 'K' => 10,
            default => (int) $card[1],
        };
    }

    /** @return list<array{seat: int, lives: int}> */
    private function livesList(array $state): array
    {
        return array_map(
            static fn (int $seat): array => ['seat' => $seat, 'lives' => $state['lives'][$seat]],
            $state['seats'],
        );
    }
}
