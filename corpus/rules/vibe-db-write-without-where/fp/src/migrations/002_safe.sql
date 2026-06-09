-- False-positive fixture: all statements have WHERE or are not destructive.
-- Rule must NOT fire.

UPDATE accounts SET archived = true WHERE id = $1;

DELETE FROM sessions WHERE expires_at < NOW();

-- TRUNCATE is deliberately not flagged (explicit intent).
TRUNCATE TABLE staging;

-- Reads aren't flagged.
SELECT id, email FROM users;

-- Comment containing UPDATE users SET x must not fire.
-- UPDATE users SET email = 'x@x.com';
