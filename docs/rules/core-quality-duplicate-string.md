# core-quality-duplicate-string

**Pack:** `core-quality`
**Default severity:** MINOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.7

## What it catches

The same string literal repeated **≥ 5 times** in the same file. Pivot-debris signal: the AI generated similar code in several places, the developer restructured some, and now the remaining copies drift independently.

> Recalibrated after the Part 7 accuracy audit (was ≥ 3 occurrences / ≥ 4 chars): threshold raised to 5, minimum length to 8, and test/spec files are skipped entirely — the old settings made this rule one of the two worst false-positive sources on real TypeScript.

## Why this matters for vibe-coded apps

The next AI fix will see N copies of the same string and assume they represent the same concept, even after meaning has diverged. Extracting a constant makes the intent explicit and gives future changes one place to land.

## Example — flagged

```ts
function emit(kind: string): string {
  if (kind === 'pending-rls-review') return 'pending-rls-review';  // ← 1st, 2nd
  if (kind === 'b') return 'pending-rls-review';   // ← 3rd
  if (kind === 'c') return 'pending-rls-review';   // ← 4th
  if (kind === 'd') return 'pending-rls-review';   // ← 5th → flag
  return 'idle';
}
```

## Example — not flagged

- String appears **fewer than 5 times** in the file.
- String is **shorter than 8 characters** after trim (`'utf8'`, `'error'`, `'/'`).
- File is a **test/spec file** (`*.test.*`, `*.spec.*`, `__tests__/`, `tests/`, `fixtures/`) — repeated literals in tests are deliberate fixtures, not drift.
- String is **whitespace / punctuation only**.
- String is on the **common-noise list**: `'default'`, `'true'`, `'false'`, `'null'`, `'undefined'`, HTTP verbs (`'GET'`, `'POST'`, …), `'utf-8'`.
- String is an **import path** — `import 'x'`, `require('x')`, `import('x')`, `export from 'x'`.
- String is a **JSX class-like attribute value** — heuristic: contains a space AND parent is `JsxAttribute` (i.e. CSS class list).

## Suggested fix

Hoist the literal to a single named constant:

```ts
const RLS_REVIEW_TAG = 'pending-rls-review';

function emit(kind: string): string {
  if (kind === 'a') return RLS_REVIEW_TAG;
  if (kind === 'b') return RLS_REVIEW_TAG;
  if (kind === 'c') return RLS_REVIEW_TAG;
  return 'idle';
}
```

If the three sites genuinely represent three DIFFERENT concepts that happen to share the same value today, give each its own named constant — that also resolves the rule.

## Suppressing

```ts
// Reason: i18n keys kept inline by project convention; central catalog is generated, not authored.
// codemore-ignore-next-line: core-quality-duplicate-string
console.log('greeting.welcome');
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST walk over every `StringLiteral` / `NoSubstitutionTemplateLiteral`. Tally by exact text. Emit a single finding pointing at the FIRST occurrence per duplicate group. Skip rules listed above.

Cross-file duplication is intentionally out of scope for v1 — see the rule source for the rationale.

Source: [`shared/packs/core-quality/core-quality-duplicate-string.ts`](../../shared/packs/core-quality/core-quality-duplicate-string.ts)
Fixtures: [`corpus/rules/core-quality-duplicate-string/`](../../corpus/rules/core-quality-duplicate-string/)
