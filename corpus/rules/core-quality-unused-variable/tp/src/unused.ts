// True-positive fixture for core-quality-unused-variable.
// Each `const` / `let` below is declared and never referenced.
// All should be flagged.

export function snippet1(): number {
  // Pivot debris: `oldServiceRoleKey` was used by an auth path that got rewritten.
  const oldServiceRoleKey = 'service-role-xyz';   // ← flag
  const computed = 7 + 3;                          // ← flag
  return 42;
}

export function snippet2(): string {
  // `tempCtx` was passed to a helper that no longer exists.
  let tempCtx = { user: 'anon' };                  // ← flag
  return 'done';
}

export function snippet3(): boolean {
  // Even when the initializer is a literal, the binding is dead.
  const legacyAuthToken = 'TOKEN_PLACEHOLDER';     // ← flag
  return true;
}
