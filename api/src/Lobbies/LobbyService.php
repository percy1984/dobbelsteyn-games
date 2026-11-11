<?php

declare(strict_types=1);

namespace Dg\Lobbies;

use Dg\ApiException;
use Dg\Games\GameRegistry;
use Dg\Games\Rng;
use Dg\Input;
use Dg\Limits;
use Dg\RateLimiter;
use InvalidArgumentException;
use PDO;
use Throwable;

/** Bedrijfslogica rond lobby's: aanmaken, joinen, verlaten en het overzicht per speler. */
final class LobbyService
{
    /** Na zoveel seconden zonder heartbeat telt een speler als weg (instelbaar). */
    public const AWAY_AFTER_SECONDS = 15;
    /** Een heartbeat wordt hooguit zo vaak naar de database geschreven; polling blijft zo goedkoop. */
    private const HEARTBEAT_WRITE_SECONDS = 5;

    /** Zoveel chatberichten krijgt een speler mee in het overzicht. */
    private const CHAT_HISTORY = 50;

    /** Zo lang duurt de aftelling (3-2-1) voordat het spel echt begint. */
    public const COUNTDOWN_SECONDS = 3;

    private readonly CodeGenerator $codes;
    private readonly GameRunner $runner;
    private readonly RateLimiter $limiter;

