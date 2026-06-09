/**
 * core-security pack
 *
 * Universal security rules that apply to any TS/JS codebase, not specific
 * to vibe-coded apps. These complement the vibe-* packs by catching
 * patterns that any reviewer would flag, regardless of how the code was
 * written.
 */

import type { Rule } from '../../rules/Rule';
import { coreSecurityEval } from './core-security-eval';
import { coreSecurityInnerhtmlAssignment } from './core-security-innerhtml-assignment';
import { coreSecurityShellInjection } from './core-security-shell-injection';
import { coreSecurityHardcodedSecretPattern } from './core-security-hardcoded-secret-pattern';
import { vibeSsrfFetchUserInput } from './vibe-ssrf-fetch-user-input';

export const PACK_NAME = 'core-security' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  coreSecurityEval,
  coreSecurityInnerhtmlAssignment,
  coreSecurityShellInjection,
  coreSecurityHardcodedSecretPattern,
  vibeSsrfFetchUserInput,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
