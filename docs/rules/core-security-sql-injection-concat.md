<!-- codemore-ignore-file: core-security-sql-injection-concat -->
# core-security-sql-injection-concat

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | beta | 0.85 |

**Pack:** `core-security`

## What it catches

The classical SQL-injection pattern: a query string built by concatenating or interpolating user input directly into a database execution API. Detects patterns like:

- `db.query("SELECT * FROM users WHERE id = " + req.body.id)`
- `db.query("SELECT * FROM users WHERE id = ${userId}")`
- `cursor.execute("SELECT * FROM users WHERE id = " + user_id)`
- `cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")`
- `cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)`

## Why it matters

SQL injection remains OWASP A03 (Injection) — the #3 most critical vulnerability class. When a user-controlled value is concatenated or interpolated into a query string, an attacker can inject SQL keywords and operators to rewrite the query. AI-generated code exhibits this pattern at a high baseline rate. The fix is always parameterised queries: every database driver supports placeholder syntax (`?` / `$1` / `%s`) that binds values out-of-band.

## Example — flagged

```ts
// Node.js + Express
app.get('/user/:id', async (req, res) => {
  // BLOCKER: user id concatenated into the query.
  const result = await db.query("SELECT * FROM users WHERE id = '" + req.params.id + "'");
  res.json(result);
});
```

```ts
// Template literal interpolation is also vulnerable.
app.get('/user/:id', async (req, res) => {
  // BLOCKER: user id interpolated into query template.
  const result = await db.query(`SELECT * FROM users WHERE id = '${req.params.id}'`);
  res.json(result);
});
```

```py
# Python
@app.route('/user/<user_id>')
def get_user(user_id):
    # BLOCKER: string format concatenation into execute.
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
    return cursor.fetchone()
```

## Example — not flagged

```ts
// Parameterised query — values are bound out-of-band.
app.get('/user/:id', async (req, res) => {
  // OK: placeholder with separate parameter array.
  const result = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  res.json(result);
});
```

```py
# Python with placeholders.
@app.route('/user/<user_id>')
def get_user(user_id):
    # OK: %s placeholder, value passed separately.
    cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    return cursor.fetchone()
```

## Suggested fix

Replace every concatenated query with a parameterised equivalent. All mainstream database drivers support this:

**Node.js (mysql2):**

```ts
const result = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

**Node.js (postgres):**

```ts
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

**Python (sqlite3, psycopg, asyncpg):**

```py
cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))
```

**If you must build queries dynamically** (e.g., variable column list):

1. Validate the dynamic part (column name) against a hardcoded allowlist.
2. Build the query with the allowlisted value.
3. Always use placeholders for any user-supplied data.

```ts
const ALLOWED_COLS = new Set(['name', 'email', 'created_at']);
if (!ALLOWED_COLS.has(sortBy)) {
  throw new Error('invalid sort column');
}
const result = await db.query(
  `SELECT * FROM users WHERE id = ? ORDER BY ${sortBy}`,
  [userId]
);
```

## Suppression

```ts
// Reason: query is hardcoded, never contains user input.
// codemore-ignore-next-line: core-security-sql-injection-concat
const result = await db.query("SELECT * FROM users WHERE status = 'active'");
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [CWE-89: Improper Neutralization of Special Elements used in an SQL Command](https://cwe.mitre.org/data/definitions/89.html)
- [NIST — SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

## Implementation

Regex scan for database call sites (`db.query`, `cursor.execute`, etc.) and checks whether the first argument uses string concatenation (`+`), template literal interpolation (`${...}`), or printf-style formatting (`%s`). Each match is flagged as a potential injection point.

Source: [`shared/packs/core-security/core-security-sql-injection-concat.ts`](../../shared/packs/core-security/core-security-sql-injection-concat.ts)
Fixtures: [`corpus/rules/core-security-sql-injection-concat/`](../../corpus/rules/core-security-sql-injection-concat/)
