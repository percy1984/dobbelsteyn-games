<?php

declare(strict_types=1);

namespace Dg\Lobbies;

use Closure;
use Dg\ApiException;
use Dg\Games\EventedGame;
use Dg\Games\Game;
use Dg\Games\GameStep;
use Dg\Games\GameRegistry;
use Dg\Games\InvalidMove;
use Dg\Games\Rng;
use PDO;

/**
 * Draait het spel zelf: beginstaat maken, zetten valideren en uitvoeren, bots laten spelen en het
 * einde vaststellen. De volledige staat blijft op de server; spelers krijgen alleen hun eigen `view`.
 * Wordt aangeroepen binnen een transactie waarin de lobby al vergrendeld is.
 */
final class GameRunner
{
    /** Veiligheidsgrens: een bot-reeks stopt hier, zodat een fout in een game nooit eindeloos loopt. */
    private const MAX_BOT_MOVES = 500;

    /** Zoveel gebeurtenissen gaan er hooguit mee in de lobbyview; oudere heeft de client niet meer nodig. */
    private const EVENTS_IN_VIEW = 100;

    /** Zoveel gebeurtenissen bewaren we per lobby; oudere worden opgeruimd. */
    private const EVENTS_KEPT = 500;

    /** @var Closure(): int servertijd in milliseconden */
    private readonly Closure $clock;

    public function __construct(
        private readonly PDO $pdo,
        private readonly GameRegistry $games,
        private readonly Rng $rng,
        ?Closure $clock = null,
    ) {
        $this->clock = $clock ?? static fn (): int => (int) floor(microtime(true) * 1000);
    }

    /**
     * Start het spel: maakt de beginstaat, zet de lobby op `playing` en laat bots die als eerste
     * aan de beurt zijn meteen spelen.
     *
     * @param array<string, mixed> $lobby
     * @param list<array<string, mixed>> $seats
     */
    public function begin(array $lobby, array $seats): void
    {
        $game = $this->games->get($lobby['game']);
        $seatNos = array_map(static fn (array $seat): int => (int) $seat['seat_no'], $seats);
        sort($seatNos);

        $settings = json_decode((string) $lobby['settings'], true, 512, JSON_THROW_ON_ERROR);
        $step = $this->startStep($game, $seatNos, $game->normalizeSettings($settings));
        $state = $step->state;

        $this->pdo->prepare('DELETE FROM game_states WHERE lobby_id = ?')->execute([$lobby['id']]);
        // Een nieuwe wedstrijd begint met een lege zetlog.
        $this->pdo->prepare('DELETE FROM game_events WHERE lobby_id = ?')->execute([$lobby['id']]);
        $this->pdo->prepare('INSERT INTO game_states (lobby_id, state, turn_no) VALUES (?, ?, 0)')
            ->execute([$lobby['id'], json_encode($state, JSON_THROW_ON_ERROR)]);
        $this->pdo->prepare("UPDATE lobbies SET status = 'playing', countdown_ends_at = NULL WHERE id = ?")
            ->execute([$lobby['id']]);

        $this->continueAfterChange($lobby, $seats, $game, $state, 0, $step->events);
    }

    /**
     * Laat bots doorspelen zonder zelf een zet te doen. Nodig als een weggevallen speler door een bot
     * vervangen is die nu aan de beurt is.
     *
     * @param array<string, mixed> $lobby
     * @param list<array<string, mixed>> $seats
     */
    public function resume(array $lobby, array $seats): void
    {
        if ($lobby['status'] !== 'playing') {
            return;
        }

        $game = $this->games->get($lobby['game']);
        [$state, $turnNo] = $this->loadState((int) $lobby['id']);

        $this->continueAfterChange($lobby, $seats, $game, $state, $turnNo);
    }

    /**
     * Voert de zet van een speler uit (na validatie door de game) en laat daarna de bots spelen.
     *
     * @param array<string, mixed> $lobby
     * @param list<array<string, mixed>> $seats
     * @param array<string, mixed> $move
     */
    public function move(array $lobby, array $seats, int $seatNo, array $move): void
    {
        if ($lobby['status'] !== 'playing') {
            throw new ApiException(409, 'Er is geen spel bezig.', 'not_playing');
        }

        $game = $this->games->get($lobby['game']);
        [$state, $turnNo] = $this->loadState((int) $lobby['id']);

        // Een vrije zet (alleen bij EventedGame) hoeft niet aan de beurt te zijn; de game valideert zelf.
        $free = $game instanceof EventedGame && $game->isFreeMove($state, $move);
        if (!$free && !in_array($seatNo, $game->activeSeats($state), true)) {
            throw new ApiException(409, 'Je bent nu niet aan de beurt.', 'not_your_turn');
        }

        try {
            $step = $this->applyStep($game, $state, $seatNo, $move);
        } catch (InvalidMove $e) {
            throw new ApiException(422, $e->getMessage(), 'invalid_move');
        }

        $this->continueAfterChange($lobby, $seats, $game, $step->state, $turnNo + 1, $step->events);
    }

