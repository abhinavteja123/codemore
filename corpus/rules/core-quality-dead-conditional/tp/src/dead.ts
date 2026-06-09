// True-positive fixture for core-quality-dead-conditional.
// Every if has a trivially constant condition. ALL must fire.

export function alwaysRuns(): void {
  if (true) {                            // hit 1: literal-true
    console.log('always');
  }
}

export function neverRuns(): void {
  if (false) {                           // hit 2: literal-false
    console.log('never');
  }
}

export function tautology(): boolean {
  // hit 3: tautological-eq, both sides identical literal
  if (1 === 1) return true;
  return false;
}

export function inequalityOnSelf(x: number): boolean {
  // hit 4: always-falsy-eq
  if (x !== x) return true;
  return false;
}
