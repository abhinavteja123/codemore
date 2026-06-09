// False-positive fixture for core-quality-dead-conditional.
// All conditions LOOK constant-like to a quick scan, but they're runtime
// gates we explicitly don't flag. NONE must fire.

declare const CONFIG: { debug: boolean; rolloutPct: number };

export function envGate(): void {
  // Runtime config check, not a constant.
  if (process.env.NODE_ENV === 'production') {
    console.log('prod');
  }
}

export function configGate(): void {
  // Runtime config property.
  if (CONFIG.debug) {
    console.log('debug on');
  }
}

export function ssrGate(): void {
  // SSR guard — `typeof window` is checked at runtime.
  if (typeof window === 'undefined') {
    console.log('server');
  }
}

export function rolloutGate(p: number): void {
  // Different sides — not tautological.
  if (p < CONFIG.rolloutPct) {
    console.log('in rollout');
  }
}

export function userInputGate(user: { role?: string }): void {
  // Sides differ — not flagged.
  if (user.role === 'admin') {
    console.log('admin');
  }
}
