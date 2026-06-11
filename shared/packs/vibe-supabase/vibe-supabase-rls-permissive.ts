/**
 * Rule: vibe-supabase-rls-permissive
 *
 * Detects CREATE POLICY statements whose USING or WITH CHECK clause is
 * literally `true` (any case, any whitespace, optional inner parens).
 *
 * `USING (true)` is the most common "I enabled RLS but accidentally turned
 * it off again" pattern in vibe-coded Supabase apps. An audit of 50 such
 * apps found 24% had inverted-or-permissive policies of this shape.
 *
 * Coverage gap (documented in docs page):
 *   - We do not interpret SQL expressions. `USING (1=1)`, `USING (NOT false)`,
 *     and other tautologies are not yet caught. v1.1 will expand the matcher.
 *   - Comments are stripped before matching (both `-- line` and block forms),
 *     so a comment mentioning `USING (true)` will not fire.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const POLICY_STMT_RE = /\bCREATE\s+POLICY\b[\s\S]*?;/gi;
// Match USING (true) with whitespace tolerance and an optional inner paren.
const PERMISSIVE_USING_RE      = /\bUSING\s*\(\s*\(?\s*TRUE\s*\)?\s*\)/gi;
const PERMISSIVE_WITH_CHECK_RE = /\bWITH\s+CHECK\s*\(\s*\(?\s*TRUE\s*\)?\s*\)/gi;

/**
 * Replace SQL comments with same-length whitespace so character offsets
 * and line numbers stay valid for the snippet/line lookup downstream.
 */
function stripSqlCommentsPreservingPositions(content: string): string {
  let out = content.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

/** Extract the policy name from a CREATE POLICY ... statement, if present. */
function extractPolicyName(stmt: string): string | null {
  const m = stmt.match(/\bCREATE\s+POLICY\s+(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))/i);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

export const vibeSupabaseRlsPermissive: Rule = {
  id: 'vibe-supabase-rls-permissive',
  version: '1.0.0',
  pack: 'vibe-supabase',
  lifecycle: 'beta',
  languages: ['sql'],
  // Phase 1.5: scoped to supabase projects (package.json deps or
  // supabase/migrations/ dir present). Non-Supabase SQL won't trigger.
  targetFrameworks: ['supabase'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'RLS policy is effectively permissive (USING true / WITH CHECK true)',
  whyItMatters:
    'A policy with `USING (true)` lets every row through the read filter; `WITH CHECK (true)` ' +
    'lets every row through the write filter. Either is functionally equivalent to having no RLS — ' +
    'the table appears protected to anyone reading the migration but is publicly accessible at ' +
    'runtime. An audit of 50 vibe-coded apps found 24% had permissive RLS of this shape.',
  citation: 'https://codemore.dev/rules/vibe-supabase-rls-permissive',

  detect(ctx: RuleContext): RuleFinding[] {
    if (ctx.language !== 'sql') return [];

    const sanitized = stripSqlCommentsPreservingPositions(ctx.content);
    const findings: RuleFinding[] = [];

    POLICY_STMT_RE.lastIndex = 0;
    let stmtMatch: RegExpExecArray | null;

    while ((stmtMatch = POLICY_STMT_RE.exec(sanitized)) !== null) {
      const stmtStart = stmtMatch.index;
      const stmtText = stmtMatch[0];
      const policyName = extractPolicyName(stmtText) ?? '(unnamed policy)';

      // Scan USING (true) occurrences within the statement.
      PERMISSIVE_USING_RE.lastIndex = 0;
      let clauseMatch: RegExpExecArray | null;
      while ((clauseMatch = PERMISSIVE_USING_RE.exec(stmtText)) !== null) {
        const absOffset = stmtStart + clauseMatch.index;
        findings.push(buildFinding(ctx, absOffset, policyName, 'USING (true)'));
      }

      // Scan WITH CHECK (true) occurrences within the statement.
      PERMISSIVE_WITH_CHECK_RE.lastIndex = 0;
      while ((clauseMatch = PERMISSIVE_WITH_CHECK_RE.exec(stmtText)) !== null) {
        const absOffset = stmtStart + clauseMatch.index;
        findings.push(buildFinding(ctx, absOffset, policyName, 'WITH CHECK (true)'));
      }
    }

    return findings;
  },
};

function buildFinding(
  ctx: RuleContext,
  offset: number,
  policyName: string,
  clauseKind: 'USING (true)' | 'WITH CHECK (true)',
): RuleFinding {
  const line = lineForOffset(ctx.content, offset);
  const snippet = (ctx.lines[line - 1] ?? '').trim();
  const pattern = clauseKind === 'USING (true)' ? 'using-true' : 'with-check-true';

  return {
    evidence: {
      file: ctx.filePath,
      line,
      column: 1,
      snippet,
      matchedPattern: `permissive-${pattern}`,
    },
    whyItMatters:
      `Policy "${policyName}" uses \`${clauseKind}\`, which permits every row. ` +
      `This makes the table publicly ${clauseKind.startsWith('USING') ? 'readable' : 'writable'} ` +
      `via the Supabase anon key, regardless of the RLS-enabled status.`,
    suggestedFix: {
      type: 'code-patch',
      instructions:
        `Replace \`${clauseKind}\` with an expression that scopes rows to the authenticated user. ` +
        `Typical Supabase patterns:\n\n` +
        `  USING (user_id = auth.uid())\n` +
        `  USING (user_email = auth.jwt() ->> 'email')\n` +
        `  USING (tenant_id IN (SELECT tenant_id FROM members WHERE user_id = auth.uid()))\n\n` +
        `If the policy genuinely needs to allow all rows (e.g. a public-read table), document that ` +
        `intent and suppress the rule on that line:\n\n` +
        `  -- codemore-ignore-next-line: vibe-supabase-rls-permissive`,
      verificationCriteria: [
        `Policy "${policyName}" no longer contains \`${clauseKind}\` (case-insensitive)`,
        'The replacement expression references auth.uid(), auth.jwt(), or another per-user scoping mechanism',
        'Re-scan reports vibe-supabase-rls-permissive resolved for this policy',
      ],
    },
  };
}
