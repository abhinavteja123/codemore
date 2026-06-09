// FP fixture: every export below IS imported somewhere in this fixture.

export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14;

export interface Point {
  x: number;
  y: number;
}

// `_internal` is _-prefixed — rule treats as deliberately unused.
export function _internal(): void {
  // No-op.
}
