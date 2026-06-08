// False-positive fixture for core-quality-empty-catch.
// None must fire.

import { createLogger } from './_logger';
const logger = createLogger('handled');

export async function loggedFailure(p: Promise<unknown>): Promise<void> {
  try { await p; }
  catch (err) {
    logger.warn({ err }, 'expected failure');
  }
}

export async function rethrown(p: Promise<unknown>): Promise<void> {
  try { await p; }
  catch (err) {
    throw new Error('outer context lost', { cause: err });
  }
}

export async function fallback(p: Promise<number>): Promise<number> {
  try { return await p; }
  catch {
    return 0;                            // deliberate fallback
  }
}

// A string containing `catch { }` must not match (strings are stripped).
export const NOTE = "Avoid empty `catch { }` blocks.";
