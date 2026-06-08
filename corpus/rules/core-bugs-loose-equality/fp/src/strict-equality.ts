// False-positive fixture for core-bugs-loose-equality
// None of these must fire.

export function isReady(state: unknown): boolean {
  return state === 'ready';                // strict ===, fine
}

export function notDone(state: unknown): boolean {
  return state !== 'done';                 // strict !==, fine
}

// A comment that mentions == must not trigger.
// Note: never use loose == for state comparisons.
export function safe(x: number, y: number): boolean {
  return x === y;
}

// A STRING that contains == must not trigger.
export const TIP = "Use === instead of ==.";

// Template literal with content that mentions == must not trigger (we strip templates).
export const DOCS = `Use === instead of ==.`;

// Assignment operators must not be flagged.
export function increment(): number {
  let x = 0;
  x += 1;
  return x;
}
