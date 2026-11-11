-- Staat aan zolang de beheerder een ready-check heeft gedaan en nog niet iedereen ready is.
ALTER TABLE lobbies ADD COLUMN ready_check TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
