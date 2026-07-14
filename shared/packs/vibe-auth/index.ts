/**
 * vibe-auth pack
 *
 * Detectors for authentication / authorization mistakes that are
 * disproportionately common in vibe-coded apps:
 *
 *   - Routes that write user data without verifying the session.
 *   - Auth-inverted patterns where anonymous callers see MORE data than
 *     authenticated ones.
 *   - BOLA (Broken Object Level Authorization): route uses a path param
 *     directly in a DB query without an ownership check.
 *
 * Phase 2B sequences these so the project-index machinery shipped with
 * the first rule is the same machinery the later ones consume.
 */

import type { Rule } from '../../rules/Rule';
import { vibeAuthMissingSessionCheck } from './vibe-auth-missing-session-check';
import { vibeAuthBola } from './vibe-auth-bola';
import { vibeAuthInverted } from './vibe-auth-inverted';
// Python catalog parity — Flask / FastAPI analogues
import { vibePyAuthMissingCheck } from './vibe-py-auth-missing-check';
import { vibePyAuthBola } from './vibe-py-auth-bola';

export const PACK_NAME = 'vibe-auth' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  vibeAuthMissingSessionCheck,
  vibeAuthBola,
  vibeAuthInverted,
  vibePyAuthMissingCheck,
  vibePyAuthBola,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
