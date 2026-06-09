/**
 * vibe-frontend pack
 *
 * Detectors for frontend / API-route mistakes that show up at high rates
 * in vibe-coded apps: CORS misconfiguration, XSS sinks, missing rate
 * limits, and similar. Targets TypeScript / JavaScript source.
 */

import type { Rule } from '../../rules/Rule';
import { vibeCorsWildcardCredentials } from './vibe-cors-wildcard-credentials';
import { vibeXssDangerouslySet } from './vibe-xss-dangerously-set';
import { vibeNoRateLimit } from './vibe-no-rate-limit';
import { vibeNoInputValidation } from './vibe-no-input-validation';

export const PACK_NAME = 'vibe-frontend' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  vibeCorsWildcardCredentials,
  vibeXssDangerouslySet,
  vibeNoRateLimit,
  vibeNoInputValidation,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
