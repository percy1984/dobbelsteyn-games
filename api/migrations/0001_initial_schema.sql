-- Migraties moeten opnieuw uitvoerbaar zijn (IF NOT EXISTS): een run die halverwege stopt, wordt
-- niet als uitgevoerd geregistreerd en draait bij de volgende aanroep opnieuw.
--
-- Eerste schema voor het games-platform: lobby's, plaatsen, chat en spelstaat.
-- Bewust portable gehouden (MySQL 8 en MariaDB): geen 0900-collations, geen exotische functies.
-- De server is gezaghebbend: de volledige spelstaat staat hier, per speler gefilterde views
-- worden in PHP berekend (zie de spec: verborgen informatie per speler).

CREATE TABLE IF NOT EXISTS lobbies (
    id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- 4 of 5 ondubbelzinnige hoofdletters; vergelijken is hoofdletterongevoelig door de collation.
    code              VARCHAR(5) NOT NULL,
    game              VARCHAR(40) NOT NULL,
    is_private        TINYINT(1) NOT NULL DEFAULT 0,
    -- Hash van de 4-tekens PIN (password_hash); NULL bij publieke lobby's.
    pin_hash          VARCHAR(255) NULL,
    status            ENUM('waiting', 'countdown', 'playing', 'finished', 'ended') NOT NULL DEFAULT 'waiting',
    min_players       TINYINT UNSIGNED NOT NULL,
    max_players       TINYINT UNSIGNED NOT NULL,
    -- Spelinstellingen die de creator of een gepromoveerde speler wijzigt.
    settings          JSON NOT NULL,
    -- Wordt bij elke wijziging (lobby, plaatsen, chat, spelstaat) opgehoogd; polling vergelijkt hiermee.
    version           INT UNSIGNED NOT NULL DEFAULT 1,
    countdown_ends_at DATETIME(3) NULL,
    created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_activity_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_lobbies_code (code),
    KEY ix_lobbies_game_status (game, status),
    KEY ix_lobbies_last_activity (last_activity_at),
    CONSTRAINT ck_lobbies_players CHECK (min_players >= 1 AND max_players >= min_players)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seats (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    lobby_id     INT UNSIGNED NOT NULL,
    seat_no      TINYINT UNSIGNED NOT NULL,
    kind         ENUM('human', 'bot') NOT NULL,
    name         VARCHAR(30) NOT NULL,
    -- Moeilijkheid 1-10; alleen voor bots.
    bot_level    TINYINT UNSIGNED NULL,
    -- SHA-256 (hex) van het geheime plaats-token dat de browser bewaart; NULL bij bots.
    token_hash   CHAR(64) NULL,
    is_creator   TINYINT(1) NOT NULL DEFAULT 0,
    is_promoted  TINYINT(1) NOT NULL DEFAULT 0,
    -- Laatste teken van leven (heartbeat); 'weg' wordt hieruit afgeleid.
    last_seen_at DATETIME(3) NULL,
    joined_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_seats_lobby_seat (lobby_id, seat_no),
    UNIQUE KEY uq_seats_token (token_hash),
    CONSTRAINT fk_seats_lobby FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    CONSTRAINT ck_seats_bot_level CHECK (bot_level IS NULL OR bot_level BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lobby_id   INT UNSIGNED NOT NULL,
    -- NULL als de plaats later verdwijnt; de naam blijft dan zichtbaar bij het bericht.
    seat_id    INT UNSIGNED NULL,
    name       VARCHAR(30) NOT NULL,
    body       VARCHAR(500) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_chat_lobby_id (lobby_id, id),
    CONSTRAINT fk_chat_lobby FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_seat FOREIGN KEY (seat_id) REFERENCES seats (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_states (
    lobby_id   INT UNSIGNED NOT NULL,
    -- Volledige, gezaghebbende staat (inclusief verborgen informatie); nooit rechtstreeks naar de browser.
    state      JSON NOT NULL,
    turn_no    INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (lobby_id),
    CONSTRAINT fk_game_states_lobby FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
