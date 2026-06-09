# vibe-supabase-anon-key-bundled

**Pack:** `vibe-supabase`
**Default severity:** BLOCKER
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.85
**Frameworks:** Supabase

## What it catches

`createClient(URL, KEY)` calls in **client-reachable** files where the second argument is a **hardcoded string literal**. Two failure modes:

1. The developer pasted the **service-role key** by mistake. The string ships to the browser. Game over.
2. Even if it IS the anon key, hardcoding bypasses env-var indirection. Future key rotations require code edits the team forgets to do.

## Why this matters for vibe-coded apps

The Moltbook incident (Feb 2026) leaked 1.5M tokens via a service-role JWT hardcoded in a Next.js client component. Vibe-coded apps reach for `createClient('url', 'key')` because the AI examples show that shape — env-var indirection is treated as optional polish. It isn't.

## Example — flagged

```ts
// src/components/SupabaseClient.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  'https://example.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJz...',   // ← hardcoded JWT
);
```

## Example — not flagged

```ts
// Env-driven — the constant is a reference, not a literal.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// app/api/.../route.ts — server-only, not client-reachable.
// Even a hardcoded service-role here doesn't ship to the browser.
const admin = createClient('https://example.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

The rule only fires when ALL of:

- File path is under `src/app`, `src/pages`, `src/components`, or top-level `app`, `pages`, `components`.
- File is NOT a server-only route (`*/api/.../route.{ts,tsx,js,jsx}` or `pages/api/*` are exempted).
- File imports `@supabase/supabase-js` (or any `@supabase/*`).
- `createClient(...)`'s second argument is a non-empty string literal.

## Suggested fix

```ts
// .env.local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

// your client file
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

**Service-role keys MUST NEVER appear in client-reachable code — even via env vars prefixed `NEXT_PUBLIC_` / `VITE_` / `REACT_APP_`.** They belong in server-only env vars consumed by API routes / server actions.

## Suppressing

```ts
// Reason: the literal here is a public demo URL + anon key for the storybook page.
// Production wiring lives in /env/.env.production and is loaded by the framework loader.
// codemore-ignore-next-line: vibe-supabase-anon-key-bundled
const supabase = createClient('https://demo.supabase.co', 'eyJ…');
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST walk. Gates:

1. `isClientReachable(filePath)` — path matches a client-reachable convention AND is not a server route.
2. `fileImportsSupabase` — `@supabase/*` import present.
3. CallExpression where callee text resolves to `createClient` (bare or member) and `arguments[1]` is a `StringLiteralLike` of non-zero length.

The match pattern carries `literal-jwt` when the second arg matches the JWT triple-segment shape (so triage knows which severity case to assume), or `literal-other` for any other literal.

Source: [`shared/packs/vibe-supabase/vibe-supabase-anon-key-bundled.ts`](../../shared/packs/vibe-supabase/vibe-supabase-anon-key-bundled.ts)
Fixtures: [`corpus/rules/vibe-supabase-anon-key-bundled/`](../../corpus/rules/vibe-supabase-anon-key-bundled/)
