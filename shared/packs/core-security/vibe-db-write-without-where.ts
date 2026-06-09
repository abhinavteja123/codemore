/**
 * Rule: vibe-db-write-without-where
 *
 * Detects SQL `UPDATE …` and `DELETE FROM …` statements with NO `WHERE`
 * clause. This is the headline footgun in vibe-coded apps that ship
 * raw-SQL access (and not just the ORM-builder kind): the AI generates
 * a clean-looking `DELETE FROM users` and the next migration nukes the
 * whole table.
 *
 * Severity: BLOCKER.
 *   The blast radius is "all rows in this table". Catching this is the
 *   entire point of having a static analyzer in the loop before merge.
 *
 * Detection (regex over SQL-like content):
 *   - File language is `sql` -> scan the whole file.
 *   - For TS/JS, scan only template literals tagged with `sql` (`sql\`…\``)
 *     OR the contents of inline string literals passed to a method named
 *     `.query` / `.execute` / `.unsafe` / `.raw` (those are the canonical
 *     postgres-js / drizzle / kysely / supabase escape hatches). We
 *     deliberately do NOT scan arbitrary string literals — too noisy.
 *
 *   Statement-level matcher: split by `;` then for each segment:
 *     - `UPDATE <ident…> SET …` with no WHERE -> flag.
 *     - `DELETE FROM <ident…>` with no WHERE -> flag.
 *
 * Coverage gap (intentional):
 *   - `TRUNCATE TABLE` is not flagged — explicit truncation has a
 *     different ergonomic signature; we assume it's intentional.
 *   - `WHERE 1=1` and `WHERE TRUE` ARE technically have-a-where; they
 *     defeat this rule. A future `vibe-db-where-tautological` rule will
 *     cover that. For now they're left out to keep the matcher dumb.
 *   - Multi-statement strings split by string concatenation across files
 *     are not flagged.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import * as ts from 'typescript';

const UPDATE_RE     = /\bUPDATE\s+([A-Za-z_][A-Za-z0-9_."]*)\s+SET\b/i;
const DELETE_RE     = /\bDELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_."]*)/i;
const HAS_WHERE_RE  = /\bWHERE\b/i;
const RAW_QUERY_METHODS = new Set(['query', 'execute', 'unsafe', 'raw']);

function stripSqlCommentsPreservingPositions(content: string): string {
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

interface Hit {
  line: number;
  column: number;
  matchedPattern: 'update-without-where' | 'delete-without-where';
  table: string;
}

/**
 * Scan a SQL string starting at file offset `baseOffset`. Emits at most
 * one hit per statement.
 */
function scanSql(rawSql: string, fullContent: string, baseOffset: number): Hit[] {
  const sql = stripSqlCommentsPreservingPositions(rawSql);
  const hits: Hit[] = [];
  let pos = 0;
  // Split by `;`, tracking each segment's offset.
  for (const segment of sql.split(';')) {
    const segStart = pos;
    pos += segment.length + 1; // +1 for the `;`
    const trimmed = segment.trim();
    if (trimmed.length === 0) continue;
    if (HAS_WHERE_RE.test(trimmed)) continue;

    const u = UPDATE_RE.exec(trimmed);
    const d = DELETE_RE.exec(trimmed);
    if (!u && !d) continue;

    // Compute file-level offset for the statement
    const matchOffset = baseOffset + segStart + segment.search(/\S/);
    const fileLine = lineForOffset(fullContent, matchOffset);
    if (u) {
      hits.push({
        line: fileLine, column: 1,
        matchedPattern: 'update-without-where',
        table: u[1],
      });
    } else if (d) {
      hits.push({
        line: fileLine, column: 1,
        matchedPattern: 'delete-without-where',
        table: d[1],
      });
    }
  }
  return hits;
}

interface SqlSpan {
  /** Full SQL text. */
  text: string;
  /** Offset in the original file where the SQL text begins. */
  offset: number;
}

/**
 * Find every SQL string passed to known raw-query methods AND every
 * `sql\`…\`` tagged template in the file. We do NOT scan arbitrary
 * string literals — too noisy.
 */
