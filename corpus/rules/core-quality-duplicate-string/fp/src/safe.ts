// FP fixture: no string appears >= 5 times, plus exempt patterns.

// Each unique constant — silent.
const A = 'first';
const B = 'second';
const C = 'third';
export function names(): string {
  return `${A}-${B}-${C}`;
}

// Import paths — rule deliberately skips them.
import { useState } from 'react';
import { useEffect } from 'react';
import { useMemo } from 'react';
void useState; void useEffect; void useMemo;

// HTTP verbs are exempted as common-noise tokens even if repeated.
export function method(): string {
  const a = 'GET';
  const b = 'GET';
  const c = 'GET';
  return a + b + c;
}

// Short strings (< 8 chars) are silent regardless of count.
export function shortReps(): string {
  return 'token62' + 'token62' + 'token62' + 'token62' + 'token62' + 'token62';
}

// FOUR occurrences of a long string — below the >= 5 threshold, silent.
export function fourTimes(kind: string): string {
  if (kind === 'pending-rls-review') return 'pending-rls-review';
  if (kind === 'b') return 'pending-rls-review';
  return 'pending-rls-review';
}
