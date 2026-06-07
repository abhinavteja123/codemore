/**
 * vibe-supabase pack
 *
 * Detectors for the foot-guns that show up in vibe-coded Supabase apps.
 * Backed by the Lovable CVE-2025-48757 incident class and the 50-app
 * audit ("70% had RLS off").
 *
 * Add a rule:
 *   1. Implement it as a module under this directory.
 *   2. Import + append it to PACK_RULES below.
 *   3. Ship a TP/FP fixture pair and a docs page (CONTRIBUTING-RULES.md).
 */

import type { Rule } from '../../rules/Rule';
import { vibeSupabaseRlsDisabled } from './vibe-supabase-rls-disabled';
import { vibeSupabaseRlsPermissive } from './vibe-supabase-rls-permissive';

export const PACK_NAME = 'vibe-supabase' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  vibeSupabaseRlsDisabled,
  vibeSupabaseRlsPermissive,
];

/** Convenience hook for the registry bootstrap. */
export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
