-- Ready-check: elke mens moet zich ready melden voordat het spel gestart kan worden (bots tellen altijd mee).
ALTER TABLE seats ADD COLUMN is_ready TINYINT(1) NOT NULL DEFAULT 0 AFTER is_away;
