# core-quality-unreachable-code

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.95

## What it catches

Statements that follow an unconditional `return`, `throw`, `break`, `continue`, or `process.exit()` in the same block. Because the prior statement always leaves the block, the next statement cannot execute.

## Why this matters for vibe-coded apps

Pure pivot debris. The developer changed direction (or asked the AI to) and left the old code beneath the new exit. The risk isn't the dead line itself — it's that **the AI agent now believes logic exists there**. A future fix it suggests may try to "improve" code that never actually runs, or skip a real path because the dead path looks active.

## Example — flagged

```ts
function fetchUser(id: string): User {
  return userRepo.get(id);
  logger.info('fetched ' + id);   // ← dead, never runs
}
```

```ts
function shutdown(): void {
  process.exit(0);
  cleanup();                       // ← dead, process already terminating
}
```

```ts
for (const item of items) {
  if (item < 0) {
    continue;
    n -= item;                     // ← dead, continue already left this iteration
  }
}
```

## Example — not flagged

```ts
function pick(x: number): string {
  if (x > 0) return 'positive';    // last statement in the if-block — fine
  return 'negative';
}

function withHelper(): void {
  return;
  function helper() {}             // hoisted function declaration — fine
}
```

## Suggested fix

Two paths:

- **The code is genuinely dead** — delete it. The AI immediately stops believing in a phantom path.
- **The exit was premature** — move it (often into a guard above), or remove it. The trailing code becomes live again.

If the line is intentionally kept for context (e.g. a TODO marker before the return), move it **above** the terminating statement so it actually executes.

## Suppressing

```ts
function deliberatelyDead(): void {
  return;
  // codemore-ignore-next-line: core-quality-unreachable-code
  // Reason: kept as documentation for a soon-to-be-restored branch.
  doSomething();
}
```

## Implementation

AST-based. Visits `Block` nodes, classifies the last terminator (`ReturnStatement`, `ThrowStatement`, `BreakStatement`, `ContinueStatement`, `process.exit()` call), flags the FIRST statement that follows. Hoisted function declarations and plain `var` statements are skipped.

Source: [`shared/packs/core-quality/core-quality-unreachable-code.ts`](../../shared/packs/core-quality/core-quality-unreachable-code.ts)
Fixtures: [`corpus/rules/core-quality-unreachable-code/`](../../corpus/rules/core-quality-unreachable-code/)
