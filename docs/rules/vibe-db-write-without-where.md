# vibe-db-write-without-where

**Pack:** `core-security`
**Default severity:** BLOCKER
**Languages:** SQL, TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.9

## What it catches

`UPDATE …` or `DELETE FROM …` statements with **no `WHERE` clause** — the statement that touches every row in the table.

Scanned surfaces:
- `.sql` files: the whole file.
- TS/JS: only SQL passed to known raw-query methods (`.query(...)`, `.execute(...)`, `.unsafe(...)`, `.raw(...)`) or tagged with the `sql\`…\`` template tag (postgres-js, drizzle, kysely).

Arbitrary string literals are deliberately NOT scanned — too noisy.

## Why this matters for vibe-coded apps

This is the highest-impact statically-detectable database bug. AI agents cheerfully generate "clean" SQL examples like `DELETE FROM users` and developers paste them into migrations or repos. One run, one table gone. BLOCKER severity is deliberate; if the rule fires you must look.

## Example — flagged

```sql
-- migrations/001_init.sql
DELETE FROM users;                       -- ← whole table
UPDATE accounts SET archived = true;     -- ← every account flipped
```

```ts
await sql`DELETE FROM users`;                              // ← flagged
await db.query('UPDATE accounts SET archived = true');     // ← flagged
```

## Example — not flagged

```sql
UPDATE accounts SET archived = true WHERE id = $1;
DELETE FROM sessions WHERE expires_at < NOW();
TRUNCATE TABLE staging;                  -- explicit intent
SELECT id, email FROM users;             -- reads aren't flagged
```

```ts
await sql`UPDATE accounts SET archived = true WHERE id = ${id}`;
export const docs = 'Run UPDATE users SET email = NULL when you need to clear emails.';
// (Arbitrary string literal — not passed to a known raw-query method.)
```

## Suggested fix

Add a `WHERE` clause that scopes to the intended subset. If the operation IS table-wide on purpose (e.g. a maintenance script), prefer `TRUNCATE TABLE foo` — that's both explicit and exempted from this rule.

```sql
-- wrong
DELETE FROM users;

-- right
DELETE FROM users WHERE id = $1;
```

## Suppressing

```sql
-- Reason: maintenance script intentionally wipes the staging table.
-- codemore-ignore-next-line: vibe-db-write-without-where
DELETE FROM staging_table;
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Regex-based, with SQL comments stripped first (positions preserved so the file-level line/column lookup stays right). Splits SQL into statements by `;`. For each segment lacking `WHERE`, checks two simple regexes (`UPDATE <ident> SET` / `DELETE FROM <ident>`) and reports the file offset.

In TS/JS, the AST is walked for `sql\`…\`` tagged templates and for `CallExpression`s where the method name is one of `query` / `execute` / `unsafe` / `raw`. SQL inside template substitutions is joined as a string for matching but parameter holes are erased; the statement structure (UPDATE / DELETE / WHERE) is matched on the literal parts.

Coverage gap:
- `WHERE 1=1` / `WHERE TRUE` defeats the rule today (no tautology check).
- Multi-statement strings built across files are not flagged.

Source: [`shared/packs/core-security/vibe-db-write-without-where.ts`](../../shared/packs/core-security/vibe-db-write-without-where.ts)
Fixtures: [`corpus/rules/vibe-db-write-without-where/`](../../corpus/rules/vibe-db-write-without-where/)
