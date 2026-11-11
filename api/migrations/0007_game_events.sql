-- Migraties moeten opnieuw uitvoerbaar zijn (IF NOT EXISTS): een run die halverwege stopt, wordt
-- niet als uitgevoerd geregistreerd en draait bij de volgende aanroep opnieuw.
--
-- Zetlog per wedstrijd: publieke gebeurtenissen van games die `EventedGame` implementeren.
-- Het volgnummer (seq) loopt per lobby op vanaf 1; clients onthouden het laatst afgespeelde nummer.
-- Hier staat nooit verborgen informatie in (dichte kaarten van anderen, de stok).

CREATE TABLE IF NOT EXISTS game_events (
    lobby_id   INT UNSIGNED NOT NULL,
    seq        INT UNSIGNED NOT NULL,
    event      JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (lobby_id, seq),
    CONSTRAINT fk_game_events_lobby FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
