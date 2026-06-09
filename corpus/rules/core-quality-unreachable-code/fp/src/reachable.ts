// False-positive fixture for core-quality-unreachable-code.
// All terminating statements here are at the END of their block.
// Nothing follows them in the same block. NOTHING must fire.

export function earlyReturn(x: number | null): number {
  if (x === null) return 0;        // early return, no dead code after in this block
  return x * 2;
}

export function tryCatchFlow(p: Promise<unknown>): void {
  try {
    return;                         // last statement in try-block — fine
  } catch (e) {
    throw e;                        // last statement in catch — fine
  }
}

// Hoisted function declaration after a return — JS hoists this, not dead.
export function hoistedDeclAfter(): void {
  return;
  function helper() { /* hoisted */ }
}

export function branchedReturns(x: number): string {
  if (x > 0) {
    return 'positive';              // last in if-block
  } else if (x < 0) {
    return 'negative';              // last in else-if block
  }
  return 'zero';                    // last in function body
}

// `continue` at end of for-body — no statements follow it.
export function continueAtEnd(items: number[]): void {
  for (const item of items) {
    if (item === 0) continue;
    console.log(item);
  }
}
