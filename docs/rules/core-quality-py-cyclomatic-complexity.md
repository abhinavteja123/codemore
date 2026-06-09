# core-quality-py-cyclomatic-complexity

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** experimental
**Confidence:** 0.9
**Threshold:** 15 (McCabe)

## What it catches

`def` / `async def` whose cyclomatic complexity exceeds **15**. Each `if_statement`, `elif_clause`, `for_statement`, `while_statement`, `except_clause`, `conditional_expression` (ternary), `case_clause`, and `boolean_operator` (`and` / `or`) adds 1 to a base of 1.

Nested function definitions get their own score and don't add to the outer function's count.

## Why this matters for vibe-coded apps

High complexity is the single strongest predictor of latent bugs. A function with > 15 decision points has usually accumulated paths across several pivots — the developer no longer mentally models all of them, and neither will the AI fixing the next bug.

## Example — flagged

```python
def tangled(opts):              # 17 decision points
    s = ''
    if opts.get('a'): s += 'a'
    if opts.get('b'): s += 'b'
    # ... 12 more ifs ...
    for x in opts.get('items', []):
        if x:
            s += str(x)
    return s or 'empty'
```

## Example — not flagged

```python
def pick(x):
    if x > 0: return 'positive'
    if x < 0: return 'negative'
    return 'zero'                # complexity 3 — well below threshold
```

## Suggested fix

Two refactors that consistently shrink Python complexity:

- **Early-return guards** — flatten nested ifs.
- **Dispatch dict** — replace if/elif chains keyed on a discriminant.

```python
HANDLERS = {'a': do_a, 'b': do_b, 'c': do_c}
return HANDLERS[kind]()
```

## Suppressing

```python
# Reason: protocol state machine — 22-state exhaustive match is intentional.
# codemore-ignore-next-line: core-quality-py-cyclomatic-complexity
def handle_message(state, msg): ...
```

## Implementation

Tree-sitter-python AST. `findHighComplexityFunctions` counts decision-point node types per function body, skipping nested function bodies.

Source: [`shared/packs/core-quality/core-quality-py-cyclomatic-complexity.ts`](../../shared/packs/core-quality/core-quality-py-cyclomatic-complexity.ts)
Fixtures: [`corpus/rules/core-quality-py-cyclomatic-complexity/`](../../corpus/rules/core-quality-py-cyclomatic-complexity/)
