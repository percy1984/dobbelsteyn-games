-- Een speler telt als "weg" als zijn heartbeat (de poll) te lang uitblijft. De vlag staat in de
-- database zodat een wijziging (weg/terug) als gewone lobbywijziging de versie ophoogt en de
-- andere spelers hem via polling zien.
ALTER TABLE seats ADD COLUMN is_away TINYINT(1) NOT NULL DEFAULT 0 AFTER is_promoted;
