// FP fixture: no string appears >= 3 times, plus exempt patterns.

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

// Short strings (< 4 chars) are silent regardless of count.
export function shortReps(): string {
  return 'x' + 'x' + 'x' + 'x';
}
