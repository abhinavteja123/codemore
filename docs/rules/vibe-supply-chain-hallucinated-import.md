# vibe-supply-chain-hallucinated-import

**Pack:** `core-security`
**Default severity:** MAJOR (promote to BLOCKER via `.codemorerc.json` once calibrated; tutorial and monorepo-workspace projects both produce noise at BLOCKER until v1.1 unions workspace `package.json` files)
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.85

## What it catches

`import` / `require` / `import()` / `export … from` statements referencing a package whose root name is **not declared** in the project's `package.json` (`dependencies` ∪ `devDependencies` ∪ `peerDependencies` ∪ `optionalDependencies`).

Resolves `@scope/pkg/sub/path` → `@scope/pkg` and `pkg/sub/path` → `pkg` before the dependency-set check.

## Why this matters for vibe-coded apps

Research found that ~20% of AI-generated code references packages that **do not exist on npm**. Attackers register the hallucinated names — slopsquatting — so the next `npm install` pulls down their code. An import of an undeclared package is the canonical pre-install signal: it will either fail at runtime (forgotten install) OR succeed in delivering attacker code (slopsquatting). Either case is a BLOCKER.

## Example — flagged

```ts
import { chunk } from 'lodaash';             // typo of 'lodash' — slopsquatting target
import validate from 'super-fast-validator'; // hallucinated by the AI
```

(Neither package root is in `package.json`.)

## Example — not flagged

```ts
import { useState } from 'react';            // declared
import { chunk } from 'lodash';              // declared
import { writeFileSync } from 'node:fs';     // node builtin
import { join } from 'path';                 // node builtin (no node: prefix)
import { helper } from './helper';           // relative
```

The rule skips: relative paths (`./`, `../`, `/`, `.`), `node:` protocol imports, and Node's curated builtin set (`fs`, `path`, `crypto`, `child_process`, …).

## Suggested fix

Decide which case applies **before** running `npm install`:

- **Hallucination**: delete the import. Replace the usage with the standard library or a package that actually exists. Do **not** `npm install <pkg>` to "make the error go away" — that's exactly the slopsquatting trap.
- **Forgotten install**: add the package to `dependencies`, install, and verify the npm metadata. Publisher matches a known maintainer, weekly downloads > 1k, repository URL resolves.
- **Rename**: update the import to the correct package name.

## Suppressing

```ts
// Reason: this project uses tsconfig `paths` to alias `@components` to `src/components`.
// The rule doesn't read path-alias config in v1.
// codemore-ignore-next-line: vibe-supply-chain-hallucinated-import
import { Button } from '@components/Button';
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Offline check, no network call. `package.json` from `ProjectIndex.root` is parsed once per scan and cached. For each TS/JS file's imports, the rule resolves the package root and tests set membership against the declared dependency union.

Coverage gap:

- **No registry-side check.** We don't know if the missing entry is a hallucination, a forgotten install, or an unregistered name waiting to be slopsquatted. The rule deliberately doesn't try — all three failure modes deserve a BLOCKER pre-install.
- **Monorepo workspaces** (yarn / pnpm / npm workspaces) — v1 looks at the scan root's `package.json` only. v1.1 will union the deps of every workspace `package.json` on disk.
- **TS path aliases** — `paths` from `tsconfig.json` are treated as undeclared. Suppress per-import or add a `.codemorerc.json` ignore for projects that lean heavily on aliases.

Source: [`shared/packs/core-security/vibe-supply-chain-hallucinated-import.ts`](../../shared/packs/core-security/vibe-supply-chain-hallucinated-import.ts)
Fixtures: [`corpus/rules/vibe-supply-chain-hallucinated-import/`](../../corpus/rules/vibe-supply-chain-hallucinated-import/)
