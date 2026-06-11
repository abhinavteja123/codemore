// True-positive fixture for core-security-sql-injection-concat
// String-concat + template-literal interpolation feeding a DB exec call.

declare const db: { query: (sql: string) => Promise<unknown> };

export async function findUser(id: string) {
  // 1. Concatenated string into db.query — classic SQLi.
  return db.query("SELECT * FROM users WHERE id = '" + id + "'");
}

export async function findUserTpl(id: string) {
  // 2. Template literal with ${} interpolation into db.query.
  return db.query(`SELECT * FROM users WHERE id = '${id}'`);
}
