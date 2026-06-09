// False-positive fixture for core-quality-unused-import.
// Every import below IS used in some position. None must fire.

// Named import used in code.
import { useState } from 'react';
export function counter(): number {
  const [n, setN] = useState(0);
  setN(n + 1);
  return n;
}

// Default import used.
import lodash from 'lodash';
export function chunked(xs: number[]): number[][] {
  return lodash.chunk(xs, 2);
}

// Namespace import used via member access.
import * as helpers from './helpers';
export function helpe(): unknown {
  return helpers.format('x');
}

// Type-only usage (annotation + return type). Identifier survives traversal.
import type { Result } from './result';
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

// Renamed import — the local alias is what gets used.
import { compute as compute2 } from './compute';
export function go(): number {
  return compute2();
}

// Side-effect-only import — has no binding, must not fire.
import './styles.css';

// Default + named used together.
import lodash2, { partition } from 'lodash-es';
export function split(xs: number[]): [number[], number[]] {
  void lodash2;
  return partition(xs, (x) => x > 0);
}
