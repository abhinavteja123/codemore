# core-quality-async-without-await

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| code-smell | MINOR | experimental | 0.8 (clamped to 0.6 while experimental) |

## What it catches

`async` functions whose body never uses `await` (or `for await`):

- `async function name(...) { ... }`
- `async function (...) { ... }`
- `async (...) => { ... }` (arrow with block body)
- `async name(...) { ... }` (class method shorthand)

Arrow with expression body (`async (x) => x`) is intentionally not flagged — by definition it cannot contain `await`. Comments and strings are stripped before scan.

## Why it matters

An `async` function whose body never uses `await` returns a Promise that wraps a synchronous value. Three downstream costs:

1. **Every caller must `await` or `.then`** — for no actual asynchrony.
2. **The signature lies** about whether I/O happens.
3. **Forgotten awaits** silently return Promise objects instead of values; type-checkers catch this less often than people think (the Promise still satisfies a `Promise<T>` return type).

AI-generated code reflexively marks helpers async "to be safe" without checking whether the helper actually does I/O. The catalog of these adds up — and vibe-coded apps accumulate dozens of them.

## Example: failing code

```ts
export async function compute(x: number): Promise<number> {
  return x * 2;                       // no await → MINOR
}
```

## Example: how to fix

```ts
// (a) The function is genuinely synchronous — drop async.
export function compute(x: number): number {
  return x * 2;
}

// (b) The function should await something it currently does not.
export async function fetchAndCompute(id: string): Promise<number> {
  const v = await db.get(id);
  return v * 2;
}
```

If the function MUST stay async (e.g. it implements an interface where other implementations DO await), suppress with a comment that documents which interface.

## Known limitations

- We don't resolve `await` in nested function definitions returned by the outer function. v1.1 with AST awareness will.
- We assume single-file scope; an outer-callback-style await pattern across files is not analyzed.

## Suppression

```ts
// codemore-ignore-next-line: core-quality-async-without-await
async syncForApiContract(x: number): Promise<number> { return x; }
```

## References

- [TypeScript ESLint — require-await](https://typescript-eslint.io/rules/require-await/) (same intent, ESLint rule equivalent).
