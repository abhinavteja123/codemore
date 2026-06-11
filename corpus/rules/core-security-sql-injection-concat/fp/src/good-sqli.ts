// False-positive fixture for core-security-sql-injection-concat
// All queries below are parameterised — the rule must NOT fire.

declare const db: { query: (sql: string, params?: unknown[]) => Promise<unknown> };

export async function findUserParam(id: string) {
  return db.query("SELECT * FROM users WHERE id = ?", [id]);
}

export async function findUserNamed(id: string) {
  return db.query("SELECT * FROM users WHERE id = $1", [id]);
}

// Comment that mentions concat must not trigger:
// We used to do db.query("..." + id) here but switched to placeholders.
