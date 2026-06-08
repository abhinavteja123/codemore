// False-positive fixture for core-typescript-as-any
// None of these must fire.

interface User { id: string; email: string; }

// Good: validated cast via narrowing.
export function loadUser(raw: unknown): User {
  if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
  const r = raw as { id?: unknown; email?: unknown };
  if (typeof r.id !== 'string' || typeof r.email !== 'string') throw new Error('bad shape');
  return { id: r.id, email: r.email };
}

// Good: a comment mentioning the pattern must not fire.
// We used to do `return raw as any` here but switched to a real validator.
export function safelyTyped(raw: unknown): string {
  return String(raw);
}

// Good: a STRING containing the literal "as any" must not fire — strings
// are stripped before matching.
export const docs = "Avoid `as any` casts in production code.";

// Good: as unknown is fine — the rule only flags as any.
export function widen(x: User): unknown {
  return x as unknown;
}

// Good: a variable named anyway should not match.
export function compute(anyway: number): number {
  return anyway * 2;
}
