# core-quality-py-unused-variable

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.8

## What it catches

Local assignment LHS identifiers whose name is never referenced elsewhere in the file. Skip rules:

- `_`-prefixed names (Python convention for deliberately unused).
- Assignments whose RHS is a call / await (potential side effect).
- Tuple / star / subscript / attribute LHS (too noisy for v1).
- Top-level constants (we only check inside function bodies).

## Example — flagged

```python
def with_orphans():
    old_service_role_key = 'sk-XXX'    # ← never read
    legacy_timeout = 7                  # ← never read
    return 42
```

## Example — not flagged

```python
def reads_back():
    x = 7
    return x + 1                        # `x` is referenced

def underscore_exempt():
    _scratch = compute()                # `_`-prefixed — exempt

def side_effect_exempt():
    unused = api_call()                 # RHS is a call — exempt (might have side effects)
    return 'done'
```

## Implementation

Tree-sitter-python AST. Per-file identifier-use pre-pass (excluding declaration positions). Then walks every `assignment` inside function bodies, comparing the LHS name against the use map.

Source: [`shared/packs/core-quality/core-quality-py-unused-variable.ts`](../../shared/packs/core-quality/core-quality-py-unused-variable.ts)
Fixtures: [`corpus/rules/core-quality-py-unused-variable/`](../../corpus/rules/core-quality-py-unused-variable/)
