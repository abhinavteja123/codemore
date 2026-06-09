-- FP fixture: forms the rule must NOT fire on.

-- Explicit column list — safe.
SELECT id, email, display_name FROM users WHERE id = $1;

-- Non-user table — safe (not in the curated list).
SELECT * FROM posts;
SELECT * FROM analytics_events;

-- COUNT(*) is fine — no row payload.
SELECT count(*) FROM users;

-- EXISTS(SELECT *) is fine — used as a predicate, no row payload.
SELECT id FROM posts WHERE EXISTS (SELECT * FROM users WHERE users.id = posts.author_id);
