// True-positive fixture for core-typescript-as-any
// Three distinct casts. Rule MUST flag all three.

interface User { id: string; email: string; }

export function loadUser(raw: unknown): User {
  // Cast 1: a basic as-any from unknown.
  return raw as any;
}

export function processList(items: unknown[]): User[] {
  // Cast 2: cast to any[].
  return items as any[];
}

export function readNested(value: unknown): string {
  // Cast 3: chained as-any inside an expression.
  return (value as any).deep.path.name;
}
