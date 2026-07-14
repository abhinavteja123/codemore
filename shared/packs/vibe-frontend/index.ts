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
// Phase 8C Tier 1 — file-upload validation
import { vibeFileUploadNoValidation } from './vibe-file-upload-no-validation';
// Phase 8C Tier 2 — cookie flags
import { vibeCookieMissingFlags } from './vibe-cookie-missing-flags';
// Python catalog parity — Flask / Django / FastAPI analogues
import { vibePyCookieMissingFlags } from './vibe-py-cookie-missing-flags';
import { vibePyCorsWildcardCredentials } from './vibe-py-cors-wildcard-credentials';

export const PACK_NAME = 'vibe-frontend' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  vibeCorsWildcardCredentials,
  vibeXssDangerouslySet,
  vibeNoRateLimit,
  vibeNoInputValidation,
  vibeFileUploadNoValidation,
  vibeCookieMissingFlags,
  vibePyCookieMissingFlags,
  vibePyCorsWildcardCredentials,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
