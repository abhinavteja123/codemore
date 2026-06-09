// False-positive fixture for core-quality-cyclomatic-complexity.
// Each function below is below the threshold (15). NONE must fire.

export function add(a: number, b: number): number {
  return a + b;
}

export function pick(x: number): string {
  if (x > 0) return 'positive';
  if (x < 0) return 'negative';
  return 'zero';
}

export function classify(item: { kind: 'a' | 'b' | 'c' }): string {
  switch (item.kind) {           // base 1 + 3 cases = 4
    case 'a': return 'A';
    case 'b': return 'B';
    case 'c': return 'C';
  }
}

// A function with ~10 decision points — still below the threshold of 15.
export function medium(opts: { x?: number; y?: number; z?: number; mode?: string }): string {
  let s = '';
  if (opts.x) s += 'x';                    // +1
  if (opts.y) s += 'y';                    // +2
  if (opts.z) s += 'z';                    // +3
  if (opts.mode === 'a') s += 'A';         // +4
  if (opts.mode === 'b') s += 'B';         // +5
  for (let i = 0; i < 3; i++) s += i;      // +6
  return s || 'empty';                     // +7 ||
}
