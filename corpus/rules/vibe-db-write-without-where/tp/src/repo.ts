// True-positive fixture: inline raw SQL via .query and sql`...` tagged
// templates. Both must fire.

import postgres from 'postgres';
const sql = postgres('postgres://localhost/x');

export async function nukeUsers(): Promise<void> {
  await sql`DELETE FROM users`;                          // ← flag
}

export async function archiveAll(db: { query: (q: string) => Promise<void> }): Promise<void> {
  await db.query('UPDATE accounts SET archived = true'); // ← flag
}
