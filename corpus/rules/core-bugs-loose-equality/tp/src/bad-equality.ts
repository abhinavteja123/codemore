// True-positive fixture for core-bugs-loose-equality
// Four cases. Rule MUST flag all four.

export function isReady(state: unknown): boolean {
  return state == 'ready';                 // hit 1 — ==
}

export function notDone(state: unknown): boolean {
  return state != 'done';                  // hit 2 — !=
}

export function hasItems(arr: unknown): boolean {
  if (arr == null) return false;           // hit 3 — == (yes, intentional-looking but flagged for consistency)
  return Array.isArray(arr) && arr.length != 0;   // hit 4 — !=
}
