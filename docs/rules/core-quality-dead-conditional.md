# core-quality-dead-conditional

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.95

## What it catches

`if (...)` whose condition is trivially constant:
- `if (true)` / `if (false)` (and other literal primitives like `if (0)` / `if ('x')`)
- `if (X === X)` and `if (X !== X)` where both sides are textually identical

## Why this matters for vibe-coded apps

Pure pivot debris: the developer wrapped code in a gate, decided the gate should always-fire or never-fire, and forgot to remove the wrapper. The branch now either:

- **Always runs** — the wrapper is noise that hides the actual intent.
- **Never runs** — the code inside is silently dead but still looks live to the next reader.

Either case misleads the next AI agent or human about which logic is actually executing in production.

## Example — flagged

```ts
if (true) {                         // always-runs wrapper
  doThing();
}

if (false) {                        // silently disabled
  doExpensiveSetup();
}

if (1 === 1) {                      // tautology
  return 'always';
}

if (x !== x) {                      // impossible
  throw new Error('unreachable');
}
```

## Example — not flagged

We deliberately skip runtime gates that LOOK constant at compile time:

```ts
if (process.env.NODE_ENV === 'production') { ... }   // runtime env check
if (CONFIG.debug) { ... }                            // runtime config
if (typeof window === 'undefined') { ... }           // SSR guard
if (x === y) { ... }                                 // distinct identifiers
```

## Suggested fix

Decide what the gate was meant to do:

- **Branch should always run** → drop the wrapper: `doThing();`
- **Branch should never run** → delete the whole `if` block.
- **The gate was real but got over-simplified** → restore the actual condition: `if (config.flag) { doThing(); }`

## Suppressing

```ts
// codemore-ignore-next-line: core-quality-dead-conditional
// Reason: placeholder for an A/B test flag, intentionally always-true today.
if (true) {
  showVariantA();
}
```

## Implementation

AST-based. Visits `IfStatement` nodes; classifies the condition as `literal-true`, `literal-false`, `tautological-eq`, or `always-falsy-eq`.

Source: [`shared/packs/core-quality/core-quality-dead-conditional.ts`](../../shared/packs/core-quality/core-quality-dead-conditional.ts)
Fixtures: [`corpus/rules/core-quality-dead-conditional/`](../../corpus/rules/core-quality-dead-conditional/)
