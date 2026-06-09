// Consumes only `used` from legacy.ts. The other exports there should fire.
import { used } from './legacy';

export function main(): string {
  return used();
}
