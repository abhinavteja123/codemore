# core-quality-py-unused-import

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.9

## What it catches

`import X` / `import X as Y` / `from M import X` / `from M import X as Y` bindings whose name is never referenced in the file.

## Example — flagged

```python
import os                       # ← os never used below
from typing import List         # ← List never used
import json as j                # ← alias j never used
```

## Example — not flagged

```python
import os
from typing import List
import json as j

def list_files(root: str) -> List[str]:
    return [p for p in os.listdir(root)]

def to_json(data) -> str:
    return j.dumps(data)
```

## Implementation

Tree-sitter-python AST. Per-file identifier-use pre-pass. Walks every `import_statement` / `import_from_statement`, collects the local-binding names (default name, alias, or `from M import X` tail names), and emits a hit for each name not in the use map.

Source: [`shared/packs/core-quality/core-quality-py-unused-import.ts`](../../shared/packs/core-quality/core-quality-py-unused-import.ts)
Fixtures: [`corpus/rules/core-quality-py-unused-import/`](../../corpus/rules/core-quality-py-unused-import/)
