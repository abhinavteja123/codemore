# core-quality-empty-except

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** experimental
**Confidence:** 0.95

## What it catches

`except` clauses whose body is `pass` only, `...` (Ellipsis), a bare string (docstring-style placeholder), or nothing but comments. The classic "silently swallowed exception" pattern.

## Why this matters for vibe-coded apps

An empty except discards every exception that crosses it. The call site believes the operation succeeded, the failure mode is invisible, and the AI fixing the next bug has no diagnostic to read. This is the #1 reason 500-class errors look like 200s in vibe-coded FastAPI apps.

## Example — flagged

```python
try:
    user_data = api.fetch()
except Exception:
    pass                       # ← flag

try:
    return int(s)
except ValueError:
    ...                        # ← flag (ellipsis-only body)

try:
    risky()
except (KeyError, IndexError):
    pass                       # ← flag (tuple of exception types still flagged)
```

## Example — not flagged

```python
try:
    return open(path).read()
except Exception as e:
    logger.exception('read failed: %s', e)
    raise                      # logs + re-raises

try:
    return int(s)
except ValueError:
    return 0                   # real recovery — silent

try:
    thing()
except KeyError:
    raise RuntimeError('promoted')  # re-throws with context
```

## Suggested fix

```python
# (a) Log it.
except Exception as e:
    logger.exception('operation failed: %s', e)

# (b) Narrow the except to the specific exception type you mean to handle.
except FileNotFoundError:
    pass    # ← here `pass` is OK: missing-file is the expected branch.

# (c) Re-raise if recovery isn't real.
except Exception:
    logger.exception('unrecoverable')
    raise
```

## Suppressing

```python
try:
    optional_thing()
# Reason: legitimate best-effort cleanup; failure is not actionable.
# codemore-ignore-next-line: core-quality-empty-except
except Exception:
    pass
```

The directive must be on the line **immediately before** the target.

## Implementation

Tree-sitter-python AST. Visits every `except_clause`, finds its `block` child, and checks every statement in the block. The block is "empty" when every child is one of: `comment`, `pass_statement`, `expression_statement` containing `ellipsis`, or `expression_statement` containing a bare `string` literal.

Source: [`shared/packs/core-quality/core-quality-empty-except.ts`](../../shared/packs/core-quality/core-quality-empty-except.ts)
Fixtures: [`corpus/rules/core-quality-empty-except/`](../../corpus/rules/core-quality-empty-except/)
