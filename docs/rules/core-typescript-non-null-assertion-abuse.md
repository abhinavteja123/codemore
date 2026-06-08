# core-typescript-non-null-assertion-abuse

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| bug | MINOR (test path: INFO) | experimental | 0.75 / 0.55 in tests (clamped to 0.6 while experimental) |

## What it catches

The non-null assertion operator `!` immediately followed by `.` or `[` in TypeScript source. Word-boundary aware — `!==` and `!=` are NOT matched. Strings and comments are stripped before scan.

## Why it matters

`value!.field` tells TypeScript "trust me, this isn't null" without any runtime check. When the promise is wrong, the next property access throws — the exact bug class TypeScript was supposed to prevent. AI tools reach for `!.` reflexively whenever the compiler complains, so each one is a place the type system pushed back and got ignored.

## Example: failing code

```ts
return u!.profile!.email!;     // 3 hits
return arr![0];                // 1 hit
```

## Example: how to fix

```ts
// (a) Guard early
if (!u?.profile?.email) throw new Error('email is required');
return u.profile.email;

// (b) Optional chaining + fallback
return u?.profile?.email ?? '';

// (c) Narrow at the type source — refactor the type so `!` is not needed.
```

## Suppression

```ts
// codemore-ignore-next-line: core-typescript-non-null-assertion-abuse
return checkedDef!.value;
```

## References

- [TypeScript Handbook — Non-null assertion operator](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#non-null-assertion-operator-postfix-)
