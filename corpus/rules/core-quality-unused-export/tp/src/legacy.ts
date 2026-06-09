// TP fixture: exports that NO other file in this fixture imports.
// Rule must fire on each.

export function oldAuthCheck(token: string): boolean {
  return token === 'legacy-magic-token';                  // ← flag
}

export const legacyMaxRetries = 7;                        // ← flag

export interface UnusedShape {                            // ← flag
  id: string;
  legacyFlag: boolean;
}

export type UnusedAlias = number | string;                // ← flag

// This one IS imported by entry.ts — should NOT fire.
export function used(): string {
  return 'ok';
}
