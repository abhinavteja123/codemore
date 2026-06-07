/**
 * vibe-frontend pack
 *
 * Detectors for frontend / API-route mistakes that show up at high rates
 * in vibe-coded apps: CORS misconfiguration, XSS sinks, missing rate
 * limits, and similar. Targets TypeScript / JavaScript source.
 */

import type { Rule } from '../../rules/Rule';
import { vibeCorsWildcardCredentials } from './vibe-cors-wildcard-credentials';

export const PACK_NAME = 'vibe-frontend' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  vibeCorsWildcardCredentials,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
