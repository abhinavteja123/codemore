<!-- codemore-ignore-file: core-security-hardcoded-secret-pattern -->
# core-security-hardcoded-secret-pattern

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | experimental | 0.95 (clamped to 0.6 while experimental) |

## What it catches

Provider-issued secret tokens by canonical prefix + shape. Covers the long tail of non-JWT secrets that show up in vibe-coded apps:

| Provider | Pattern |
|---|---|
| Stripe (live, restricted, test) | `sk_live_…`, `rk_live_…`, `sk_test_…` |
| GitHub (PAT, OAuth, server, refresh, user) | `ghp_…`, `gho_…`, `ghs_…`, `ghr_…`, `ghu_…` |
| AWS | `AKIA…` (16 chars) |
| OpenAI | `sk-…`, `sk-proj-…` |
| Anthropic | `sk-ant-api-…`, `sk-ant-admin-…` |
| Supabase | `sbp_…` |
| Slack | `xox[b/p/o/e/s/a]-…` |
| Google API | `AIza…` (35 chars) |
| Discord bot | `[MN]…[27 chars]` 3-segment shape |

Strings whose tails are all the same character (`sk_live_xxxxxxxx`), or that start with `your`/`YOUR`/`placeholder`, are treated as placeholders and skipped.

## Why it matters

A real provider token committed to source is a credential leak. Git history preserves the value forever, mirrors cache it within minutes, and rotation is mandatory once the value has been pushed anywhere public. AI-generated apps reach for "paste the key inline" as a fallback when env-var wiring is incomplete — this rule catches the canonical provider shapes by their issued prefix so the leak surfaces before the commit lands.

## Example: failing code

```ts
export const STRIPE = 'sk_live_51N3RealStripeLiveKeyValueLongEnough';   // BLOCKER
export const GITHUB = 'ghp_RealGitHubPatThirtyPlusCharsLongEnoughh';    // BLOCKER
```

## Example: how to fix

```ts
const STRIPE = process.env.STRIPE_LIVE_SECRET;
if (!STRIPE) throw new Error('STRIPE_LIVE_SECRET is required');
```

Then **rotate the original token** in the provider dashboard. Git history preserves it.

## Suppression

```ts
// codemore-ignore-next-line: core-security-hardcoded-secret-pattern
export const FAKE_FOR_VCR_REPLAY = 'sk_live_thisIsFromARecordedFixture';
```

## References

- [GitGuardian — State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026-pr/)
- [Stripe — keys](https://stripe.com/docs/keys)
- [GitHub — token formats](https://github.blog/security/application-security/behind-githubs-new-authentication-token-formats/)
