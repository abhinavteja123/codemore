# core-bugs-loose-equality

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| bug | MINOR | beta | 0.95 |

**Pack:** `core-quality`

## What it catches

Loose-equality operators `==` and `!=` in TypeScript / JavaScript source. Strict-equality `===` / `!==` is what the author almost always meant. String literals and comments are stripped before matching so docs that mention the operators don't fire.

## Why it matters

JavaScript's loose-equality coercion produces a famously long list of surprising truths:

- `0 == '0'` → `true`
- `'' == 0` → `true`
- `[] == false` → `true`
- `null == undefined` → `true`
- `[1] == 1` → `true`

Each `==` in production code is a potential bug waiting on the right input shape. The fix is mechanical (add one `=`), so leaving the rule unflagged is pure technical debt. AI-generated code reaches for `==` at a much higher rate than modern human-written code under common style guides — flagging it surfaces a systemic gap, not one-off mistakes.

## Example: failing code

```ts
export function isReady(state: unknown): boolean {
  return state == 'ready';                 // MINOR
}
export function hasItems(arr: unknown): boolean {
  if (arr == null) return false;           // MINOR — see "intentional null check" below
  return Array.isArray(arr) && arr.length != 0;
}
```

## Example: how to fix

```ts
export function isReady(state: unknown): boolean {
  return state === 'ready';
}
export function hasItems(arr: unknown): boolean {
  if (arr === null || arr === undefined) return false;
  return Array.isArray(arr) && arr.length !== 0;
}
```

### The "I really do want null OR undefined" case

This is the one legitimate use of `==`. Two equally clear alternatives:

```ts
// Explicit:
if (x === null || x === undefined) { ... }

// Nullish-coalescing where appropriate:
const v = x ?? defaultValue;
```

Both are catchable by the next maintainer without remembering JavaScript coercion rules.

## Known limitations

- Doesn't flag `Object.is(a, b)` vs `a === b` (different semantic, only relevant for NaN / -0).
- JSX expressions inside `{...}` use the same operator rules — the rule fires on those too, which is intended.

## Suppression

If you really need the loose-equality semantic on one line:

```ts
// codemore-ignore-next-line: core-bugs-loose-equality
if (x == null) return defaultValue;
```

Or for an entire file:

```ts
/* codemore-ignore-file: core-bugs-loose-equality */
```

## References

- [MDN — Equality comparisons and sameness](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness)
- [ESLint — eqeqeq](https://eslint.org/docs/latest/rules/eqeqeq)
