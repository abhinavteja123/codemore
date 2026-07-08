// TP fixture: same magic string (>= 8 chars) used >= 5 times. Rule must fire.

export function emit(kind: string): string {
  if (kind === 'pending-rls-review') return 'pending-rls-review';
  if (kind === 'b') return 'pending-rls-review';
  if (kind === 'c') return 'pending-rls-review';
  if (kind === 'd') return 'pending-rls-review';
  return 'idle';
}

// Not a dupe (only 2 of these).
const ONLY_TWICE = 'only-here-x';
export function twice(): string {
  return ONLY_TWICE + 'only-here-x';
}
