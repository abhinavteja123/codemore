// False-positive fixture for core-quality-leftover-console.
// None must fire.

import { createLogger } from './_logger';
const logger = createLogger('user-lookup');

export function lookupUser(id: string): { id: string } {
  logger.debug({ id }, 'lookupUser');
  return { id };
}

// console.error and console.warn must NOT fire by rule design.
export function reportFailure(err: unknown): void {
  console.error('failure', err);
  console.warn('failure', err);
}

// String / comment mentions must not fire (strings stripped).
export const NOTE = "Remove console.log() before shipping.";
// Comment: avoid console.debug('here').
