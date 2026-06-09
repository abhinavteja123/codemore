-- True-positive fixture: raw SQL with statements missing WHERE.
-- The rule must flag both statements below.

DELETE FROM users;

UPDATE accounts SET archived = true;

-- A safe statement to confirm we don't flag everything.
UPDATE accounts SET archived = true WHERE id = 42;
