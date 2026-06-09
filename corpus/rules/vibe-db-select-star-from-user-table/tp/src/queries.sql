-- TP fixture: SELECT * against user-data tables.

SELECT * FROM users WHERE id = 1;
SELECT * FROM profiles;
SELECT * FROM public.accounts;
SELECT u.*, posts.id FROM users u JOIN posts ON posts.user_id = u.id;
