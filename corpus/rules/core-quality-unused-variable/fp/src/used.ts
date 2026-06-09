// False-positive fixture for core-quality-unused-variable.
// Each declaration below IS used (or is exempt). None must fire.

export function readsBack(): number {
  const used = 7;
  return used + 1;                          // referenced
}

export function jsxLikeUse(): string {
  const greeting = 'hello';
  return `${greeting}, world`;              // referenced in template literal
}

// Exported names: consumers may live in other files. Skipped.
export const PI = 3.14;
export const E  = 2.71;

// Underscore-prefixed: TS convention for "deliberately unused". Skipped.
export function deliberatelyUnused(): void {
  const _scratch = compute();
  // `_scratch` is intentionally unused — should NOT be flagged.
}

function compute(): number {
  return 1;
}

// Side-effect initializer: deleting the binding would change behaviour.
// The rule deliberately does not flag this case.
export function withSideEffect(): void {
  const unusedButRan = compute();
  // `compute()` ran. Even if `unusedButRan` is dead, removing the line
  // removes the call. Skipped on purpose.
  return;
}

// Shorthand property assignments count as a USE of the captured name.
export function shorthandUse(): { name: string } {
  const name = 'codemore';
  return { name };                          // shorthand → counts as use
}

// Type-position references count as a use.
export function typeRefUse(): void {
  type Wrapper<T> = { value: T };
  const wrap: Wrapper<number> = { value: 1 };
  void wrap;
}
