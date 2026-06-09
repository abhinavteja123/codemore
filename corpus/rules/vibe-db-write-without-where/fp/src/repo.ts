// FP fixture: inline SQL that DOES include WHERE, and patterns that
// shouldn't be scanned at all (arbitrary string literals).

import postgres from 'postgres';
const sql = postgres('postgres://localhost/x');

export async function archive(id: number): Promise<void> {
  await sql`UPDATE accounts SET archived = true WHERE id = ${id}`;
}

export async function expire(db: { query: (q: string, p?: unknown[]) => Promise<void> }): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
}

// Arbitrary string literal that LOOKS like SQL but is not passed to a
// known raw-query method — we deliberately don't scan these.
export const docs = 'Run UPDATE users SET email = NULL when you need to clear emails.';
