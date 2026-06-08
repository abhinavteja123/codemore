# core-quality-leftover-console

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| code-smell | MINOR (test path: INFO) | experimental | 0.8 / 0.5 in tests (clamped to 0.6 while experimental) |

## What it catches

Calls to `console.log`, `console.debug`, `console.info`, `console.trace` in TS / JS source. `console.error` and `console.warn` are **not** flagged — they're usually intentional logging on the server side and would generate noise.

Strings + comments are stripped before scan.

## Why it matters

`console.log('here')` left in production code is the most consistent AI-coding-tool artefact. In the browser it surfaces in DevTools, often leaking user objects or tokens attackers can scrape. Server-side it pollutes logs at high volume and obscures real signal. Either remove or replace with a structured logger.

## Example: failing code

```ts
export function lookupUser(id: string) {
  console.log('lookupUser called with', id);   // MINOR
  return { id };
}
```

## Example: how to fix

```ts
import { logger } from './logger';

export function lookupUser(id: string) {
  logger.debug({ userId: id }, 'user lookup');
  return { id };
}
```

Avoid logging entire objects — pass only the fields the production log channel should keep, and rely on the logger to redact secrets.

## Suppression

```ts
// codemore-ignore-next-line: core-quality-leftover-console
console.log('keep me — diagnostic for incident-1234');
```

## References

- [12-factor — Logs](https://12factor.net/logs)
- [pino](https://getpino.io/) for structured logging in Node.
