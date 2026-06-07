/**
 * vibe-secrets pack
 *
 * Detectors for the secrets-sprawl class of bugs that show up in vibe-coded
 * apps. GitGuardian's SOSS 2026 report tracked 29M leaked secrets in 2025 on
 * public GitHub; commits co-authored by AI tools leaked at roughly 2x the
 * human baseline. This pack catches the patterns that pipeline produces.
 */

import type { Rule } from '../../rules/Rule';
import { vibePublicEnvLeak } from './vibe-public-env-leak';
import { vibeHardcodedJwt } from './vibe-hardcoded-jwt';
import { vibeMcpConfigSecret } from './vibe-mcp-config-secret';

export const PACK_NAME = 'vibe-secrets' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  vibePublicEnvLeak,
  vibeHardcodedJwt,
  vibeMcpConfigSecret,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
