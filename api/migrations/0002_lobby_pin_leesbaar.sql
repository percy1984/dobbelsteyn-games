-- De PIN van een privélobby moet leesbaar blijven: spelers in de lobby delen hem via de QR-code
-- (de link bevat de PIN). Het is een korte spelcode, geen wachtwoord; hij wordt alleen getoond
-- aan spelers die in de lobby zitten.
ALTER TABLE lobbies CHANGE pin_hash pin VARCHAR(8) NULL;
