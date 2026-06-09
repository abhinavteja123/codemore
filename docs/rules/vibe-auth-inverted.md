# vibe-auth-inverted

**Pack:** `vibe-auth`
**Default severity:** BLOCKER
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.7

## What it catches

CVE-2025-48757 class. A route handler whose **anonymous branch returns MORE data than its authenticated branch**:

```ts
export async function GET() {
  const session = await auth();
  if (!session) {
    return Response.json(await db.from('users').select());   // anon → every user
  }
  return Response.json({ user: session.user });              // authed → just self
}
```

Usually the leaky anon branch is placeholder code ("this is what we return while auth is incomplete") that never got replaced.

## Why this matters for vibe-coded apps

Showed up in **~24% of audited vibe-coded apps**. Full data exfiltration to anonymous callers — the worst kind of access-control bug because the developer thinks the auth check is doing the opposite of what it actually does.

## Example — flagged

```ts
// app/api/users/route.ts
export async function GET() {
  const session = await auth();
  if (!session) {
    const { data } = await supabase.from('users').select();
    return NextResponse.json(data);                       // ← flag
  }
  return NextResponse.json({ user: session.user });
}
```

## Example — not flagged

```ts
export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });
  return NextResponse.json({ user: session.user });
}
```

The rule only fires when ALL of:

- The file is in `projectIndex.routeFiles` (we don't fire on arbitrary utilities).
- The file references an auth helper (so the developer intended an auth gate).
- An `if (!X)` where `X` is `session` / `user` / `auth` / `userId` / `currentUser` / similar.
- The THEN-branch contains a **user-data read**: SQL `SELECT/UPDATE/DELETE FROM <user-table>`, Supabase `.from('<user-table>')`, or Prisma `.user/.profile/.account/.session/.order/.subscription` chain feeding a `.findMany/.findFirst/.findUnique/.findAll/.find/.select/.all` method.
- The REST of the function body does NOT contain the same user-data read (i.e. both branches don't leak — that's `vibe-auth-missing-session-check`'s territory).

## Suggested fix

Invert the gate so the anon branch returns a narrower response and the user-data query lives inside the authenticated branch, scoped to `session.user.id`:

```ts
if (!session) return new Response('Unauthorized', { status: 401 });
const { data } = await supabase
  .from('users')
  .select()
  .eq('id', session.user.id)
  .single();
return Response.json(data);
```

If the anon branch is genuinely supposed to return public data (e.g. a public leaderboard query against a `user-stats` table that holds only aggregate metrics), suppress with a Reason comment that lists exactly which columns are public.

## Suppressing

```ts
// Reason: public leaderboard — `user-stats` is a denormalised aggregate
// table with no PII columns (only display_name + rank + score).
// codemore-ignore-next-line: vibe-auth-inverted
if (!session) {
  return NextResponse.json(await supabase.from('user-stats').select());
}
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST-based. Visits every `IfStatement` whose condition is `!X` (and `X` is one of the auth-negatable names, or a chain ending in one). The THEN-branch is recursively scanned for user-data reads (SQL regex + Supabase `.from('users')` + Prisma `.<userTable>.find*` chains). When the THEN-branch has a read AND the rest of the enclosing function body doesn't, the rule emits a finding pointing at the `if`.

Coverage gap:

- The "more data" comparison is heuristic. False positives are possible when the anon branch genuinely should read user data.
- Only direct `if (!X)` is detected. The dual `if (X) { narrow } else { wide }` shape is not yet covered.

Source: [`shared/packs/vibe-auth/vibe-auth-inverted.ts`](../../shared/packs/vibe-auth/vibe-auth-inverted.ts)
Fixtures: [`corpus/rules/vibe-auth-inverted/`](../../corpus/rules/vibe-auth-inverted/)