    public function __construct(
        private readonly PDO $pdo,
        private readonly GameRegistry $games,
        ?Rng $rng = null,
        private readonly int $awayAfterSeconds = self::AWAY_AFTER_SECONDS,
        private readonly Limits $limits = new Limits(),
    ) {
        $this->limiter = new RateLimiter($pdo);
        $rng ??= new Rng();
        $this->codes = new CodeGenerator($rng);
        $this->runner = new GameRunner($pdo, $games, $rng);
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
            if ((int) $this->pdo->query('SELECT COUNT(*) FROM lobbies')->fetchColumn() >= $this->limits->maxLobbies) {
                throw new ApiException(503, 'De server is druk. Probeer het over een paar minuten opnieuw.', 'server_busy');
            }

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
    public function join(string $code, mixed $name, mixed $pin, string $client = ''): array
    {
        $code = Input::code($code);
        $name = Input::name($name);

        $wrongPinLobbyId = null;
        try {
            return $this->transaction(function () use ($code, $name, $pin, $client, &$wrongPinLobbyId): array {
                return $this->doJoin($code, $name, $pin, $client, $wrongPinLobbyId);
            });
        } catch (ApiException $e) {
            // De transactie is teruggedraaid; de mislukte poging moet toch blijven staan.
            if ($wrongPinLobbyId !== null) {
                $this->limiter->record("pin:$wrongPinLobbyId:$client", $this->limits->pinWindowSeconds);
                $this->limiter->record("pin:$wrongPinLobbyId", $this->limits->pinWindowSeconds);
            }
            throw $e;
        }
    }

    /**
     * @return array{token: string, seatNo: int, lobby: array<string, mixed>}
     */
    private function doJoin(string $code, string $name, mixed $pin, string $client, ?int &$wrongPinLobbyId): array
    {
        $lobby = $this->load($code, lock: true);

        if ($lobby['status'] !== 'waiting') {
            throw new ApiException(409, 'Het spel is al gestart; je kunt niet meer meedoen.', 'game_started');
        }
        if ((int) $lobby['is_private'] === 1) {
            // Het raden van een PIN remmen we af: per lobby én per client een grens op foute pogingen.
            $this->limiter->assertBelow("pin:{$lobby['id']}:$client", $this->limits->pinFailuresPerClient, $this->limits->pinWindowSeconds);
            $this->limiter->assertBelow("pin:{$lobby['id']}", $this->limits->pinFailuresPerLobby, $this->limits->pinWindowSeconds);

            $given = is_string($pin) ? strtoupper(trim($pin)) : '';
            if (!hash_equals((string) $lobby['pin'], $given)) {
                $wrongPinLobbyId = (int) $lobby['id'];
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
            if (!in_array($lobby['status'], ['waiting', 'finished', 'ended'], true)) {
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
     * Alle lobby's van een game die nog lopen (afgelopen spellen niet), nieuwste eerst. Openbare en
     * privélobby's staan er allebei in; privé is herkenbaar aan `isPrivate` en vraagt een PIN.
     *
     * @return list<array<string, mixed>>
     */
    public function listForGame(string $game): array
    {
        if (!$this->games->has($game)) {
            throw new ApiException(404, 'Onbekende game.', 'unknown_game');
        }

        $stmt = $this->pdo->prepare(
            "SELECT l.code, l.status, l.is_private, l.max_players,
                    (SELECT COUNT(*) FROM seats s WHERE s.lobby_id = l.id) AS players,
                    (SELECT s.name FROM seats s WHERE s.lobby_id = l.id AND s.is_creator = 1 LIMIT 1) AS host
             FROM lobbies l
             WHERE l.game = ? AND l.status IN ('waiting', 'countdown', 'playing')
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT 50"
        );
        $stmt->execute([$game]);

        return array_map(static fn (array $row): array => [
            'code' => $row['code'],
            'status' => $row['status'],
            'isPrivate' => (int) $row['is_private'] === 1,
            'host' => $row['host'],
            'playerCount' => (int) $row['players'],
            'maxPlayers' => (int) $row['max_players'],
            'joinable' => $row['status'] === 'waiting' && (int) $row['players'] < (int) $row['max_players'],
        ], $stmt->fetchAll());
    }

    /**
     * Wijzigt de spelinstellingen. Mag de maker en een gepromoveerde speler, tot het spel start.
     *
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public function updateSettings(string $code, ?string $token, array $settings): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token, $settings): void {
            $lobby = $this->load($code, lock: true);
            $me = $this->requireManager($lobby, $token);
            if ($lobby['status'] !== 'waiting') {
                throw new ApiException(409, 'De instellingen kunnen niet meer gewijzigd worden.', 'cannot_change');
            }

            try {
                $normalized = $this->games->get($lobby['game'])->normalizeSettings($settings);
            } catch (InvalidArgumentException) {
                throw new ApiException(422, 'Ongeldige instelling.', 'bad_settings');
            }

            $this->pdo->prepare('UPDATE lobbies SET settings = ? WHERE id = ?')
                ->execute([json_encode($normalized, JSON_THROW_ON_ERROR), $lobby['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Promoveert een speler (die dan ook instellingen mag wijzigen) of haalt dat weer weg. Alleen de
     * maker doet dit; de maker zelf kan niet gedegradeerd worden en bots kunnen niet gepromoveerd worden.
     *
     * @return array<string, mixed>
     */
    public function setPromoted(string $code, ?string $token, int $seatNo, bool $promoted): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token, $seatNo, $promoted): void {
            $lobby = $this->load($code, lock: true);
            $me = $this->seatForToken((int) $lobby['id'], $token);
            if ($me === null) {
                throw new ApiException(403, 'Je zit niet in deze lobby.', 'not_in_lobby');
            }
            if ((int) $me['is_creator'] !== 1) {
                throw new ApiException(403, 'Alleen de maker kan spelers promoveren.', 'not_creator');
            }

            $target = null;
            foreach ($this->seats((int) $lobby['id']) as $seat) {
                if ((int) $seat['seat_no'] === $seatNo) {
                    $target = $seat;
                }
            }
            if ($target === null) {
                throw new ApiException(404, 'Deze plaats bestaat niet.', 'seat_not_found');
            }
            if ($target['kind'] !== 'human' || (int) $target['is_creator'] === 1) {
                throw new ApiException(409, 'Alleen andere spelers kunnen gepromoveerd worden.', 'cannot_promote');
            }

            $this->pdo->prepare('UPDATE seats SET is_promoted = ? WHERE id = ?')->execute([$promoted ? 1 : 0, $target['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Geeft de plaats van de speler terug als die de lobby mag beheren (maker of gepromoveerd).
     *
     * @param array<string, mixed> $lobby
     * @return array<string, mixed>
     */
    private function requireManager(array $lobby, ?string $token): array
    {
        $me = $this->seatForToken((int) $lobby['id'], $token);
        if ($me === null) {
            throw new ApiException(403, 'Je zit niet in deze lobby.', 'not_in_lobby');
        }

        // Wie een verzoek doet, is er per definitie: zijn `weg`-vlag mag niet in de weg zitten.
        if ((int) $me['is_away'] === 1) {
            $this->pdo->prepare('UPDATE seats SET is_away = 0, last_seen_at = NOW(3) WHERE id = ?')->execute([$me['id']]);
            $me['is_away'] = 0;
        }

        if (!in_array((int) $me['id'], $this->managerSeatIds($this->seats((int) $lobby['id'])), true)) {
            throw new ApiException(403, 'Alleen de maker of een gepromoveerde speler mag dit.', 'not_allowed');
        }

        return $me;
    }

    /**
     * Plaatsen (id's) die de lobby nu mogen beheren. Normaal zijn dat de maker en gepromoveerde
     * spelers. Is niemand van hen aanwezig (alle beheerders zijn weg), dan krijgt de eerste aanwezige
     * speler in de rij het beheer, zodat een weggevallen spel altijd door iemand beslist kan worden.
     *
     * @param list<array<string, mixed>> $seats
     * @return list<int>
     */
    private function managerSeatIds(array $seats): array
    {
        $present = static fn (array $seat): bool => $seat['kind'] === 'human' && (int) $seat['is_away'] === 0;

        $managers = array_values(array_filter(
            $seats,
            static fn (array $seat): bool => $present($seat) && ((int) $seat['is_creator'] === 1 || (int) $seat['is_promoted'] === 1),
        ));
        if ($managers !== []) {
            return array_map(static fn (array $seat): int => (int) $seat['id'], $managers);
        }

        foreach ($seats as $seat) {
            if ($present($seat)) {
                return [(int) $seat['id']];
            }
        }

        return [];
    }

    /**
     * Zet een bot op de eerste vrije plaats. Alleen de maker of een beheerder, alleen vóór de start.
     * Niveau 1 (zwak) tot en met 10 (sterk): de invulling per niveau hoort bij de game.
     *
     * @return array<string, mixed>
     */
    public function addBot(string $code, ?string $token, mixed $level): array
    {
        $code = Input::code($code);
        $level = $this->botLevel($level);

        $this->transaction(function () use ($code, $token, $level): void {
            $lobby = $this->loadForBotChange($code, $token);
            $seats = $this->seats((int) $lobby['id']);

            $free = $this->freeSeatNo($seats, (int) $lobby['max_players']);
            if ($free === null) {
                throw new ApiException(409, 'De lobby is vol.', 'lobby_full');
            }

            $used = array_column($seats, 'name');
            $number = 1;
            while (in_array('Bot ' . $number, $used, true)) {
                $number++;
            }

            $this->pdo->prepare(
                "INSERT INTO seats (lobby_id, seat_no, kind, name, bot_level) VALUES (?, ?, 'bot', ?, ?)"
            )->execute([$lobby['id'], $free, 'Bot ' . $number, $level]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Wijzigt het niveau van een bot.
     *
     * @return array<string, mixed>
     */
    public function setBotLevel(string $code, ?string $token, int $seatNo, mixed $level): array
    {
        $code = Input::code($code);
        $level = $this->botLevel($level);

        $this->transaction(function () use ($code, $token, $seatNo, $level): void {
            $lobby = $this->loadForBotChange($code, $token);
            $bot = $this->botSeat((int) $lobby['id'], $seatNo);

            $this->pdo->prepare('UPDATE seats SET bot_level = ? WHERE id = ?')->execute([$level, $bot['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Haalt een bot weg; de plaats komt weer vrij.
     *
     * @return array<string, mixed>
     */
    public function removeBot(string $code, ?string $token, int $seatNo): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token, $seatNo): void {
            $lobby = $this->loadForBotChange($code, $token);
            $bot = $this->botSeat((int) $lobby['id'], $seatNo);

            $this->pdo->prepare('DELETE FROM seats WHERE id = ?')->execute([$bot['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Laadt en vergrendelt de lobby voor een wijziging aan bots: de speler moet beheerder zijn en het
     * spel mag nog niet gestart zijn.
     *
     * @return array<string, mixed>
     */
    private function loadForBotChange(string $code, ?string $token): array
    {
        $lobby = $this->load($code, lock: true);
        $this->requireManager($lobby, $token);
        if ($lobby['status'] !== 'waiting') {
            throw new ApiException(409, 'De plaatsen kunnen niet meer gewijzigd worden.', 'cannot_change');
        }

        return $lobby;
    }

    /** @return array<string, mixed> */
    private function botSeat(int $lobbyId, int $seatNo): array
    {
        foreach ($this->seats($lobbyId) as $seat) {
            if ((int) $seat['seat_no'] === $seatNo) {
                if ($seat['kind'] !== 'bot') {
                    throw new ApiException(409, 'Dit is geen bot.', 'not_a_bot');
                }

                return $seat;
            }
        }

        throw new ApiException(404, 'Deze plaats bestaat niet.', 'seat_not_found');
    }

    private function botLevel(mixed $level): int
    {
        if (!is_int($level) || $level < 1 || $level > 10) {
            throw new ApiException(422, 'Kies een niveau van 1 tot en met 10.', 'bad_level');
        }

        return $level;
    }

    /**
     * Start de aftelling (3-2-1). Alleen de maker of een beheerder, en pas als er genoeg spelers zijn
     * (mensen en bots tellen mee). Na de aftelling begint het spel vanzelf (zie `advance`).
     *
     * @return array<string, mixed>
     */
    public function start(string $code, ?string $token): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token): void {
            $lobby = $this->load($code, lock: true);
            $this->requireManager($lobby, $token);
            if ($lobby['status'] !== 'waiting') {
                throw new ApiException(409, 'Het spel is al gestart.', 'cannot_change');
            }
            if (count($this->seats((int) $lobby['id'])) < (int) $lobby['min_players']) {
                throw new ApiException(409, 'Er zijn nog niet genoeg spelers om te starten.', 'not_enough_players');
            }
            if (!$this->allReady($this->seats((int) $lobby['id']))) {
                throw new ApiException(409, 'Niet iedereen is ready.', 'not_ready');
            }

            $this->pdo->prepare(
                "UPDATE lobbies SET status = 'countdown', ready_check = 0, countdown_ends_at = NOW(3) + INTERVAL " . self::COUNTDOWN_SECONDS . ' SECOND WHERE id = ?'
            )->execute([$lobby['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Zet het spel in gang als de aftelling voorbij is. Wordt aangeroepen door polls; het is veilig
     * om het vaker aan te roepen (de eerste doet het werk, de rest ziet dat het al gebeurd is).
     */
    public function advance(string $code): void
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code): void {
            $lobby = $this->load($code, lock: true);
            if ($lobby['status'] !== 'countdown' || (int) $lobby['countdown_due'] !== 1) {
                return;
            }

            $this->runner->begin($lobby, $this->seats((int) $lobby['id']));
        });
    }

    /**
     * Een zet van een speler. De game valideert hem; bots spelen daarna op de server.
     *
     * @param array<string, mixed> $move
     * @return array<string, mixed>
     */
    public function move(string $code, ?string $token, array $move): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token, $move): void {
            $lobby = $this->load($code, lock: true);
            $me = $this->seatForToken((int) $lobby['id'], $token);
            if ($me === null) {
                throw new ApiException(403, 'Je zit niet in deze lobby.', 'not_in_lobby');
            }

            $this->runner->move($lobby, $this->seats((int) $lobby['id']), (int) $me['seat_no'], $move);
            $this->pdo->prepare('UPDATE seats SET last_seen_at = NOW(3), is_away = 0 WHERE id = ?')->execute([$me['id']]);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Na afloop: dezelfde spelers nog een keer. Zet de lobby terug naar wachten; alleen de maker of
     * een beheerder.
     *
     * @return array<string, mixed>
     */
    public function rematch(string $code, ?string $token): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token): void {
            $lobby = $this->load($code, lock: true);
            $this->requireManager($lobby, $token);
            if (!in_array($lobby['status'], ['finished', 'ended'], true)) {
                throw new ApiException(409, 'Het spel is nog niet afgelopen.', 'not_finished');
            }

            $this->pdo->prepare('DELETE FROM game_states WHERE lobby_id = ?')->execute([$lobby['id']]);
            $this->pdo->prepare("UPDATE lobbies SET status = 'waiting', ready_check = 0, countdown_ends_at = NULL WHERE id = ?")->execute([$lobby['id']]);
            $this->pdo->prepare('UPDATE seats SET is_ready = 0 WHERE lobby_id = ?')->execute([$lobby['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Vervangt een speler die weg is door een bot. De bot neemt de plaats en de hand over; het
     * niveau kiest degene die vervangt. Alleen een beheerder (zie `managerSeatIds`) en alleen voor een
     * speler die nu echt weg is: de eerste actie wint, een tweede beheerder krijgt een nette melding.
     *
     * @return array<string, mixed>
     */
    public function replaceWithBot(string $code, ?string $token, int $seatNo, mixed $level): array
    {
        $code = Input::code($code);
        $level = $this->botLevel($level);

        $this->transaction(function () use ($code, $token, $seatNo, $level): void {
            $lobby = $this->load($code, lock: true);
            $this->requireManager($lobby, $token);
            if (!in_array($lobby['status'], ['waiting', 'countdown', 'playing'], true)) {
                throw new ApiException(409, 'Er is geen spel meer om iemand in te vervangen.', 'cannot_change');
            }

            $seats = $this->seats((int) $lobby['id']);
            $target = null;
            foreach ($seats as $seat) {
                if ((int) $seat['seat_no'] === $seatNo) {
                    $target = $seat;
                }
            }
            if ($target === null) {
                throw new ApiException(404, 'Deze plaats bestaat niet.', 'seat_not_found');
            }
            if ($target['kind'] !== 'human' || (int) $target['is_away'] !== 1) {
                throw new ApiException(409, 'Deze speler is niet (meer) weg.', 'not_away');
            }

            // Token weg: de oude telefoon heeft geen toegang meer. De naam blijft herkenbaar.
            $this->pdo->prepare(
                "UPDATE seats SET kind = 'bot', bot_level = ?, name = ?, token_hash = NULL,
                        is_creator = 0, is_promoted = 0, is_away = 0, last_seen_at = NULL
                 WHERE id = ?"
            )->execute([$level, mb_substr($target['name'], 0, 20) . ' (bot)', $target['id']]);

            if ((int) $target['is_creator'] === 1) {
                // De maker-rol gaat naar de eerste mens in de rij; die is er zeker (de beheerder zelf).
                foreach ($this->seats((int) $lobby['id']) as $seat) {
                    if ($seat['kind'] === 'human') {
                        $this->pdo->prepare('UPDATE seats SET is_creator = 1 WHERE id = ?')->execute([$seat['id']]);
                        break;
                    }
                }
            }

            $this->runner->resume($lobby, $this->seats((int) $lobby['id']));
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Beëindigt een lopend spel (of een aftelling), bijvoorbeeld als een speler niet meer terugkomt.
     * Alleen een beheerder. Daarna kan de maker met een rematch opnieuw beginnen.
     *
     * @return array<string, mixed>
     */
    public function endGame(string $code, ?string $token): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token): void {
            $lobby = $this->load($code, lock: true);
            $this->requireManager($lobby, $token);
            if (!in_array($lobby['status'], ['countdown', 'playing'], true)) {
                throw new ApiException(409, 'Er is geen spel bezig.', 'not_playing');
            }

            $this->pdo->prepare("UPDATE lobbies SET status = 'ended', countdown_ends_at = NULL WHERE id = ?")->execute([$lobby['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * Stuurt een chatbericht. Alleen spelers in de lobby; het bericht blijft bewaard zolang de lobby
     * bestaat en is voor iedereen in de lobby zichtbaar. Lengte en tekens worden beperkt.
     *
     * @return array<string, mixed>
     */
    public function sendChat(string $code, ?string $token, mixed $body): array
    {
        $code = Input::code($code);
        $body = Input::text($body, Input::CHAT_MAX);

        $this->transaction(function () use ($code, $token, $body): void {
            $lobby = $this->load($code, lock: true);
            $me = $this->seatForToken((int) $lobby['id'], $token);
            if ($me === null) {
                throw new ApiException(403, 'Je zit niet in deze lobby.', 'not_in_lobby');
            }

            $this->limiter->hit("chat:{$me['id']}", $this->limits->chatMessages, $this->limits->chatWindowSeconds);

            $this->pdo->prepare('INSERT INTO chat_messages (lobby_id, seat_id, name, body) VALUES (?, ?, ?, ?)')
                ->execute([$lobby['id'], $me['id'], $me['name'], $body]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * De laatste berichten van een lobby, oudste eerst.
     *
     * @return list<array<string, mixed>>
     */
    private function chatMessages(int $lobbyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.id, s.seat_no, c.name, c.body, UNIX_TIMESTAMP(c.created_at) AS ts
             FROM chat_messages c LEFT JOIN seats s ON s.id = c.seat_id
             WHERE c.lobby_id = ? ORDER BY c.id DESC LIMIT ' . self::CHAT_HISTORY
        );
        $stmt->execute([$lobbyId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'seatNo' => $row['seat_no'] === null ? null : (int) $row['seat_no'],
            'name' => $row['name'],
            'body' => $row['body'],
            'at' => (int) $row['ts'],
        ], array_reverse($stmt->fetchAll()));
    }

    /**
     * Een speler meldt zich ready of weer niet-ready. Kan zolang we in de wachtkamer zijn; ook de
     * beheerder doet mee.
     *
     * @return array<string, mixed>
     */
    public function setReady(string $code, ?string $token, bool $ready): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token, $ready): void {
            $lobby = $this->load($code, lock: true);
            $me = $this->seatForToken((int) $lobby['id'], $token);
            if ($me === null) {
                throw new ApiException(403, 'Je zit niet in deze lobby.', 'not_in_lobby');
            }
            if ($lobby['status'] !== 'waiting') {
                throw new ApiException(409, 'Het spel is al gestart.', 'cannot_change');
            }

            $this->pdo->prepare('UPDATE seats SET is_ready = ? WHERE id = ?')->execute([$ready ? 1 : 0, $me['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * De beheerder vraagt iedereen om ready te zijn: alle spelers krijgen een overzicht te zien en wie
     * nog niet ready is, kan zich daar ready melden. Heeft geen zin als iedereen al ready is.
     *
     * @return array<string, mixed>
     */
    public function startReadyCheck(string $code, ?string $token): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token): void {
            $lobby = $this->load($code, lock: true);
            $this->requireManager($lobby, $token);
            if ($lobby['status'] !== 'waiting') {
                throw new ApiException(409, 'Het spel is al gestart.', 'cannot_change');
            }
            $seats = $this->seats((int) $lobby['id']);
            if ($this->allReady($seats)) {
                throw new ApiException(409, 'Iedereen is al ready: je kunt gewoon starten.', 'all_ready');
            }

            $this->pdo->prepare('UPDATE lobbies SET ready_check = 1 WHERE id = ?')->execute([$lobby['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
    }

    /**
     * De beheerder stopt de ready-check zonder te starten.
     *
     * @return array<string, mixed>
     */
    public function cancelReadyCheck(string $code, ?string $token): array
    {
        $code = Input::code($code);

        $this->transaction(function () use ($code, $token): void {
            $lobby = $this->load($code, lock: true);
            $this->requireManager($lobby, $token);

            $this->pdo->prepare('UPDATE lobbies SET ready_check = 0 WHERE id = ?')->execute([$lobby['id']]);
            $this->touch((int) $lobby['id']);
        });

        return $this->viewFor($code, $token);
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
        if ($lobby['status'] === 'countdown' && (int) $lobby['countdown_due'] === 1) {
            $this->advance($code);
            $lobby = $this->load($code);
        }
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
            // Resterende milliseconden van de aftelling op het moment van dit antwoord.
            'countdownMs' => $lobby['status'] === 'countdown' ? (int) $lobby['countdown_ms'] : null,
            'allReady' => $this->allReady($seats),
            // Alleen "actief" zolang er nog mensen niet ready zijn en we nog wachten.
            'readyCheck' => (int) $lobby['ready_check'] === 1 && $lobby['status'] === 'waiting' && !$this->allReady($seats),
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
                'canManage' => in_array((int) $me['id'], $this->managerSeatIds($seats), true),
            ];
            $view['settings'] = json_decode((string) $lobby['settings'], true, 512, JSON_THROW_ON_ERROR);
            $view['settingsSchema'] = $definition->settingsSchema();
            // Spelers in de lobby mogen de PIN zien: ze delen hem via de QR-code.
            $view['pin'] = (int) $lobby['is_private'] === 1 ? $lobby['pin'] : null;
            $view['chat'] = $this->chatMessages((int) $lobby['id']);
            // Alleen de eigen kijk op het spel: verborgen informatie van anderen lekt nooit.
            $view += $this->runner->viewFor($lobby, (int) $me['seat_no']) ?? [];
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
            'isReady' => $seat['kind'] === 'bot' || (int) $seat['is_ready'] === 1,
        ];
    }

    /** @return array<string, mixed> */
    private function load(string $code, bool $lock = false): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT l.*,
                    (l.countdown_ends_at IS NOT NULL AND l.countdown_ends_at <= NOW(3)) AS countdown_due,
                    GREATEST(0, TIMESTAMPDIFF(MICROSECOND, NOW(3), l.countdown_ends_at) DIV 1000) AS countdown_ms
             FROM lobbies l WHERE l.code = ?' . ($lock ? ' FOR UPDATE' : '')
        );
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

        // Is iedereen ready (of is de laatste niet-ready speler weg), dan is de ready-check klaar.
        $this->pdo->prepare(
            "UPDATE lobbies SET ready_check = 0
             WHERE id = ? AND ready_check = 1
               AND NOT EXISTS (SELECT 1 FROM seats WHERE lobby_id = ? AND kind = 'human' AND is_ready = 0)"
        )->execute([$lobbyId, $lobbyId]);
    }

    /**
     * Is elke mens ready? Bots tellen altijd mee.
     *
     * @param list<array<string, mixed>> $seats
     */
    private function allReady(array $seats): bool
    {
        foreach ($seats as $seat) {
            if ($seat['kind'] === 'human' && (int) $seat['is_ready'] !== 1) {
                return false;
            }
        }

        return true;
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
