# vibe-auth-missing-session-check

**Pack:** `vibe-auth`
**Default severity:** MAJOR (promote to BLOCKER via `.codemorerc.json` if it should gate CI)
**Languages:** TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.8

## What it catches

API route handlers that:

1. Handle a **state-changing** HTTP method (POST / PUT / PATCH / DELETE).
2. Reference **none** of the common session/auth helpers anywhere in the file:
   `getServerSession`, `auth`, `currentUser`, `getAuth`, `clerkClient`, `getUser`, `getSession`, `requireUser`, `requireAuth`, `verifySession`, `authMiddleware`.
3. Import no recognised auth library: `next-auth`, `@auth/*`, `@clerk/*`, `@supabase/ssr`, `@supabase/auth-helpers-*`, `@workos-inc/*`.

Route shapes detected:
- Next.js App Router: `app/api/**/route.{ts,tsx,js,jsx}`.
- Next.js Pages Router: `pages/api/**.{ts,tsx,js,jsx}`.
- Express: any file that imports `express` and calls `app.<verb>(...)`.

## Why this matters for vibe-coded apps

This is the canonical Lovable bug: the UI gates the action behind a sign-in screen, but the API endpoint accepts requests from anyone. Documented in 70%+ of audited Lovable / v0 / Bolt apps. Anonymous callers can:

- Mutate other users' data (BOLA's sibling).
- Enumerate IDs via repeated DELETE / PATCH calls.
- Run up your AI / DB / compute bill on your dime.

## Example — flagged

```ts
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ id: 'new-post', body });
}
```

(No `auth()`, `getServerSession`, `clerkClient`, `supabase.auth.getUser` anywhere; no auth-library import.)

## Example — not flagged

```ts
// app/api/posts/route.ts
import { auth } from '@/auth';
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  ...
}

// app/api/me/route.ts — GET-only, rule does not flag read-only handlers.
export async function GET() { return Response.json({ status: 'ok' }); }
```

The rule treats an **import** of a recognised auth library as evidence of intent — many apps wire auth at the middleware level rather than per-route. That's an acknowledged false-negative; suppress with a Reason comment if your middleware route is the canonical place.

## Suggested fix

Wire a session check at the top of the handler. Pick the helper matching your stack:

```ts
// Auth.js / NextAuth v5
import { auth } from '@/auth';
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
}

// Clerk
import { auth } from '@clerk/nextjs/server';
export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
}

// Supabase
import { createClient } from '@/utils/supabase/server';
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
}
```

If the route is a webhook receiver verifying a Stripe / GitHub signature, suppress with a Reason comment — signature verification is the auth.

## Suppressing

```ts
// Reason: Stripe webhook — verifies the signature in `constructEvent`, not a session.
// codemore-ignore-next-line: vibe-auth-missing-session-check
import { NextRequest, NextResponse } from 'next/server';
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Project-level. Uses the `ProjectIndex.routeFiles` inventory built once per scan to know which files are route handlers. For App Router files the rule reads the exported method names directly; for Pages Router / Express it falls back to an AST scan of the file body. Auth-helper presence is detected by AST identifier match plus a check of the file's `import` statements against known auth-library prefixes.

Source: [`shared/packs/vibe-auth/vibe-auth-missing-session-check.ts`](../../shared/packs/vibe-auth/vibe-auth-missing-session-check.ts)
Fixtures: [`corpus/rules/vibe-auth-missing-session-check/`](../../corpus/rules/vibe-auth-missing-session-check/)
