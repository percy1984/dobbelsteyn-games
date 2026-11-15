-- Een bot die een weggevallen speler vervangt, houdt de plek voor die speler vast: het token (hash) en
-- de naam van de mens blijven bewaard. Komt de speler terug met hetzelfde token, dan neemt hij zijn
-- plek weer over van de bot. NULL bij gewone bots en bij mensen.
ALTER TABLE seats
    ADD COLUMN stand_in_token_hash CHAR(64) NULL AFTER token_hash,
    ADD COLUMN stand_in_name VARCHAR(30) NULL AFTER stand_in_token_hash;
