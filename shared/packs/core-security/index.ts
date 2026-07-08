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
import { coreSecurityHardcodedPassword } from './core-security-hardcoded-password';
import { vibeSsrfFetchUserInput } from './vibe-ssrf-fetch-user-input';
import { vibeDbWriteWithoutWhere } from './vibe-db-write-without-where';
import { vibeDbSelectStarFromUserTable } from './vibe-db-select-star-from-user-table';
import { vibeSecretInLog } from './vibe-secret-in-log';
import { vibePromptInjectionSink } from './vibe-prompt-injection-sink';
import { vibeSupplyChainHallucinatedImport } from './vibe-supply-chain-hallucinated-import';
// Phase 7A — Python native pack
import { coreSecurityPyEval } from './core-security-py-eval';
import { coreSecurityPyShellInjection } from './core-security-py-shell-injection';
import { vibePySsrfFetchUserInput } from './vibe-py-ssrf-fetch-user-input';
import { vibePySecretInLog } from './vibe-py-secret-in-log';
// Phase 8C Tier 1 — critical injection / data-exposure rules
import { coreSecuritySqlInjectionConcat } from './core-security-sql-injection-concat';
import { coreSecurityPathTraversal } from './core-security-path-traversal';
import { coreSecurityWeakHash } from './core-security-weak-hash';
import { coreSecurityInsecureDeserialization } from './core-security-insecure-deserialization';
// Phase 8C Tier 2 — LLM safety + agent governance
import { vibeLlmOutputToSink } from './vibe-llm-output-to-sink';
import { vibeAgentToolNoConfirm } from './vibe-agent-tool-no-confirm';
// Phase 8C Tier 3 — TLS verification
import { coreSecurityTlsDisabled } from './core-security-tls-disabled';

export const PACK_NAME = 'core-security' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  coreSecurityEval,
  coreSecurityInnerhtmlAssignment,
  coreSecurityShellInjection,
  coreSecurityHardcodedSecretPattern,
  coreSecurityHardcodedPassword,
  vibeSsrfFetchUserInput,
  vibeDbWriteWithoutWhere,
  vibeDbSelectStarFromUserTable,
  vibeSecretInLog,
  vibePromptInjectionSink,
  vibeSupplyChainHallucinatedImport,
  coreSecurityPyEval,
  coreSecurityPyShellInjection,
  vibePySsrfFetchUserInput,
  vibePySecretInLog,
  coreSecuritySqlInjectionConcat,
  coreSecurityPathTraversal,
  coreSecurityWeakHash,
  coreSecurityInsecureDeserialization,
  vibeLlmOutputToSink,
  vibeAgentToolNoConfirm,
  coreSecurityTlsDisabled,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
