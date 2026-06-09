# vibe-no-rate-limit

**Pack:** `vibe-frontend`
**Default severity:** MAJOR (promote to BLOCKER via `.codemorerc.json` if you want it gating CI)
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.85

## What it catches

API route handlers in a project where the **entire dependency tree** contains zero rate-limit libraries:

- `@upstash/ratelimit`
- `express-rate-limit`
- `next-rate-limit`
- `@nestjs/throttler`
- `fastify-rate-limit` / `@fastify/rate-limit`
- `rate-limiter-flexible`
- `limiter`

A route is considered an "API route handler" when any of:

- The file is at `app/api/**/route.{ts,tsx,js,jsx}` (Next.js App Router).
- The file is at `pages/api/**.{ts,tsx,js,jsx}` (Next.js Pages Router).
- The file imports `express` AND calls `app.get / post / put / patch / delete` (or `router.X`).

Fires once per route file when the project-level signal is "no rate limit anywhere".

## Why this matters for vibe-coded apps

This is the canonical Lovable / v0 / Bolt mistake: the AI generates a working POST handler and stops. The endpoint goes live. A single curl loop empties the Vercel quota, drains the OpenAI credits, or DoS's the database — and the bill arrives before the developer notices.

Every audited "vibe-coded app got owned" Twitter thread has this in the post-mortem.

## Example — flagged

```ts
// app/api/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ id: 'msg-1', body });
}
// + package.json has no @upstash/ratelimit, no express-rate-limit, none of the others.
```

## Example — not flagged

```ts
// app/api/messages/route.ts
import { limiter } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anon';
  const { success } = await limiter.limit(ip);
  if (!success) return new NextResponse('Too Many Requests', { status: 429 });
  ...
}
// + package.json declares @upstash/ratelimit.
```

The rule does NOT require every route file to call the limiter itself — a shared middleware is fine. The presence of the import anywhere in the project is the gate.

## Suggested fix

Wire a rate-limit middleware once and call it from every public route:

```ts
// lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});

// app/api/messages/route.ts
import { ratelimit } from '@/lib/ratelimit';
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anon';
  const { success } = await ratelimit.limit(ip);
  if (!success) return new NextResponse('Too Many Requests', { status: 429 });
  ...
}
```

For Express: `app.use(rateLimit({ windowMs: 60_000, max: 60 }));`

## Suppressing

```ts
// Reason: rate limiting handled by Cloudflare WAF at the gateway, not in app code.
// codemore-ignore-next-line: vibe-no-rate-limit
import { NextRequest, NextResponse } from 'next/server';
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Project-level. The CLI builds a `ProjectIndex` once per scan (see `daemon/cli/projectIndex.ts`) containing the union of every module specifier imported by every TS/JS file, plus a list of files that match the route-handler conventions above. The rule checks `projectIndex.hasRateLimitLib`; if false AND the current file is in `projectIndex.routeFiles`, it emits one finding.

Source: [`shared/packs/vibe-frontend/vibe-no-rate-limit.ts`](../../shared/packs/vibe-frontend/vibe-no-rate-limit.ts)
Fixtures: [`corpus/rules/vibe-no-rate-limit/`](../../corpus/rules/vibe-no-rate-limit/)
