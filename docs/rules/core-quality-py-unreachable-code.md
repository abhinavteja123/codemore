# core-quality-py-unreachable-code

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.95

## What it catches

Statements that follow `return`, `raise`, `sys.exit()` / `exit()` / `quit()`, `continue`, or `break` in the same block. The trailing code can never execute.

## Why this matters for vibe-coded apps

Pure pivot debris — the developer (or AI) changed direction and left old code below the new exit. The risk isn't the dead line itself; it's that the AI fixing the next bug may try to "improve" code that never actually runs.

## Example — flagged

```python
def fetch_user(id):
    return user_repo.get(id)
    log_done(id)             # ← never runs

def shutdown():
    sys.exit(0)
    cleanup()                # ← process already terminating
```

## Example — not flagged

```python
def pick(x):
    if x > 0: return 'positive'      # last in if-block — fine
    return 'negative'

def loop():
    for i in range(3):
        if i % 2 == 0: continue       # last in if-block — fine
        print(i)
```

## Implementation

Tree-sitter-python AST. Visits each `block`, classifies the last terminator, flags the FIRST statement that follows. Nested function / class definitions in the dead-code slot are skipped.

Source: [`shared/packs/core-quality/core-quality-py-unreachable-code.ts`](../../shared/packs/core-quality/core-quality-py-unreachable-code.ts)
Fixtures: [`corpus/rules/core-quality-py-unreachable-code/`](../../corpus/rules/core-quality-py-unreachable-code/)
