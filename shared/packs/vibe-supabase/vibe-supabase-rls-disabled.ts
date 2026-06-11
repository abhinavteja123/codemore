/**
 * Rule: vibe-supabase-rls-disabled
 *
 * Detects CREATE TABLE statements that are not paired with
 * ENABLE ROW LEVEL SECURITY in the same file.
 *
 * Coverage gap (intentional, documented in docs page):
 *   - We do NOT scan sibling migration files. A table created in
 *     001_init.sql and enabled in 002_security.sql will be flagged.
 *     Cross-file resolution lands when the registry exposes a
 *     project-wide context API.
 *   - Temp tables, table-valued function bodies, and tables created
 *     dynamically from PL/pgSQL are skipped.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const CREATE_TABLE_RE =
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?))/gi;

const SKIP_TEMP_RE =
  /\bCREATE\s+(?:TEMP|TEMPORARY)\s+TABLE\b/i;

const ALTER_ENABLE_RLS_RE =
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?))\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

/** Strip optional schema qualifier ("public.foo" → "foo"). */
function unqualify(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : name;
}

/** Collect lower-cased, unqualified table names with RLS enabled in this file. */
function collectRlsEnabledTables(content: string): Set<string> {
  const enabled = new Set<string>();
  ALTER_ENABLE_RLS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ALTER_ENABLE_RLS_RE.exec(content)) !== null) {
    const name = m[1] ?? m[2];
    if (name) enabled.add(unqualify(name).toLowerCase());
  }
  return enabled;
}

/** Resolve the 1-indexed line number for a character offset in content. */
function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

export const vibeSupabaseRlsDisabled: Rule = {
  id: 'vibe-supabase-rls-disabled',
  version: '1.0.0',
  pack: 'vibe-supabase',
  lifecycle: 'beta',
  languages: ['sql'],
  // Restored in Phase 1.5: framework detection now populates ctx.frameworks
  // from package.json deps + structural signals (supabase/migrations dir).
  // Non-Supabase projects scanning plain SQL won't trigger this rule.
  targetFrameworks: ['supabase'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'Supabase table missing RLS policy',
  whyItMatters:
    'The Supabase anon key is shipped to the client. Any reader of the bundled JS can use it ' +
    'to query tables that have no RLS policy. CVE-2025-48757 affected 170+ Lovable apps via this ' +
    'class of bug in a single weekend; an audit of 50 vibe-coded apps found 70% had RLS off.',
  citation: 'https://codemore.dev/rules/vibe-supabase-rls-disabled',

  detect(ctx: RuleContext): RuleFinding[] {
    if (ctx.extension !== '.sql') return [];

    const enabled = collectRlsEnabledTables(ctx.content);
    const findings: RuleFinding[] = [];

    CREATE_TABLE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CREATE_TABLE_RE.exec(ctx.content)) !== null) {
      const matchStart = m.index;
      const matchText = m[0];

      if (SKIP_TEMP_RE.test(matchText)) continue;

      const rawName = m[1] ?? m[2];
      if (!rawName) continue;
      const tableName = unqualify(rawName).toLowerCase();
      if (enabled.has(tableName)) continue;

      const line = lineForOffset(ctx.content, matchStart);
      const snippet = ctx.lines[line - 1] ?? matchText;

      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: snippet.trim(),
          matchedPattern: 'create-table-without-rls',
        },
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Add the following to this migration, immediately after the CREATE TABLE for "${rawName}":\n\n` +
            `  ALTER TABLE ${rawName} ENABLE ROW LEVEL SECURITY;\n\n` +
            `Then add at least one CREATE POLICY scoped to the rows each user should see. ` +
            `Do NOT use \`USING (true)\` — that is equivalent to having no policy.`,
          verificationCriteria: [
            `Migration file contains "ALTER TABLE ${rawName} ENABLE ROW LEVEL SECURITY" (case-insensitive)`,
            `At least one CREATE POLICY exists for ${rawName}`,
            'Re-scan reports vibe-supabase-rls-disabled resolved for this file',
          ],
        },
      });
    }

    return findings;
  },
};
