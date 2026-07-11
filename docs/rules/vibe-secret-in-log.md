# vibe-secret-in-log

**Pack:** `core-security`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

Logger calls that reference a variable / property / object-key whose name strongly suggests it holds a secret, UNLESS the argument is wrapped in a recognised redaction helper.

Logger callees recognised:
- `console.log` / `.info` / `.warn` / `.error` / `.debug` / `.trace`.
- Bare `log(...)` and `<obj>.<level>(...)` where `<obj>` is `console`, `logger`, `log`, `pino`, `winston`.

Secret-name pattern (case-insensitive):
- Anchored at name start or `_`-segmented start: `secret`, `token`, `password`, `passwd`, `credential`, `privateKey` / `private_key`, `bearer`, `jwt`, `apiKey` / `api_key`, `accessKey` / `access_key`, `sessionId` / `session_id`, `clientSecret` / `client_secret`, `serviceRole` / `service_role`.
- Anchored at name end: `…Secret`, `…Token`, `…Password`, `…Passwd`, `…Credential`, `…Key`, `…Bearer`, `…Jwt`.

Recognised redaction wrappers (case-insensitive):
- `redact`, `mask`, `sanitize`, `sanitise`, `obfuscate`, `hash`, `truncate`, `sanitizeError`, `redactSecret`.

## Why this matters for vibe-coded apps

GitGuardian's 2026 SOSS reported logged secrets as the single most common channel for exposed tokens — they end up in Datadog, Sentry, Vercel logs, CloudWatch, and anywhere team members can grep retained logs. AI-generated code reaches for `console.log(apiKey)` during the "make it work" loop and forgets to remove it.

## Example — flagged

```ts
console.log('apiKey is', apiKey);
console.error({ apiKey, accessToken });
logger.info(`token=${accessToken}`);
console.warn('using sessionId', sessionId);
console.log(req.headers.authorization);
```

## Example — not flagged

```ts
console.log({ apiKey: redact(apiKey) });          // wrapped in redact()
logger.info('token=' + mask(accessToken));        // wrapped in mask()
console.log('hello world');                       // no secret-name
console.warn('error', { user: 'alice' });         // no secret-name

// Not a logger — silent.
function useApiKey(apiKey: string) { return `Bearer ${apiKey}`; }
```

## Suggested fix

Either drop the log line or wrap the value:

```ts
// wrong
logger.info({ apiKey }, 'configured');

// right (preview only)
logger.info({ apiKey: redact(apiKey) }, 'configured');

// right (drop entirely)
logger.info('configured');
```

If your transport already redacts (e.g. Pino's `redact` paths), suppress with a Reason comment.

## Suppressing

```ts
// Reason: pino transport redacts `apiKey` via its `redact` config.
// codemore-ignore-next-line: vibe-secret-in-log
logger.info({ apiKey }, 'configured');
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST-based. Walks every `CallExpression`; calls whose callee matches `console.*` / `logger.*` / `pino.*` / `winston.*` / `log(...)` are inspected. Each argument is classified against:

- `Identifier` whose text matches the secret-name pattern.
- `PropertyAccessExpression` whose accessed property name matches.
- `TemplateExpression` whose substitution recursively classifies.
- `ObjectLiteralExpression` whose property keys (shorthand or named) match.

If the argument is itself a `CallExpression` to a recognised redaction wrapper, the rule treats it as cleared and does not flag.

Source: [`shared/packs/core-security/vibe-secret-in-log.ts`](../../shared/packs/core-security/vibe-secret-in-log.ts)
Fixtures: [`corpus/rules/vibe-secret-in-log/`](../../corpus/rules/vibe-secret-in-log/)
