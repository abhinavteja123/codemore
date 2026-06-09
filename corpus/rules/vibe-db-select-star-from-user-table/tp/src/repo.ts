// TP fixture: inline SQL via .query / sql`...` against user tables.
import postgres from 'postgres';
const sql = postgres('postgres://localhost/x');

export async function fetchAllUsers() {
  return await sql`SELECT * FROM users`;            // ← flag
}

export async function fetchSession(db: { query: (q: string) => Promise<unknown> }) {
  return await db.query('SELECT * FROM sessions WHERE id = $1');  // ← flag
}
