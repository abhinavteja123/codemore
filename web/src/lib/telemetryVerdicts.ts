/**
 * Verdict derivation for the beta→stable promotion flywheel.
 *
 * Maps each per-rule telemetry ping entry to a `rule_events` row
 * (migration 007). Kept free of Next.js imports so the root mocha
 * suite can test it directly (same pattern as suggestionService).
 *
 *   vote 'down'                          → fp
 *   vote 'up' OR context 'resolved'      → tp
 *   context 'suppressed'                 → suppressed
 *   plain 'fired' with no vote           → no verdict (not stored)
 *
 * Privacy: inputs are already past the endpoint's strict Zod schema —
 * only rule id / severity / confidence / vote / context ever reach here.
 */

export interface RulePing {
  id: string;
  vote?: 'up' | 'down';
  context?: 'fired' | 'suppressed' | 'resolved';
}

export type Verdict = 'tp' | 'fp' | 'suppressed';

export interface RuleEventRow {
  rule_id: string;
  verdict: Verdict;
  tool_version: string;
}

export function deriveVerdict(ping: RulePing): Verdict | null {
  if (ping.vote === 'down') return 'fp';
  if (ping.vote === 'up' || ping.context === 'resolved') return 'tp';
  if (ping.context === 'suppressed') return 'suppressed';
  return null;
}

/** Fan a ping's rule array out into insertable rule_events rows. */
export function deriveRuleEvents(rules: RulePing[], toolVersion: string): RuleEventRow[] {
  const rows: RuleEventRow[] = [];
  for (const r of rules) {
    const verdict = deriveVerdict(r);
    if (verdict) rows.push({ rule_id: r.id, verdict, tool_version: toolVersion });
  }
  return rows;
}
