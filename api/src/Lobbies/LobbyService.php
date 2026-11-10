<?php

declare(strict_types=1);

namespace Dg\Lobbies;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Input;
use PDO;
use Throwable;

/** Bedrijfslogica rond lobby's: aanmaken, joinen, verlaten en het overzicht per speler. */
final class LobbyService
{
    /** Na zoveel seconden zonder heartbeat telt een speler als weg (instelbaar). */
    public const AWAY_AFTER_SECONDS = 15;
    /** Een heartbeat wordt hooguit zo vaak naar de database geschreven; polling blijft zo goedkoop. */
    private const HEARTBEAT_WRITE_SECONDS = 5;

    private readonly CodeGenerator $codes;

    public function __construct(
        private readonly PDO $pdo,
        private readonly GameRegistry $games,
        ?Rng $rng = null,
        private readonly int $awayAfterSeconds = self::AWAY_AFTER_SECONDS,
    ) {
        $this->codes = new CodeGenerator($rng ?? new Rng());
    }

    /**
     * Maakt een lobby; de maker krijgt plaats 0 en is creator.
     *
     * @return array{token: string, seatNo: int, lobby: array<string, mixed>}
     */
    public function create(string $game, mixed $name, bool $private, mixed $pin): array
    {
        if (!$this->games->has($game)) {
            throw new ApiException(404, 'Onbekende game.', 'unknown_game');
        }
        $definition = $this->games->get($game);
        $name = Input::name($name);
        $pin = $private ? (is_string($pin) && trim($pin) !== '' ? Input::pin($pin) : $this->codes->pin()) : null;

        return $this->transaction(function () use ($definition, $game, $name, $private, $pin): array {
            $code = $this->uniqueCode();
            $this->pdo->prepare(
                'INSERT INTO lobbies (code, game, is_private, pin, min_players, max_players, settings)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $code,
                $game,
                $private ? 1 : 0,
                $pin,
                $definition->minPlayers(),
                $definition->maxPlayers(),
                json_encode($definition->normalizeSettings([]), JSON_THROW_ON_ERROR),
            ]);
            $lobbyId = (int) $this->pdo->lastInsertId();

            $token = $this->insertSeat($lobbyId, 0, $name, creator: true);

            return ['token' => $token, 'seatNo' => 0, 'lobby' => $this->viewFor($code, $token)];
        });
    }

    /**
     * Neemt een plaats in een lobby die nog niet gestart is.
     *
     * @return array{token: string, seatNo: int, lobby: array<string, mixed>}
     */
    public function join(string $code, mixed $name, mixed $pin): array
    {
        $code = Input::code($code);
        $name = Input::name($name);

        return $this->transaction(function () use ($code, $name, $pin): array {
            $lobby = $this->load($code, lock: true);

            if ($lobby['status'] !== 'waiting') {
                throw new ApiException(409, 'Het spel is al gestart; je kunt niet meer meedoen.', 'game_started');
            }
            if ((int) $lobby['is_private'] === 1) {
                $given = is_string($pin) ? strtoupper(trim($pin)) : '';
                if (!hash_equals((string) $lobby['pin'], $given)) {
                    throw new ApiException(403, 'Onjuiste PIN.', 'bad_pin');
                }
            }

            $seats = $this->seats((int) $lobby['id']);
            foreach ($seats as $seat) {
                if (mb_strtolower($seat['name']) === mb_strtolower($name)) {
                    throw new ApiException(409, 'Deze naam is al in gebruik in deze lobby.', 'name_taken');
                }
            }
            $free = $this->freeSeatNo($seats, (int) $lobby['max_players']);
            if ($free === null) {
                throw new ApiException(409, 'De lobby is vol.', 'lobby_full');
            }

            $token = $this->insertSeat((int) $lobby['id'], $free, $name);
            $this->touch((int) $lobby['id']);

            return ['token' => $token, 'seatNo' => $free, 'lobby' => $this->viewFor($code, $token)];
        });
    }

    /** Verlaat de lobby vrijwillig; kan alleen voordat het spel start. */
    public function leave(string $code, ?string $token): void
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token): void {
            $lobby = $this->load($code, lock: true);
            $me = $this->seatForToken((int) $lobby['id'], $token);
            if ($me === null) {
                throw new ApiException(403, 'Je zit niet in deze lobby.', 'not_in_lobby');
            }
            if ($lobby['status'] !== 'waiting') {
                throw new ApiException(409, 'Je kunt de lobby niet meer verlaten nadat het spel gestart is.', 'cannot_leave');
            }

            $this->pdo->prepare('DELETE FROM seats WHERE id = ?')->execute([$me['id']]);

            $humans = array_values(array_filter(
                $this->seats((int) $lobby['id']),
                static fn (array $seat): bool => $seat['kind'] === 'human',
            ));
            if ($humans === []) {
                // Alleen bots (of niemand) over: de lobby heeft geen zin meer.
                $this->pdo->prepare('DELETE FROM lobbies WHERE id = ?')->execute([$lobby['id']]);

                return;
            }
            if ((int) $me['is_creator'] === 1) {
                // De creator kan niet "leeg" blijven: de eerste mens in de rij erft de rol.
                $this->pdo->prepare('UPDATE seats SET is_creator = 1 WHERE id = ?')->execute([$humans[0]['id']]);
            }
            $this->touch((int) $lobby['id']);
        });
    }

    /**
     * Poll van een speler: telt als heartbeat, zet vertrokken spelers op "weg" en geeft de nieuwe
     * staat. Is de versie sinds `$since` niet veranderd, dan volgt een piepklein antwoord.
     *
     * @return array<string, mixed>
     */
    public function poll(string $code, ?string $token, ?int $since): array
    {
        $code = Input::code($code);
        $lobby = $this->load($code);
        $lobbyId = (int) $lobby['id'];
        $me = $this->seatForToken($lobbyId, $token);

        $changed = false;
        if ($me !== null) {
            $changed = $this->heartbeat($me);
        }
        if (in_array($lobby['status'], ['waiting', 'countdown', 'playing'], true)) {
            $changed = $this->markAbsentPlayers($lobbyId) || $changed;
        }
        if ($changed) {
            $this->touchVersionOnly($lobbyId);
        }

        $version = (int) $this->pdo->query('SELECT version FROM lobbies WHERE id = ' . $lobbyId)->fetchColumn();
        if ($since !== null && $since === $version) {
            return ['changed' => false, 'version' => $version];
        }

        return $this->viewFor($code, $token);
    }

    /**
     * Het overzicht van een lobby. Met een geldig plaats-token krijgt de speler het volledige
     * overzicht; zonder token alleen wat nodig is om te kunnen joinen.
     *
     * @return array<string, mixed>
     */
    public function viewFor(string $code, ?string $token): array
    {
        $code = Input::code($code);
        $lobby = $this->load($code);
        $seats = $this->seats((int) $lobby['id']);
        $me = $this->seatForToken((int) $lobby['id'], $token);

        $view = [
            'code' => $lobby['code'],
            'game' => $lobby['game'],
            'status' => $lobby['status'],
            'isPrivate' => (int) $lobby['is_private'] === 1,
            'minPlayers' => (int) $lobby['min_players'],
            'maxPlayers' => (int) $lobby['max_players'],
            'version' => (int) $lobby['version'],
            'seats' => array_map(fn (array $seat): array => $this->seatView($seat), $seats),
            'me' => null,
        ];

        if ($me !== null) {
            $isCreator = (int) $me['is_creator'] === 1;
            $isPromoted = (int) $me['is_promoted'] === 1;
            $definition = $this->games->get($lobby['game']);

            $view['me'] = [
                'seatNo' => (int) $me['seat_no'],
                'isCreator' => $isCreator,
                'isPromoted' => $isPromoted,
                'canManage' => $isCreator || $isPromoted,
            ];
            $view['settings'] = json_decode((string) $lobby['settings'], true, 512, JSON_THROW_ON_ERROR);
            $view['settingsSchema'] = $definition->settingsSchema();
            // Spelers in de lobby mogen de PIN zien: ze delen hem via de QR-code.
            $view['pin'] = (int) $lobby['is_private'] === 1 ? $lobby['pin'] : null;
        }

        return $view;
    }

    /** @return array<string, mixed> */
    private function seatView(array $seat): array
    {
        return [
            'seatNo' => (int) $seat['seat_no'],
            'kind' => $seat['kind'],
            'name' => $seat['name'],
            'isCreator' => (int) $seat['is_creator'] === 1,
            'isPromoted' => (int) $seat['is_promoted'] === 1,
            'botLevel' => $seat['bot_level'] === null ? null : (int) $seat['bot_level'],
            'isAway' => (int) $seat['is_away'] === 1,
        ];
    }

    /** @return array<string, mixed> */
    private function load(string $code, bool $lock = false): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM lobbies WHERE code = ?' . ($lock ? ' FOR UPDATE' : ''));
        $stmt->execute([$code]);
        $lobby = $stmt->fetch();
        if ($lobby === false) {
            throw new ApiException(404, 'Deze lobby bestaat niet (meer).', 'lobby_not_found');
        }

        return $lobby;
    }

    /** @return list<array<string, mixed>> */
    private function seats(int $lobbyId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM seats WHERE lobby_id = ? ORDER BY seat_no');
        $stmt->execute([$lobbyId]);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    private function seatForToken(int $lobbyId, ?string $token): ?array
    {
        if ($token === null || $token === '') {
            return null;
        }
        $stmt = $this->pdo->prepare('SELECT * FROM seats WHERE lobby_id = ? AND token_hash = ?');
        $stmt->execute([$lobbyId, hash('sha256', $token)]);

        return $stmt->fetch() ?: null;
    }

    /** @param list<array<string, mixed>> $seats */
    private function freeSeatNo(array $seats, int $max): ?int
    {
        $used = array_map(static fn (array $seat): int => (int) $seat['seat_no'], $seats);
        for ($no = 0; $no < $max; $no++) {
            if (!in_array($no, $used, true)) {
                return $no;
            }
        }

        return null;
    }

    /** Maakt een mensenplaats en geeft het geheime token terug (alleen de hash wordt bewaard). */
    private function insertSeat(int $lobbyId, int $seatNo, string $name, bool $creator = false): string
    {
        $token = bin2hex(random_bytes(16));
        $this->pdo->prepare(
            'INSERT INTO seats (lobby_id, seat_no, kind, name, token_hash, is_creator, last_seen_at)
             VALUES (?, ?, \'human\', ?, ?, ?, NOW(3))'
        )->execute([$lobbyId, $seatNo, $name, hash('sha256', $token), $creator ? 1 : 0]);

        return $token;
    }

    private function uniqueCode(): string
    {
        $exists = $this->pdo->prepare('SELECT 1 FROM lobbies WHERE code = ?');
        for ($attempt = 0; $attempt < 20; $attempt++) {
            // Eerst 4 letters; zijn die vaak bezet, dan 5.
            $code = $this->codes->code($attempt < 10 ? 4 : 5);
            $exists->execute([$code]);
            if ($exists->fetchColumn() === false) {
                return $code;
            }
        }

        throw new ApiException(503, 'Er is nu geen vrije lobbycode. Probeer het zo opnieuw.', 'no_code');
    }

    /**
     * Verwerkt de heartbeat van een speler. Geeft true als de speler terug is van "weg" (dat is een
     * zichtbare wijziging voor de anderen).
     *
     * @param array<string, mixed> $seat
     */
    private function heartbeat(array $seat): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE seats SET last_seen_at = NOW(3), is_away = 0
             WHERE id = ? AND (is_away = 1 OR last_seen_at IS NULL
                OR last_seen_at < NOW(3) - INTERVAL ' . self::HEARTBEAT_WRITE_SECONDS . ' SECOND)'
        );
        $stmt->execute([$seat['id']]);

        return (int) $seat['is_away'] === 1 && $stmt->rowCount() > 0;
    }

    /** Zet mensen zonder recente heartbeat op "weg". Geeft true als er iemand bijkwam. */
    private function markAbsentPlayers(int $lobbyId): bool
    {
        $stmt = $this->pdo->prepare(
            "UPDATE seats SET is_away = 1
             WHERE lobby_id = ? AND kind = 'human' AND is_away = 0
               AND last_seen_at < NOW(3) - INTERVAL {$this->awayAfterSeconds} SECOND"
        );
        $stmt->execute([$lobbyId]);

        return $stmt->rowCount() > 0;
    }

    /** Hoogt de versie op zonder het te tellen als spelersactiviteit (dat is een poll niet). */
    private function touchVersionOnly(int $lobbyId): void
    {
        $this->pdo->prepare('UPDATE lobbies SET version = version + 1 WHERE id = ?')->execute([$lobbyId]);
    }

    /** Verhoogt de versie (polling ziet de wijziging) en markeert activiteit. */
    private function touch(int $lobbyId): void
    {
        $this->pdo->prepare('UPDATE lobbies SET version = version + 1, last_activity_at = NOW(3) WHERE id = ?')
            ->execute([$lobbyId]);
    }

    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    private function transaction(callable $fn): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $fn();
            $this->pdo->commit();

            return $result;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
