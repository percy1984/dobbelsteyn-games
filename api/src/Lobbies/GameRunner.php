<?php

declare(strict_types=1);

namespace Dg\Lobbies;

use Dg\ApiException;
use Dg\Games\Game;
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

    public function __construct(
        private readonly PDO $pdo,
        private readonly GameRegistry $games,
        private readonly Rng $rng,
    ) {
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
        $state = $game->start($seatNos, $game->normalizeSettings($settings), $this->rng);

        $this->pdo->prepare('DELETE FROM game_states WHERE lobby_id = ?')->execute([$lobby['id']]);
        $this->pdo->prepare('INSERT INTO game_states (lobby_id, state, turn_no) VALUES (?, ?, 0)')
            ->execute([$lobby['id'], json_encode($state, JSON_THROW_ON_ERROR)]);
        $this->pdo->prepare("UPDATE lobbies SET status = 'playing', countdown_ends_at = NULL WHERE id = ?")
            ->execute([$lobby['id']]);

        $this->continueAfterChange($lobby, $seats, $game, $state, 0);
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

        if (!in_array($seatNo, $game->activeSeats($state), true)) {
            throw new ApiException(409, 'Je bent nu niet aan de beurt.', 'not_your_turn');
        }

        try {
            $state = $game->apply($state, $seatNo, $move, $this->rng);
        } catch (InvalidMove $e) {
            throw new ApiException(422, $e->getMessage(), 'invalid_move');
        }

        $this->continueAfterChange($lobby, $seats, $game, $state, $turnNo + 1);
    }

    /**
     * Wat een speler van het lopende of afgelopen spel mag zien.
     *
     * @param array<string, mixed> $lobby
     * @return array{gameView: array<string, mixed>, activeSeats: list<int>, result: array{winners: list<int>}|null, turnNo: int}|null
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
        ];
    }

    /**
     * Slaat de nieuwe staat op, laat bots spelen en stelt vast of het spel afgelopen is.
     *
     * @param array<string, mixed> $lobby
     * @param list<array<string, mixed>> $seats
     * @param array<string, mixed> $state
     */
    private function continueAfterChange(array $lobby, array $seats, Game $game, array $state, int $turnNo): void
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
                $state = $game->apply($state, $seatNo, $game->botMove($state, $seatNo, $bots[$seatNo], $this->rng), $this->rng);
                $turnNo++;
            }
        }

        $this->pdo->prepare('UPDATE game_states SET state = ?, turn_no = ? WHERE lobby_id = ?')
            ->execute([json_encode($state, JSON_THROW_ON_ERROR), $turnNo, $lobby['id']]);

        $finished = $game->outcome($state) !== null;
        $this->pdo->prepare(
            "UPDATE lobbies SET status = ?, version = version + 1, last_activity_at = NOW(3) WHERE id = ?"
        )->execute([$finished ? 'finished' : 'playing', $lobby['id']]);
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
