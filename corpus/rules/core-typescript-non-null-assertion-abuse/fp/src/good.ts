// False-positive fixture for core-typescript-non-null-assertion-abuse.
// None must fire.

interface User { profile?: { email?: string } }

// Good: optional chaining + fallback.
export function getEmail(u: User | undefined): string {
  return u?.profile?.email ?? '';
}

// Good: explicit narrow.
export function safeGet(u: User | undefined): string {
  if (!u || !u.profile || !u.profile.email) return '';
  return u.profile.email;
}

// `!==` and `!=` must not match (negative-lookbehind).
export function checks(x: unknown): boolean {
  return x !== null && x != undefined;
}

// Boolean NOT (preceding the operand) must not match.
export function nope(b: boolean): boolean {
  return !b;
}

// A string mentioning `!.` must not match (string stripped before scan).
export const NOTE = "Avoid `value!.field` in production.";

// Comment mentioning the pattern must not fire.
// Note: foo!.bar is the bad shape we're avoiding.
export const VALUE = 1;
