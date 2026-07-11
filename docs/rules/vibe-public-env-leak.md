<!-- codemore-ignore-file: core-security-hardcoded-secret-pattern -->
# vibe-public-env-leak

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER (placeholder values: CRITICAL) | beta | 0.95 |

**Pack:** `vibe-secrets`

## What it catches

Env-file entries whose key combines a "public" framework prefix with a key fragment that names a secret.

Public prefixes the rule recognises (every frontend toolchain has one):

| Prefix | Framework |
|---|---|
| `NEXT_PUBLIC_` | Next.js |
| `VITE_` | Vite, SvelteKit, Vue, Solid |
| `REACT_APP_` | Create React App |
| `PUBLIC_` | Astro |
| `EXPO_PUBLIC_` | Expo |
| `GATSBY_` | Gatsby (every env var becomes public) |

Secret fragments the rule recognises (substring match, case-insensitive):

`SERVICE_ROLE`, `SERVICE_KEY`, `PRIVATE_KEY`, `SECRET_KEY`, `_SECRET`, `_PRIVATE`, `_PASSWORD`, `_PASSWD`, `_ADMIN_KEY`, `_ROOT_KEY`, `_MASTER_KEY`, `DATABASE_URL`, `STRIPE_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

## Why it matters

Frameworks inline these vars into the browser bundle at build time. Any visitor's DevTools shows them in seconds. **The Moltbook leak (Feb 2026, 1.5M API tokens + 47 GB of agent conversation history) was caused by one misnamed `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` in production.**

GitGuardian's State of Secrets Sprawl 2026 reported **29 million** new secrets leaked on public GitHub in 2025 — an 81 % surge in AI-service credential leaks year-over-year. AI-coding-tool commits leaked secrets at roughly **2× the human baseline**. This rule catches the exact env-var pattern at the heart of that surge.

## Example: failing code

```ini
# .env.local
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.real.key
VITE_STRIPE_SECRET_KEY=sk_live_51N3xampleStripeSecretValue
```

The rule reports a BLOCKER on each line.

## Example: how to fix

```ini
# .env.local

# Server-only secrets — no public prefix.
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.real.key
STRIPE_SECRET_KEY=sk_live_51N3xampleStripeSecretValue

# Public-safe values only — the anon key is designed to be shipped to clients,
# but only with RLS enabled (see vibe-supabase-rls-disabled).
NEXT_PUBLIC_SUPABASE_URL=https://abcdef.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.anon.key
```

Three steps:

1. **Rename** the env var to drop the public prefix.
2. **Move** every reference from client code to server code (API routes, server actions, edge functions).
3. **Rotate** the original secret. Anything ever exposed via a public prefix must be treated as compromised — bundles are cached, scraped, and indexed within minutes of deploy.

## Severity by value

If the value looks like a placeholder (`changeme`, `<REPLACE_ME>`, empty), the rule downgrades from **BLOCKER** to **CRITICAL** and lowers confidence. Real values stay BLOCKER.

## Known limitations

- We do not validate the value shape. A future v1.1 will add JWT and Stripe-key entropy checks so we can raise confidence even further on values that match real-key shape.
- `.env.example`, `.env.template`, `.env.sample`, `.env.dist` are skipped — they hold placeholders, not secrets.
- Only env files are scanned. A future companion rule will flag `process.env.NEXT_PUBLIC_*_SECRET` *references* in source even when the env file is `.gitignore`d.
- Each rule run is single-file. We do not detect "the same var is also defined unprefixed in `.env`" — that pattern is normal and not the bug.

## Suppression

```ini
# codemore-ignore-next-line: vibe-public-env-leak
NEXT_PUBLIC_FEATURE_SECRET=enabled-for-everyone
```

File-wide:

```ini
# codemore-ignore-file: vibe-public-env-leak
```

## How to verify the fix

The rule's `verificationCriteria` (read by the AI agent applying the fix) require:

1. Env file no longer contains a key starting with the public prefix and containing the secret fragment.
2. The renamed (server-only) key is referenced via `process.env` in server code, never imported into client code.
3. The exposed secret has been rotated in the provider dashboard.

## References

- [GitGuardian — State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026-pr/)
- [Help Net Security — 29M leaked secrets in 2025](https://www.helpnetsecurity.com/2026/04/14/gitguardian-ai-agents-credentials-leak/)
- [Next.js — exposing env vars to the browser](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables#bundling-environment-variables-for-the-browser)
- [Supabase — anon key vs service role key](https://supabase.com/docs/guides/api/api-keys)
