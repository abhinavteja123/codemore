// Entry-point file (index.ts). The rule exempts entry-point basenames
// because their exports flow to a framework runtime, not to other source
// files. The single export below would otherwise be "unused" by the
// rule's static heuristic — but `index.ts` is on the exempt list.

import { area } from './app';

export function frameworkConsumed(): string {
  return `area=${area({ x: 1, y: 2 })}`;
}
