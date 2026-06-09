# core-quality-cyclomatic-complexity

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.9
**Threshold:** 15 (McCabe)

## What it catches

Function-like nodes (function declarations, function expressions, arrow functions, methods, constructors) whose cyclomatic complexity exceeds **15**.

The McCabe metric counts decision points: each `if`, `case`, `&&`, `||`, `??`, ternary (`? :`), `for`, `while`, `do-while`, and `catch` adds 1 to a base of 1.

## Why this matters for vibe-coded apps

High complexity is the single strongest predictor of latent bugs in vibe-coded apps. A function with > 20 branches has usually accumulated paths across several pivots — the developer no longer mentally models all of them. Neither will the AI: any "improvement" it suggests is likely to break a path neither of you remembered.

This rule is the cleanest signal for **"you don't understand this function anymore"**, which is the situation where defects breed.

## Example — flagged

A 17-branch function (function declarations are scored on their own; nested functions get their own scores):

```ts
function tangled(input: { ... }): string {
  if (input.a) result += 'a';                          // +1
  if (input.b) result += 'b';                          // +2
  // ... 10 more ifs ...
  for (const n of items) {                             // +13 for
    if (n > 0) result += '+';                          // +14
  }
  try {
    return result || 'fallback';                       // +15 ||
  } catch (e) {
    return 'err';                                      // +16 catch
  }
}
```

Cyclomatic = 16+. The rule reports `complexity-N` in the matched pattern for triage.

## Example — not flagged

```ts
function pick(x: number): string {
  if (x > 0) return 'positive';     // 1
  if (x < 0) return 'negative';     // 2
  return 'zero';
}

// Switch with 3 cases = base 1 + 3 = 4 — well below threshold
function classify(item: { kind: 'a' | 'b' | 'c' }): string {
  switch (item.kind) {
    case 'a': return 'A';
    case 'b': return 'B';
    case 'c': return 'C';
  }
}
```

## Suggested fix

Two refactors consistently shrink complexity:

- **Guard clauses with early returns** — moves nested validation into linear preconditions.
- **Lookup tables / strategy maps** — replace `if/else if/else if` chains keyed on a discriminant.

For deeply nested switch cases, split each case body into its own handler function.

Aim for branches ≤ 10 per function. Anything higher should be the explicit exception, with a comment explaining why.

## Suppressing

```ts
// codemore-ignore-next-line: core-quality-cyclomatic-complexity
// Reason: state machine intentionally exhaustive over 22 protocol states; splitting
// would obscure the matching to the spec table at https://example.com/spec.
function handleMessage(state, msg) { ... }
```

## Implementation

AST-based. Visits all function-likes; recursively counts the decision-point node kinds inside the body. Nested function-likes are NOT counted into the outer score (each gets its own).

Source: [`shared/packs/core-quality/core-quality-cyclomatic-complexity.ts`](../../shared/packs/core-quality/core-quality-cyclomatic-complexity.ts)
Fixtures: [`corpus/rules/core-quality-cyclomatic-complexity/`](../../corpus/rules/core-quality-cyclomatic-complexity/)
