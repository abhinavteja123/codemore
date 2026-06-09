# vibe-no-input-validation

**Pack:** `vibe-frontend`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.75

## What it catches

State-changing API route handlers (POST / PUT / PATCH / DELETE) that:

1. Read user input (`req.body`, `await req.json()`, `req.query`, `req.params`, `req.formData()`, and the same on `request` / `ctx` / `context` / `event`).
2. Import **no** recognised schema validator: `zod`, `yup`, `joi`, `valibot`, `typia`, `ajv`, `superstruct`, `io-ts`, `class-validator`, `@sinclair/typebox`, `runtypes`.

The import is treated as evidence of intent — we don't try to verify the validator actually runs. "Imported zod but forgot to call `parse()`" is a known false-negative.

## Why this matters for vibe-coded apps

Vibe-coded routes go straight from "parse the body" to "store it." No schema, no type narrowing, no sanitisation. Anything the attacker can fit in the JSON body lands in the handler — including prototype pollution, type confusion, fields the schema "doesn't have," and injection payloads bound for the DB call.

## Example — flagged

```ts
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ id: 'new-post', title: body.title });
}
```

## Example — not flagged

```ts
import { z } from 'zod';
const Body = z.object({ title: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response('Bad input', { status: 400 });
  ...
}

// Read-only route — silent.
export async function GET() { return Response.json({ ok: true }); }

// Doesn't read user input — silent.
export async function POST() { return Response.json({ ping: 'pong' }); }
```

## Suggested fix

Pick the validator that matches your stack. With Zod:

```ts
import { z } from 'zod';

const Body = z.object({
  title: z.string().min(1).max(200),
  isPublic: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response('Invalid input', { status: 400 });
  // Use parsed.data — typed, sanitised.
}
```

## Suppressing

```ts
// Reason: this endpoint forwards an opaque blob to a downstream service that owns validation.
// codemore-ignore-next-line: vibe-no-input-validation
import { NextRequest, NextResponse } from 'next/server';
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Project-level + file-level. Uses `ProjectIndex.routeFiles` to know which files are route handlers. For each candidate file the rule checks:
- Method is one of POST / PUT / PATCH / DELETE.
- An AST walk finds at least one user-input read (`await req.json()` / `req.body` / `req.query` / `req.params` / `req.formData()`).
- No `ImportDeclaration` matches one of the recognised validator package names.

Source: [`shared/packs/vibe-frontend/vibe-no-input-validation.ts`](../../shared/packs/vibe-frontend/vibe-no-input-validation.ts)
Fixtures: [`corpus/rules/vibe-no-input-validation/`](../../corpus/rules/vibe-no-input-validation/)
