// True-positive fixture for core-quality-leftover-console.
// Four production console calls. All MUST fire.

export function lookupUser(id: string): { id: string } {
  console.log('lookupUser called with', id);    // hit 1
  return { id };
}

export function classify(input: number): string {
  console.debug('classify input', input);       // hit 2
  console.info('classify branch chosen');       // hit 3
  console.trace('classify trace');              // hit 4
  return input > 0 ? 'pos' : 'neg';
}

// console.error and console.warn must NOT fire (intentional logging).
export function reportFailure(msg: string): void {
  console.error('reportFailure', msg);
  console.warn('reportFailure', msg);
}
