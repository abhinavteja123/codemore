# vibe-cors-wildcard-credentials

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | beta | 0.9 |

**Pack:** `vibe-frontend`

## What it catches

Source files (TypeScript / JavaScript) that combine `Access-Control-Allow-Origin: *` with credentials being sent — either via explicit response headers or via a `cors()` middleware object literal.

Two patterns:

1. **Header pair**: `Access-Control-Allow-Origin: '*'` and `Access-Control-Allow-Credentials: 'true'` both set (any order, anywhere in the file).
2. **CORS object**: `cors({ origin: '*', credentials: true })` or any object literal containing both `origin: '*'` (or `origin: true`) and `credentials: true`.

## Why it matters

The W3C CORS spec **rejects** the wildcard + credentials combination at the browser level. The browser sees `Access-Control-Allow-Origin: *` together with `Access-Control-Allow-Credentials: true` and **drops the response**. So the route does not work, but the developer's mental model is that they have permissive CORS — and when they "fix" it, they sometimes tighten the credentials side rather than tightening the origin allowlist.

It's also a high-signal tell for AI-generated code: when prompted to "fix a CORS error", LLMs commonly emit this exact pair because it appears in old Stack Overflow answers. The route compiles, the route deploys, and nothing cross-origin works in production.

## Example: failing code

```ts
// Pattern A — explicit headers
return new NextResponse(body, {
  status: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  },
});

// Pattern B — cors() middleware object
export const corsOptions = {
  origin: '*',
  credentials: true,
};
```

The rule reports a BLOCKER on each wildcard-origin line.

## Example: how to fix

Pick one of two paths:

### (a) Allowlist specific origins (recommended when you need credentials)

```ts
const ALLOWED = new Set(['https://app.example.com', 'https://staging.example.com']);

export async function GET(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = ALLOWED.has(origin);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}
```

### (b) Drop credentials (recommended for public read-only APIs)

```ts
return new NextResponse(body, {
  status: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    // No credentials header — public API; cookies / Authorization are not sent.
  },
});
```

Whichever path you pick, manually test a real cross-origin request — the rule catches the broken pair but cannot confirm your tightened config actually works.

## Known limitations

- Cross-file scope is not handled. If your CORS headers come from one file and credentials from another (Express middleware composed in `app.ts`), the rule may miss it. Phase-2 dataflow rules will close this gap.
- The cors-object detection matches anywhere in the file. A future v1.1 will scope to literal-object context to avoid the (rare) cross-statement false positive.
- Wildcard origin via dynamic expression (`origin: process.env.CORS_ORIGIN`) is not flagged — the value is unknown at scan time.

## Suppression

```ts
// codemore-ignore-next-line: vibe-cors-wildcard-credentials
'Access-Control-Allow-Origin': '*',
```

Per-file:

```ts
/* codemore-ignore-file: vibe-cors-wildcard-credentials */
```

## References

- [MDN — Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin)
- [W3C CORS — Credentials-supporting requests](https://www.w3.org/TR/cors/#supports-credentials)
- [OWASP — CORS misconfigurations](https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny)