function collectInlineSqlSpans(sf: ts.SourceFile): SqlSpan[] {
  const spans: SqlSpan[] = [];

  const visit = (n: ts.Node): void => {
    // `sql\`UPDATE …\``  — tagged template (postgres-js, drizzle, kysely)
    if (ts.isTaggedTemplateExpression(n)
        && ts.isIdentifier(n.tag) && n.tag.text === 'sql') {
      const tpl = n.template;
      if (ts.isNoSubstitutionTemplateLiteral(tpl)) {
        spans.push({ text: tpl.text, offset: tpl.getStart(sf) + 1 });
      } else if (ts.isTemplateExpression(tpl)) {
        // Just take the head + literal middles/tails; substitutions
        // can't be statically known. We still detect UPDATE/DELETE
        // structure in the surrounding literal text.
        const parts: string[] = [tpl.head.text];
        for (const span of tpl.templateSpans) parts.push(span.literal.text);
        spans.push({ text: parts.join(' '), offset: tpl.getStart(sf) + 1 });
      }
    }
    // .query(sql, ...) / .execute(sql, ...) / .unsafe(sql, ...) / .raw(sql, ...)
    if (ts.isCallExpression(n)
        && ts.isPropertyAccessExpression(n.expression)
        && ts.isIdentifier(n.expression.name)
        && RAW_QUERY_METHODS.has(n.expression.name.text)
        && n.arguments.length > 0) {
      const first = n.arguments[0];
      if (ts.isStringLiteralLike(first)) {
        spans.push({ text: first.text, offset: first.getStart(sf) + 1 });
      } else if (ts.isNoSubstitutionTemplateLiteral(first)) {
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

export const vibeDbWriteWithoutWhere: Rule = {
  id: 'vibe-db-write-without-where',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'experimental',
  languages: ['sql', 'typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'UPDATE / DELETE without a WHERE clause (touches every row in the table)',
  whyItMatters:
    'An `UPDATE users SET …` or `DELETE FROM users` with no WHERE clause rewrites or removes ' +
    'EVERY row in the table. In vibe-coded apps the AI cheerfully generates these statements ' +
    'when asked for a "clean" SQL example, and the developer pastes them into a migration. ' +
    'One run, one table gone. This is the highest-impact statically-detectable database bug; ' +
    'BLOCKER severity is deliberate.',
  citation: 'https://codemore.dev/rules/vibe-db-write-without-where',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];

    if (ctx.language === 'sql') {
      for (const hit of scanSql(ctx.content, ctx.content, 0)) {
        findings.push(makeFinding(ctx, hit));
      }
      return findings;
    }

    if (ctx.sourceFile) {
      for (const span of collectInlineSqlSpans(ctx.sourceFile)) {
        for (const hit of scanSql(span.text, ctx.content, span.offset)) {
          findings.push(makeFinding(ctx, hit));
        }
      }
    }
    return findings;
  },
};

function makeFinding(ctx: RuleContext, hit: Hit): RuleFinding {
  const kindLabel = hit.matchedPattern === 'update-without-where' ? 'UPDATE' : 'DELETE';
  return {
    evidence: {
      file: ctx.filePath,
      line: hit.line,
      column: hit.column,
      snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
      matchedPattern: hit.matchedPattern,
    },
    whyItMatters:
      `${kindLabel} against \`${hit.table}\` has no WHERE clause — this affects every row in ` +
      `the table. Run as written, it will rewrite or wipe the full table.`,
    suggestedFix: {
      type: 'code-patch',
      instructions:
        `Add a WHERE clause that scopes the operation to the intended subset:\n\n` +
        `  // wrong\n` +
        `  ${kindLabel} ${hit.table} ${hit.matchedPattern === 'update-without-where' ? 'SET archived = true' : ''};\n\n` +
        `  // right\n` +
        `  ${kindLabel} ${hit.table} ${hit.matchedPattern === 'update-without-where' ? 'SET archived = true' : ''} WHERE id = $1;\n\n` +
        `If the operation IS intentionally table-wide (e.g. a maintenance script), prefer\n` +
        `\`TRUNCATE TABLE ${hit.table}\` — its semantics are explicit, and this rule deliberately\n` +
        `does not flag truncate. Always suppress with a Reason comment so the next reader knows.`,
      verificationCriteria: [
        'The statement is scoped by a WHERE clause OR replaced with explicit TRUNCATE',
        'Re-scan reports vibe-db-write-without-where resolved for this file',
      ],
    },
  };
}