    /**
     * Wat een speler van het lopende of afgelopen spel mag zien.
     *
     * @param array<string, mixed> $lobby
     * @return array{gameView: array<string, mixed>, activeSeats: list<int>, result: array{winners: list<int>}|null, turnNo: int, events: list<array<string, mixed>>}|null
     */
    public function viewFor(array $lobby, int $seatNo): ?array
    {
        if (!in_array($lobby['status'], ['playing', 'finished'], true)) {
            return null;
        }

        $game = $this->games->get($lobby['game']);
        [$state, $turnNo] = $this->loadState((int) $lobby['id']);

        return [
            'gameView' => $game->view($state, $seatNo),
            'activeSeats' => $game->activeSeats($state),
            'result' => $game->outcome($state),
            'turnNo' => $turnNo,
            // De zetlog: publieke gebeurtenissen met volgnummer seq, oplopend. Leeg bij games zonder zetlog.
            'events' => $this->recentEvents((int) $lobby['id']),
        ];
    }

    /**
     * Slaat de nieuwe staat op, laat bots spelen en stelt vast of het spel afgelopen is.
     *
     * @param array<string, mixed> $lobby
     * @param list<array<string, mixed>> $seats
     * @param array<string, mixed> $state
     * @param list<array<string, mixed>> $events gebeurtenissen die bij deze wijziging horen
     */
    private function continueAfterChange(array $lobby, array $seats, Game $game, array $state, int $turnNo, array $events = []): void
    {
        $bots = [];
        foreach ($seats as $seat) {
            if ($seat['kind'] === 'bot') {
                $bots[(int) $seat['seat_no']] = (int) $seat['bot_level'];
            }
        }

        for ($i = 0; $i < self::MAX_BOT_MOVES && $game->outcome($state) === null; $i++) {
            $botSeats = array_values(array_filter($game->activeSeats($state), static fn (int $seatNo): bool => isset($bots[$seatNo])));
            if ($botSeats === []) {
                break;
            }
            foreach ($botSeats as $seatNo) {
                if ($game->outcome($state) !== null) {
                    break;
                }
                $step = $this->applyStep($game, $state, $seatNo, $game->botMove($state, $seatNo, $bots[$seatNo], $this->rng));
                $state = $step->state;
                array_push($events, ...$step->events);
                $turnNo++;
            }
        }

        $this->pdo->prepare('UPDATE game_states SET state = ?, turn_no = ? WHERE lobby_id = ?')
            ->execute([json_encode($state, JSON_THROW_ON_ERROR), $turnNo, $lobby['id']]);
        $this->recordEvents((int) $lobby['id'], $events);

        $finished = $game->outcome($state) !== null;
        $this->pdo->prepare(
            "UPDATE lobbies SET status = ?, version = version + 1, last_activity_at = NOW(3) WHERE id = ?"
        )->execute([$finished ? 'finished' : 'playing', $lobby['id']]);
    }

    /**
     * @param list<int> $seatNos
     * @param array<string, mixed> $settings
     */
    private function startStep(Game $game, array $seatNos, array $settings): GameStep
    {
        if ($game instanceof EventedGame) {
            return $game->startStep($seatNos, $settings, $this->rng, ($this->clock)());
        }

        return new GameStep($game->start($seatNos, $settings, $this->rng));
    }

    /**
     * @param array<string, mixed> $state
     * @param array<string, mixed> $move
     */
    private function applyStep(Game $game, array $state, int $seatNo, array $move): GameStep
    {
        if ($game instanceof EventedGame) {
            return $game->applyStep($state, $seatNo, $move, $this->rng, ($this->clock)());
        }

        return new GameStep($game->apply($state, $seatNo, $move, $this->rng));
    }

    /**
     * Voegt gebeurtenissen toe aan de zetlog met oplopende volgnummers en ruimt oude op. De lobby is
     * vergrendeld (zie de klasse), dus MAX(seq) + 1 is veilig.
     *
     * @param list<array<string, mixed>> $events
     */
    private function recordEvents(int $lobbyId, array $events): void
    {
        if ($events === []) {
            return;
        }

        $stmt = $this->pdo->prepare('SELECT COALESCE(MAX(seq), 0) FROM game_events WHERE lobby_id = ?');
        $stmt->execute([$lobbyId]);
        $seq = (int) $stmt->fetchColumn();

        $insert = $this->pdo->prepare('INSERT INTO game_events (lobby_id, seq, event) VALUES (?, ?, ?)');
        foreach ($events as $event) {
            $insert->execute([$lobbyId, ++$seq, json_encode($event, JSON_THROW_ON_ERROR)]);
        }

        $this->pdo->prepare('DELETE FROM game_events WHERE lobby_id = ? AND seq <= ?')
            ->execute([$lobbyId, $seq - self::EVENTS_KEPT]);
    }

    /** @return list<array<string, mixed>> de laatste gebeurtenissen, oplopend, elk met seq */
    private function recentEvents(int $lobbyId): array
    {
        $stmt = $this->pdo->prepare('SELECT seq, event FROM game_events WHERE lobby_id = ? ORDER BY seq DESC LIMIT ' . self::EVENTS_IN_VIEW);
        $stmt->execute([$lobbyId]);

        $events = [];
        foreach (array_reverse($stmt->fetchAll()) as $row) {
            $event = json_decode((string) $row['event'], true, 512, JSON_THROW_ON_ERROR);
            $events[] = ['seq' => (int) $row['seq']] + $event;
        }

        return $events;
    }

    /** @return array{0: array<string, mixed>, 1: int} */
    private function loadState(int $lobbyId): array
    {
        $stmt = $this->pdo->prepare('SELECT state, turn_no FROM game_states WHERE lobby_id = ?');
        $stmt->execute([$lobbyId]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new ApiException(409, 'Er is geen spel bezig.', 'not_playing');
        }

        return [json_decode((string) $row['state'], true, 512, JSON_THROW_ON_ERROR), (int) $row['turn_no']];
    }
}
