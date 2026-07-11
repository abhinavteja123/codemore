# core-security-py-eval

**Pack:** `core-security`
**Default severity:** BLOCKER
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.95

## What it catches

`eval(...)` and `exec(...)` calls — both interpret their string argument as Python code and are the canonical RCE sink.

## Example — flagged

```python
def parse(payload):
    return eval(payload)         # ← attacker-controlled payload = arbitrary code execution

def run(code):
    exec(code)                   # ← same risk
```

## Example — not flagged

```python
import json, ast

def parse_json(payload):
    return json.loads(payload)              # parse data, don't execute code

def parse_literal(payload):
    return ast.literal_eval(payload)        # rejects any non-literal — safe for ints/lists/dicts

def evaluator(formula):                     # local function named eval-like is fine
    return formula
```

## Suggested fix

```python
# (a) Parse data, don't execute code.
import json
data = json.loads(payload)

# (b) If you need to parse a literal Python expression:
import ast
data = ast.literal_eval(payload)
```

## Implementation

Tree-sitter-python AST. Walks every `call` node whose callee dotted-path is `eval` or `exec`.

Source: [`shared/packs/core-security/core-security-py-eval.ts`](../../shared/packs/core-security/core-security-py-eval.ts)
Fixtures: [`corpus/rules/core-security-py-eval/`](../../corpus/rules/core-security-py-eval/)
