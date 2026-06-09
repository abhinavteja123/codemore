// Consumer that wires `lib.ts` exports into actual code paths.
import { add, PI, Point } from './lib';

export function area(p: Point): number {
  return add(p.x, p.y) * PI;
}
