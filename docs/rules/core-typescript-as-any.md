# core-typescript-as-any

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| maintainability | MAJOR (test path: MINOR) | experimental | 0.85 / 0.6 in tests (clamped to 0.6 while experimental) |

## What it catches

`as any` type assertions in TypeScript source. Word-bounded match — variables / functions named `anyway`, `anything`, etc. are not flagged. String literals and comments are stripped before matching so docs mentioning the pattern don't fire.

## Why it matters

`as any` tells TypeScript to drop every check on the expression. The compile-time guarantee that protects every downstream usage of this value silently disappears. AI coding tools reach for `as any` as their default escape hatch when the type system pushes back; left unflagged, the codebase accumulates them until removing one becomes a 50-file refactor.

## Example: failing code

```ts
export function loadUser(raw: unknown): User {
  return raw as any;                       // MAJOR
}
export function processList(items: unknown[]): User[] {
  return items as any[];                   // MAJOR
}
```

## Example: how to fix

Pick the narrowest replacement that compiles:

```ts
// (a) Local type + structural check (preferred)
export function loadUser(raw: unknown): User {
  const r = raw as { id?: unknown; email?: unknown };
  if (typeof r?.id !== 'string' || typeof r?.email !== 'string') throw new Error('bad shape');
  return { id: r.id, email: r.email };
}

// (b) Runtime validator (zod / valibot / ajv) — best for external input
import { z } from 'zod';
const UserSchema = z.object({ id: z.string(), email: z.string().email() });
export function loadUser(raw: unknown): User {
  return UserSchema.parse(raw);
}

// (c) Module declaration to fix wrong third-party types
// types/some-library.d.ts:
// declare module 'some-library' { export function f(x: number): string; }
```

## Severity by file context

Test fixture paths (`/tests/`, `/__tests__/`, `/spec/`, `*.test.ts`, etc.) get a one-step downgrade to **MINOR** + confidence 0.6 — `as any` in tests is usually pragmatic shimming, not production risk.

## Known limitations

- Doesn't detect the deprecated angle-bracket form `<any>x`. v1.1 AST pass will.
- Doesn't catch `as any as Foo` chains specifically; the first `as any` is flagged.

## Suppression

```ts
// codemore-ignore-next-line: core-typescript-as-any
const sneakyButNecessary = thirdPartyMisTyped as any;
```

Or for an entire file:

```ts
/* codemore-ignore-file: core-typescript-as-any */
```

## References

- [TypeScript Handbook — Type assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions)
- [TypeScript ESLint — no-explicit-any](https://typescript-eslint.io/rules/no-explicit-any/)
