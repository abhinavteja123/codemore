# vibe-ssrf-fetch-user-input

**Pack:** `core-security`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

Server-Side Request Forgery (SSRF): a `fetch(...)` / `axios.<verb>(...)` / `got(...)` / `request(...)` whose URL argument is sourced from user input without a visible host allowlist.

Tainted sources:
- `req.body.*`, `req.query.*`, `req.params.*`, `req.headers.*`, `req.searchParams.*`, `req.formData.*` (and the same on `request`, `ctx`, `context`, `event`).
- `await req.json()` / `await request.json()` / `.text()` / `.formData()`.
- `searchParams.get(...)` / `url.searchParams.get(...)` / `req.X.get(...)`.

Detection:
1. Direct property access of a tainted source: `fetch(req.body.url)`.
2. Identifier that this function destructured/assigned from a tainted source: `const { url } = await req.json(); fetch(url)`.
3. Template literal with at least one tainted substitution: `` fetch(`https://api.x/${id}`) `` where `id` is tainted.
4. Binary string concat with a tainted side: `fetch('https://api.x/' + userId)`.

## Why this matters for vibe-coded apps

Tenzai 2025 documented this in **5 of 5 AI coding agents** when prompted to build a URL-preview / link-checker feature. AI agents reach for "let the user specify the URL" and never wire up an allowlist. The endpoint then becomes a window into:

- AWS / GCP cloud-metadata service (`169.254.169.254`).
- Internal microservices behind the gateway.
- The admin panel at `localhost:5432`.

SSRF is one of the two highest-leverage findings (alongside BOLA) for proving the vibe-coding threat thesis.

## Example — flagged

```ts
export async function POST(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(body.url);                  // ← direct user input
}

export async function POST_b(req: NextRequest) {
  const { url } = await req.json();
  const r = await fetch(url);                       // ← one-hop taint
}

export async function POST_c(req: NextRequest) {
  const { id } = await req.json();
  const r = await fetch(`https://api.x/${id}`);     // ← tainted interpolation
}
```

## Example — not flagged

```ts
await fetch('https://api.example.com/health');      // static URL
await axios.get(`${process.env.SERVICE_HOST}/x`);   // env-driven, no user taint
await fetch(allowlisted(body.url));                 // result of a function call, not a known taint
```

The rule deliberately does NOT trace through arbitrary helper functions in v1. If you wrap an allowlist in a helper, the rule stays silent (which is the intended outcome).

## Suggested fix

```ts
const ALLOWED_HOSTS = new Set(['api.example.com', 'cdn.example.com']);

const target = new URL(userUrl);
if (!ALLOWED_HOSTS.has(target.host)) {
  return new Response('Forbidden host', { status: 400 });
}
const r = await fetch(target);
```

For internal-network protection, also block private CIDRs by resolving the hostname first and refusing private IPs.

## Suppressing

```ts
// Reason: scraper sandboxed in a Cloudflare Worker without metadata-IP routes.
// codemore-ignore-next-line: vibe-ssrf-fetch-user-input
const r = await fetch(body.url);
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST-based. For every function-like body the rule builds a small in-function taint map by walking VariableDeclarations / BindingPatterns / Assignment expressions, marking the LHS tainted when the RHS reads from a known user-input source. Then it walks every `CallExpression` whose callee is `fetch` / `axios.<verb>` / `got` / `got.<verb>` / `request`, and classifies the first argument against (a) the taint map and (b) the user-input shapes above. Static string / no-substitution-template-literal arguments are silent.

Source: [`shared/packs/core-security/vibe-ssrf-fetch-user-input.ts`](../../shared/packs/core-security/vibe-ssrf-fetch-user-input.ts)
Fixtures: [`corpus/rules/vibe-ssrf-fetch-user-input/`](../../corpus/rules/vibe-ssrf-fetch-user-input/)
