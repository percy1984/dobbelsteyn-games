-- Eenvoudige tellers voor rate limiting (vaste tijdvensters). De sleutel bevat wat we begrenzen,
-- bijvoorbeeld "create:<hash van ip>" of "chat:<plaats-id>". Oude rijen worden door het opruimen verwijderd.
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       VARCHAR(100) NOT NULL,
    hits         INT UNSIGNED NOT NULL DEFAULT 0,
    window_start DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (bucket),
    KEY ix_rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
