/**
 * Rule: vibe-db-select-star-from-user-table
 *
 * Detects `SELECT * FROM <user-table>` against tables likely to hold
 * sensitive user data. Two problems at once:
 *
 *   1. Overfetch: the handler hauls every column, including columns the
 *      response shouldn't return (hashes, internal flags, support
 *      annotations) — even if the JSON shape drops them, they're now
 *      sitting in memory of every server worker.
 *   2. PII bleed: when columns get added later (`stripe_id`, `last_ip`,
 *      `refresh_token`), the handler quietly starts returning them too.
 *
 * Severity: MAJOR. Not a "panic now" bug, but a guaranteed footgun once
 * the schema evolves. AI-generated code reaches for `SELECT *` reflexively.
 *
 * Detection:
 *   - File language `sql`: scan the whole file.
 *   - TS/JS: scan `sql\`…\`` tagged templates and arguments to known
 *     raw-query methods (.query / .execute / .unsafe / .raw).
 *   - Regex: `SELECT * FROM <table>` where `<table>` is in a
 *     curated list of PII-bearing names:
 *       users, profiles, accounts, customers, sessions, orders,
 *       memberships, subscriptions, billing, payments, identities.
 *
 * Coverage gap (intentional):
 *   - Aliased columns (`SELECT u.* FROM users u`) are caught too.
 *   - `SELECT count(*)`, `EXISTS(SELECT * …)`, and EXPLAIN/EXPLAIN
 *     ANALYZE forms are NOT flagged — they don't return rows the
 *     application code would propagate.
 *   - We don't track CTE table names or sub-selects.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const USER_TABLES = [
  'users', 'profiles', 'accounts', 'customers', 'sessions', 'orders',
  'memberships', 'subscriptions', 'billing', 'payments', 'identities',
  'user_profiles', 'user_accounts',
];
const USER_TABLE_SET = new Set(USER_TABLES.map(t => t.toLowerCase()));

// Match `SELECT *` (or `SELECT alias.*`, optionally followed by more
// columns) followed eventually by `FROM <ident>`. The `*` MUST appear
// in the projection position — directly after SELECT / DISTINCT / ALL,
// optionally prefixed by an alias. This stops us from accidentally
// matching across an outer `SELECT id FROM posts WHERE EXISTS (SELECT *
// FROM users)` (the outer SELECT has no `*` and the inner one is
// independently detected with the right `left` context).
const SELECT_FROM_RE =
  /\bSELECT\s+(?:DISTINCT\s+|ALL\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?\*(?:\s*,\s*[\s\S]*?)?\s+FROM\s+([A-Za-z_][A-Za-z0-9_."]*)\b/gi;
const EXISTS_STAR_RE = /\bEXISTS\s*\(\s*SELECT\s+\*/i;

const RAW_QUERY_METHODS = new Set(['query', 'execute', 'unsafe', 'raw']);

function stripSqlComments(content: string): string {
  let out = content.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function stripTableQuotes(name: string): string {
  let s = name;
  // Drop schema prefix (`public.users` -> `users`).
  const dot = s.lastIndexOf('.');
  if (dot >= 0) s = s.slice(dot + 1);
  // Drop surrounding quotes.
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.toLowerCase();
}

interface Hit {
  line: number;
  column: number;
  table: string;
}

function scanSql(rawSql: string, fullContent: string, baseOffset: number): Hit[] {
  const sql = stripSqlComments(rawSql);
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  SELECT_FROM_RE.lastIndex = 0;
  while ((m = SELECT_FROM_RE.exec(sql)) !== null) {
    // Skip `EXISTS(SELECT * …)` shape by checking ~16 chars to the left
    // for an unclosed `EXISTS (`. Cheap; works for the common case.
    const left = sql.slice(Math.max(0, m.index - 16), m.index);
    if (EXISTS_STAR_RE.test(left + 'SELECT *')) continue;

    const table = stripTableQuotes(m[1]);
    if (!USER_TABLE_SET.has(table)) continue;

    const fileLine = lineForOffset(fullContent, baseOffset + m.index);
    hits.push({ line: fileLine, column: 1, table });
  }
  return hits;
}

interface SqlSpan { text: string; offset: number; }

function collectInlineSqlSpans(sf: ts.SourceFile): SqlSpan[] {
  const spans: SqlSpan[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(n)
        && ts.isIdentifier(n.tag) && n.tag.text === 'sql') {
      const tpl = n.template;
      if (ts.isNoSubstitutionTemplateLiteral(tpl)) {
        spans.push({ text: tpl.text, offset: tpl.getStart(sf) + 1 });
      } else if (ts.isTemplateExpression(tpl)) {
        const parts: string[] = [tpl.head.text];
        for (const span of tpl.templateSpans) parts.push(span.literal.text);
        spans.push({ text: parts.join(' '), offset: tpl.getStart(sf) + 1 });
      }
    }
    if (ts.isCallExpression(n)
        && ts.isPropertyAccessExpression(n.expression)
        && RAW_QUERY_METHODS.has(n.expression.name.text)
        && n.arguments.length > 0) {
      const first = n.arguments[0];
      if (ts.isStringLiteralLike(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
        spans.push({ text: first.text, offset: first.getStart(sf) + 1 });
      } else if (ts.isTemplateExpression(first)) {
        const parts: string[] = [first.head.text];
        for (const span of first.templateSpans) parts.push(span.literal.text);
        spans.push({ text: parts.join(' '), offset: first.getStart(sf) + 1 });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return spans;
}

export const vibeDbSelectStarFromUserTable: Rule = {
  id: 'vibe-db-select-star-from-user-table',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['sql', 'typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.8,
  title: 'SELECT * FROM <user-table> overfetches and bleeds PII as schema grows',
  whyItMatters:
    '`SELECT *` against a table that holds user data (users / profiles / accounts / sessions / ' +
    'orders / payments / …) is two bugs in one. (a) The handler hauls every column right now, ' +
    'including columns the response shouldn\'t return. (b) When the schema grows — and it ' +
    'will — newly added columns like `stripe_id`, `refresh_token`, or `last_ip` start flowing ' +
    'through silently. List the columns you actually need; let schema growth fail loudly.',
  citation: 'https://codemore.tech/rules/vibe-db-select-star-from-user-table',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    const emit = (hit: Hit) => {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `select-star-${hit.table}`,
        },
        whyItMatters:
          `SELECT * against the \`${hit.table}\` table returns every column, including any ` +
          `sensitive fields the schema picks up later. Replace with an explicit column list.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Replace the wildcard with the exact columns the handler needs:\n\n` +
            `  -- wrong\n` +
            `  SELECT * FROM ${hit.table} WHERE id = $1;\n\n` +
            `  -- right\n` +
            `  SELECT id, email, display_name FROM ${hit.table} WHERE id = $1;\n\n` +
            `If you genuinely need every column (admin-only export, internal job), wrap with ` +
            `a Reason comment and suppress.`,
          verificationCriteria: [
            'The query lists explicit columns instead of *',
            'Re-scan reports vibe-db-select-star-from-user-table resolved for this file',
          ],
        },
      });
    };

    if (ctx.language === 'sql') {
      for (const hit of scanSql(ctx.content, ctx.content, 0)) emit(hit);
      return findings;
    }
    if (ctx.sourceFile) {
      for (const span of collectInlineSqlSpans(ctx.sourceFile)) {
        for (const hit of scanSql(span.text, ctx.content, span.offset)) emit(hit);
      }
    }
    return findings;
  },
};
