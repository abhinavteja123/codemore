// TP fixture: same magic string used >= 3 times. Rule must fire.

export function emit(kind: string): string {
  if (kind === 'pending-rls-review') return 'pending-rls-review';
  if (kind === 'b') return 'pending-rls-review';
  if (kind === 'c') return 'pending-rls-review';
  return 'idle';
}

// Not a dupe (only 2 of these).
const ONLY_TWICE = 'only-here';
export function twice(): string {
  return ONLY_TWICE + 'only-here';
}
