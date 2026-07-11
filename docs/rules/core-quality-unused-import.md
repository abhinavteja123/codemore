# core-quality-unused-import

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.9

## What it catches

Import bindings that are **never referenced** in the file:

- `import Foo from 'x'` — default binding flagged when unused.
- `import * as Foo from 'x'` — namespace binding flagged when unused.
- `import { A, B } from 'x'` — each named binding checked independently; one finding per unused name.

Side-effect imports (`import 'x'`) have no binding and are never flagged.

## Why this matters for vibe-coded apps

Every unused import is:

1. **Bundle bloat** — most bundlers tree-shake well, but `import * as` defeats it, and CJS-shape modules drag in side effects.
2. **Supply-chain surface** — a CVE in `lodaash` only matters because someone imported `lodaash`. Slopsquatting attacks ride this exact lever.
3. **Misleading to agents** — the next AI looking at the file may believe `useState` is in use somewhere it isn't, and propose changes that depend on that ghost.

## Example — flagged

```ts
import { useState } from 'react';                 // ← flag (named)
import lodash from 'lodash';                      // ← flag (default)
import * as helpers from './helpers';             // ← flag (namespace)

import { partial, unused } from './partial';      // ← flag `unused` only
export function take(): unknown {
  return partial();
}
```

## Example — not flagged

```ts
import { useState } from 'react';
export function counter(): number {
  const [n, setN] = useState(0);
  setN(n + 1);
  return n;
}

// Type-only usage counts as a use.
import type { Result } from './result';
export function ok<T>(value: T): Result<T> { … }

// Renamed binding — local alias is what's used.
import { compute as compute2 } from './compute';
export function go(): number { return compute2(); }

// Side-effect-only import: no binding, never flagged.
import './styles.css';
```

## Suggested fix

- **Named import is unused** — drop just that name from the brace list. Don't delete the whole line if other names are still in use.
- **Default / namespace import is unused** — delete the whole import line.
- **Import was kept for side effects** — convert to side-effect form: `import 'foo';`.

## Suppressing

```ts
// Reason: re-exported via barrel even though this file does not reference it.
// codemore-ignore-next-line: core-quality-unused-import
import { kept } from './kept';
export { kept };
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST-based. Reuses the same identifier-reference pre-pass as `core-quality-unused-variable`. Then walks every `ImportDeclaration`: checks the default name, each named-import specifier, and any namespace import independently against the reference set, emitting one hit per unused binding. Side-effect-only imports (no `importClause`) are skipped by construction.

Source: [`shared/packs/core-quality/core-quality-unused-import.ts`](../../shared/packs/core-quality/core-quality-unused-import.ts)
Fixtures: [`corpus/rules/core-quality-unused-import/`](../../corpus/rules/core-quality-unused-import/)
