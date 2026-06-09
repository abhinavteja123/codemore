// True-positive fixture for core-quality-unreachable-code.
// Each function below has a statement that follows a terminator and
// CANNOT execute. All MUST fire.

export function afterReturn(x: number): number {
  return x * 2;
  // hit 1: dead leftover from an earlier version
  console.log('this never runs');
}

export function afterThrow(x: number): never {
  throw new Error('boom');
  // hit 2: also dead
  return x as never;
}

export function afterContinue(items: number[]): number {
  let n = 0;
  for (const item of items) {
    if (item < 0) {
      continue;
      // hit 3: dead — continue already left this iteration
      n -= item;
    }
    n += item;
  }
  return n;
}

export function afterProcessExit(): void {
  process.exit(1);
  // hit 4: process already terminating
  console.log('this never runs');
}
