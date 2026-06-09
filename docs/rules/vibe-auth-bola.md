# vibe-auth-bola

**Pack:** `vibe-auth`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.7

## What it catches

Broken Object Level Authorization (BOLA) — the **#1 most prevalent access-control vuln in vibe-coded apps** per 2026 threat data. The shape:

1. The route handler IS authenticated (references `getServerSession` / `auth` / `currentUser` / `getAuth` / `clerkClient` / `getUser` / etc., OR a `session.user.id`-shaped expression).
2. The handler queries the DB by a **route-supplied id** (`params.id`, `req.params.X`, or any property accessed from a `params`-rooted chain) via a recognised method:
   - by-id: `findById` / `findUnique` / `findOne` / `getById` / `deleteOne` / `updateOne`.
   - chained: `.eq(...)` / `.where(...)` / `.whereEquals(...)` / `.filter(...)` / `.match(...)`.
3. The handler body NEVER references any ownership term: `session.user.id`, `session.user_id`, `userId`, `user_id`, `ownerId`, `owner_id`, `auth.uid`, `currentUserId`, `user.id`.

When all three conditions hold, any logged-in attacker can read or mutate another user's record by passing a guessed id.

## Why this matters for vibe-coded apps

The AI generates the auth check correctly — it just forgets to scope the query. From the user's perspective the action "works." From a victim's perspective, every other user can read their data.

This is the single highest-leverage rule in the catalog: it catches a 2026 #1 vuln class that no other scanner targets specifically for vibe-coded apps.

## Example — flagged

```ts
// app/api/posts/[id]/route.ts
export async function GET(req, ctx) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  // BOLA: lookup by id only.
  const post = await prisma.post.findUnique({ where: { id: ctx.params.id } });
  return Response.json(post);
}
```

## Example — not flagged

```ts
// Properly scoped — query body references session.user.id.
export async function GET(req, ctx) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const post = await prisma.post.findUnique({
    where: { id: ctx.params.id, userId: session.user.id },
  });
  return Response.json(post);
}

// No auth check — vibe-auth-missing-session-check covers it; BOLA stays silent.
export async function GET(req, ctx) {
  const page = await prisma.page.findUnique({ where: { slug: ctx.params.slug } });
  return Response.json(page);
}
```

## Suggested fix

Add the authenticated user id to the query predicate:

```ts
// Prisma
const post = await prisma.post.findUnique({
  where: { id: params.id, userId: session.user.id },
});
if (!post) return new Response('Not found', { status: 404 });

// Supabase
const { data } = await supabase
  .from('posts')
  .select()
  .eq('id', params.id)
  .eq('user_id', session.user.id)
  .single();
```

If the resource is genuinely shared (public read, admin-only write), enforce ownership at the RLS / middleware layer and suppress with a Reason comment.

## Suppressing

```ts
// Reason: ownership is enforced by Supabase RLS policy `posts_owner_only`.
// codemore-ignore-next-line: vibe-auth-bola
const { data } = await supabase.from('posts').select().eq('id', params.id).single();
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Per-function AST walk inside files matched by `projectIndex.routeFiles`. For each function-like body the rule collects:

- Auth-helper references (identifier match).
- Ownership terms (substring match across the function full text).
- Tainted-param names (destructured from `params` / `req.params` / `request.params` / `ctx.params` / `context.params`, plus direct property reads against the same roots).
- DB-shaped calls whose arguments contain a tainted-param name, classified into by-id vs chained method buckets.

Fires only when (auth check) AND (DB call with tainted param) AND NOT (ownership term anywhere in body).

Source: [`shared/packs/vibe-auth/vibe-auth-bola.ts`](../../shared/packs/vibe-auth/vibe-auth-bola.ts)
Fixtures: [`corpus/rules/vibe-auth-bola/`](../../corpus/rules/vibe-auth-bola/)
