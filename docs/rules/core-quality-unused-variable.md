# core-quality-unused-variable

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.85

## What it catches

Local `const` / `let` / `var` declarations whose name is **never read** elsewhere in the same file.

```ts
function fetchUser(id: string): User {
  const oldServiceRoleKey = 'sk-XXX';     // ← never read; pivot debris
  return userRepo.get(id);
}
```

The variable name often reveals the removed concept — `oldServiceRoleKey`, `legacyAuthToken`, `tempCtx`. That dead noun is what misleads the next AI agent.

## Why this matters for vibe-coded apps

This is the single most common pivot artifact in vibe-coded apps. A feature gets rebuilt or removed, the surrounding code gets rewired, the orphan variable stays. The risk isn't the byte cost — it's that **the AI now thinks state exists where it doesn't**. A future fix it suggests may try to "use" the dead binding, locking the bug in place.

This is also the rule users literally ask for: *"variables are not used just kept due to heavy change in the goal."*

## Example — flagged

```ts
export function snippet1(): number {
  const oldServiceRoleKey = 'service-role-xyz';  // ← flag
  const computed = 7 + 3;                         // ← flag
  return 42;
}

export function snippet2(): string {
  let tempCtx = { user: 'anon' };                 // ← flag
  return 'done';
}
```

## Example — not flagged

```ts
export function readsBack(): number {
  const used = 7;
  return used + 1;                                // referenced
}

// Exported names may be consumed across files.
export const PI = 3.14;

// Underscore-prefixed: TS convention for "deliberately unused".
function deliberatelyUnused(): void {
  const _scratch = compute();
}

// Side-effect initializer: deleting the line removes a call.
function withSideEffect(): void {
  const unusedButRan = compute();
}

// Shorthand property assignment counts as a use.
function shorthandUse(): { name: string } {
  const name = 'codemore';
  return { name };
}
```

## Suggested fix

Two paths:

- **The variable is genuine pivot debris** — delete the line. The AI immediately stops believing in state that isn't there.
- **The variable was supposed to be wired in** — find the caller that should consume it and reconnect it. If the variable is intentionally unused for now (a future-feature placeholder), prefix the name with `_`.

## Suppressing

```ts
function intentionallyKept(): void {
  // Reason: kept as a documentation marker for the auth rewrite branch.
  // codemore-ignore-next-line: core-quality-unused-variable
  const futureFeatureFlag = 'pending-rls-rewrite';
  return;
}
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

AST-based. Pre-pass collects all identifier references in the source file (excluding declaration positions); a second pass visits every `VariableDeclaration` whose name is a plain `Identifier` and emits a hit when the reference count is zero. Exports, `_`-prefixed names, and declarations with side-effect initializers (`CallExpression`, `NewExpression`, `AwaitExpression`) are skipped. Destructuring patterns are not flagged in this rule.

Source: [`shared/packs/core-quality/core-quality-unused-variable.ts`](../../shared/packs/core-quality/core-quality-unused-variable.ts)
Fixtures: [`corpus/rules/core-quality-unused-variable/`](../../corpus/rules/core-quality-unused-variable/)
