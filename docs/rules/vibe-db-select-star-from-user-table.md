# vibe-db-select-star-from-user-table

**Pack:** `core-security`
**Default severity:** MAJOR
**Languages:** SQL, TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.8

## What it catches

`SELECT *` / `SELECT alias.*` against a table likely to hold sensitive user data:

`users`, `profiles`, `accounts`, `customers`, `sessions`, `orders`, `memberships`, `subscriptions`, `billing`, `payments`, `identities`, `user_profiles`, `user_accounts`.

Scanned surfaces:
- `.sql` files (whole file).
- TS/JS: `sql\`…\`` tagged templates AND SQL passed to `.query` / `.execute` / `.unsafe` / `.raw`.

`SELECT count(*)` and `EXISTS(SELECT *)` are deliberately exempt — they don't return row payloads.

## Why this matters for vibe-coded apps

Two bugs in one:

1. **Today**: the handler hauls every column. Even if the JSON response drops sensitive fields, those bytes are in worker memory the whole time.
2. **Tomorrow**: when the schema grows (`stripe_id`, `refresh_token`, `last_ip`), the handler quietly starts returning them too.

AI agents reach for `SELECT *` reflexively. Listing the columns makes schema growth fail loudly.

## Example — flagged

```sql
SELECT * FROM users WHERE id = 1;
SELECT u.*, posts.id FROM users u JOIN posts ON ...;
```

```ts
await sql`SELECT * FROM users`;
await db.query('SELECT * FROM sessions WHERE id = $1');
```

## Example — not flagged

```sql
SELECT id, email, display_name FROM users WHERE id = $1;   -- explicit columns
SELECT * FROM posts;                                       -- not a user table
SELECT count(*) FROM users;                                -- count, no rows
SELECT id FROM posts WHERE EXISTS (SELECT * FROM users);   -- predicate use
```

## Suggested fix

List the columns the handler actually uses. When the schema grows you'll get a clean compile/runtime failure if a new column is required.

## Suppressing

```sql
-- Reason: admin-only export; intentionally returns every column.
-- codemore-ignore-next-line: vibe-db-select-star-from-user-table
SELECT * FROM users;
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Regex over SQL content (with comments stripped, positions preserved). The matcher captures the table name from the first `FROM <ident>` and compares against a curated lowercase set. Schema prefixes (`public.users`) and surrounding double-quotes are stripped before lookup. `COUNT(*)` and `EXISTS(SELECT *)` are filtered out before reporting.

For TS/JS, the AST is walked for `sql\`…\`` tagged templates and `.query`/`.execute`/`.unsafe`/`.raw` arguments. Template substitution holes are erased but surrounding literal text is matched.

Source: [`shared/packs/core-security/vibe-db-select-star-from-user-table.ts`](../../shared/packs/core-security/vibe-db-select-star-from-user-table.ts)
Fixtures: [`corpus/rules/vibe-db-select-star-from-user-table/`](../../corpus/rules/vibe-db-select-star-from-user-table/)
