# vibe-hardcoded-jwt

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER (test paths: MAJOR) | experimental | 0.9 (clamped to 0.6 while experimental) |

## What it catches

String literals in source code that match the JSON Web Token shape: three base64url segments separated by dots, where the first two segments start with `eyJ` (the prefix every JWT header and payload begins with, because they base64url-encode `{"`).

Regex (anchored at non-identifier boundaries to avoid matching inside longer alphanumeric runs):

```
(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])
```

## Why it matters

A JWT in source is a credential committed to git history forever. Once shipped in a browser bundle or pushed to a public branch, the token must be rotated — deleting the line on `main` does nothing for bundlers, mirrors, and code indexes that already cached the value.

Concrete incident: **Moltbook (Feb 2026, 1.5M tokens + 47 GB of agent conversation history leaked)** — caused by a Supabase service-role JWT hardcoded into a Next.js client component. That single line shipped the master key to every visitor.

GitGuardian's State of Secrets Sprawl 2026 found **29 million** secrets leaked on public GitHub in 2025, with AI-coding-tool commits leaking at **2× the human baseline**. Hardcoded JWTs are one of the top three patterns in that surge.

## Example: failing code

```ts
import { createClient } from '@supabase/supabase-js';

const SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZiIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.UNIQUEsignaturebytes';

export const supabase = createClient(url, SERVICE_ROLE);
```

The rule reports a BLOCKER on the `SERVICE_ROLE` line.

## Example: how to fix

```ts
import { createClient } from '@supabase/supabase-js';

const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

export const supabase = createClient(process.env.SUPABASE_URL!, serviceRole);
```

Four steps:

1. Replace the literal with `process.env.<NAME>`.
2. **Rotate the leaked token** in the issuing service (Supabase, Auth0, Clerk, …). Anything ever committed must be treated as compromised, even if the commit is rewritten.
3. Add the env-var name (without a value) to `.env.example`.
4. If this token had a `service_role`-equivalent capability, audit access logs for the period between commit and rotation.

## Severity by file context

If the file path matches a test fixture pattern (`/tests/`, `/__tests__/`, `/spec/`, `/fixtures/`, `.test.ts`, `.spec.ts`, etc.), severity is downgraded from **BLOCKER** to **MAJOR** and confidence to 0.7. Real test JWTs still leak the same way as production ones, but the urgency is lower — and you may legitimately need example tokens in a fixture (use the placeholder pattern below).

## How to write an "obviously not a token" placeholder

The rule has a placeholder filter — it skips matches whose segments are all under 12 characters or are character runs like `aaaaa.bbbbb.ccccc`. Examples that DON'T trigger:

```ts
// All segments under 12 chars.
const EXAMPLE = 'eyJabc.eyJdef.signed';

// Repetitive segments.
const ILLUSTRATIVE = 'eyJaaaaaa.eyJbbbbbb.cccccc';
```

For docs that need a realistic-looking sample, redact the middle of the payload with literal text:

```ts
const SAMPLE = 'eyJhbGciOiJIUzI1NiJ9.<PAYLOAD>.<SIG>';
```

## Suppression

```ts
// codemore-ignore-next-line: vibe-hardcoded-jwt
const TEST_TOKEN = 'eyJ...real-jwt-here...';
```

Per-block:

```ts
/* codemore-ignore-file: vibe-hardcoded-jwt */
```

If you need to disable globally for a path, set it in `.codemorerc.json`:

```jsonc
{
  "rules": {
    "vibe-hardcoded-jwt": "off"
  }
}
```

## Known limitations

- Tokens not in JWT shape (Stripe `sk_live_*`, Supabase `sbp_*` PATs, GitHub `ghp_*`) are not caught. A future companion rule (`vibe-hardcoded-secret-generic`) will cover those provider-prefixed shapes.
- Encrypted tokens (e.g. JWE, Paseto v2) are not caught.
- The rule does not classify the token's `kid`/`alg`/`role` — every JWT-shaped literal is treated as production-grade by default.

## References

- [GitGuardian — State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026-pr/)
- [Supabase — API Keys (anon vs service_role)](https://supabase.com/docs/guides/api/api-keys)
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
