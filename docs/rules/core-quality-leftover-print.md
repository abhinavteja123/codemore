# core-quality-leftover-print

**Pack:** `core-quality`
**Default severity:** MINOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

Bare `print(...)` and `pprint.pprint(...)` calls in production-style Python. Almost always a debug breadcrumb someone forgot to remove.

Test files are exempted (path matches `test_*.py`, `*_test.py`, `tests/`, `conftest.py`, etc.) — debug-printing during tests is fine.

## Why this matters for vibe-coded apps

In a vibe-coded FastAPI / Streamlit / Modal app, leftover `print()` ends up in stdout, sometimes carrying sensitive payload, and contributes nothing to structured logging.

## Example — flagged

```python
def setup():
    print("server starting")          # ← flag

def cleanup():
    print("server stopping")          # ← flag

import pprint
def dump_state(state):
    pprint.pprint(state)              # ← flag
```

## Example — not flagged

```python
import logging
logger = logging.getLogger(__name__)
def setup():
    logger.info("server starting")    # structured logger — silent

# tests/test_app.py — test file basename → silent
def test_thing():
    print("debug from a test")
```

## Suggested fix

Replace with a structured logger or delete the line:

```python
import logging
logger = logging.getLogger(__name__)
logger.info("server starting", extra={"phase": "boot"})
```

## Suppressing

```python
# Reason: this CLI tool intentionally prints status to stdout (it IS the UX).
# codemore-ignore-next-line: core-quality-leftover-print
print("scan complete")
```

The directive must be on the line **immediately before** the target.

## Implementation

Tree-sitter-python AST. Walks every `call` node whose callee dotted-path is `print` or `pprint.pprint`.

Source: [`shared/packs/core-quality/core-quality-leftover-print.ts`](../../shared/packs/core-quality/core-quality-leftover-print.ts)
Fixtures: [`corpus/rules/core-quality-leftover-print/`](../../corpus/rules/core-quality-leftover-print/)
