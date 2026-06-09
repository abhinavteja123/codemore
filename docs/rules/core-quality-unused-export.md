# core-quality-unused-export

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.7

## What it catches

`export` declarations whose exported name is not referenced by any `import { Name }` anywhere else in the project. Cross-file pivot debris: the consumer was rewired or removed but the export was forgotten.

The check is name-based, using the `allImportedNames` set built once per scan from every TS/JS file. The rule does NOT do path resolution — if `Foo` is imported anywhere by name, every `Foo` export in the project is considered used. This is the SAFE direction (under-reports rather than over-reports).

## Why this matters for vibe-coded apps

The single most common cross-file vibe-coding artifact: a feature gets rewritten or removed, the consumer is deleted, the export stays behind. The exported NAME often reveals what the dead concept was — `oldAuthCheck`, `legacyValidate`, `previousAdminFlag` — and the AI may try to re-import it when working on a future fix, locking in obsolete behaviour.

## Example — flagged

```ts
// src/legacy.ts
export function oldAuthCheck(token: string): boolean { ... }   // ← flag
export const legacyMaxRetries = 7;                              // ← flag
export interface UnusedShape { id: string; legacyFlag: boolean; }  // ← flag
export type UnusedAlias = number | string;                      // ← flag
export function used(): string { return 'ok'; }                 // imported by entry.ts → silent
```

```ts
// src/entry.ts
import { used } from './legacy';
```

## Example — not flagged

- The export is consumed by another file in the project (any name match anywhere).
- The file is an **entry-point basename**: `index.ts`, `route.ts`, `page.tsx`, `layout.tsx`, `middleware.ts`, `main.ts`, `server.ts`, `cli.ts`, framework config (`next.config.js`, `tailwind.config.ts`, etc.). Their exports flow to a runtime that the rule can't see.
- The export name is **`_`-prefixed** (TS convention for deliberately unused).
- The export is a **`export default`** (default imports often bind to arbitrary local names; too noisy to flag in v1).
- The file is a **test file** (`*.test.ts` / `*.spec.ts`) — exports there feed the test runner.

## Suggested fix

- **Genuine pivot debris**: drop the export. If nothing else in the file references it either, delete the whole declaration. (`core-quality-unused-variable` will catch any leftover binding.)
- **Should be consumed**: find the call site that needs the export and add the `import`.
- **Public package surface** (the consumers live outside this repo): suppress with a Reason comment. The rule doesn't yet parse `package.json#exports` to recognise these automatically.

## Suppressing

```ts
// Reason: re-exported via barrel `src/index.ts` for external consumers; the analyser
// only sees imports inside this repo.
// codemore-ignore-next-line: core-quality-unused-export
export function publicHelper(): void {}
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Uses `ProjectIndex.allImportedNames`, a set populated once per scan from every TS/JS file's `import` clauses (default name, namespace name, both local alias and original name from named-import specifiers). The rule walks the current file's top-level `export` declarations (function / class / interface / type / enum / variable-statement / `export { X }`) and emits a finding for every name that isn't in the imported-names set.

Coverage gap:

- **Name collision**: if `Foo` is exported by two files but only one is consumed, both stay marked "used". Safe direction.
- **Dynamic imports** (`import('./x').then(m => m.Foo)`) — not tracked.
- **`package.json#exports`** — not consulted; library packages should suppress with a Reason comment until v1.1 lands the parse path.

Source: [`shared/packs/core-quality/core-quality-unused-export.ts`](../../shared/packs/core-quality/core-quality-unused-export.ts)
Fixtures: [`corpus/rules/core-quality-unused-export/`](../../corpus/rules/core-quality-unused-export/)
