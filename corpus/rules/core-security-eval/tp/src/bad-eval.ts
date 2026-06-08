// True-positive fixture for core-security-eval
// Three distinct sinks. Rule MUST flag all three.

export function runUserCode(code: string): unknown {
  // 1. Direct eval.
  return eval(code);
}

export function makeAdder(): (a: number, b: number) => number {
  // 2. The Function constructor — stealth eval.
  return new Function('a', 'b', 'return a + b;') as (a: number, b: number) => number;
}

export function configFromString(src: string): unknown {
  // 3. Whitespace variants must still match.
  return eval ( src );
}
