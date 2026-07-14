/**
 * Rule: core-security-sql-injection-concat
 *
 * Detects the classical SQL-injection pattern: a string built by
 * concatenating (or interpolating) user input directly into a query
 * passed to a DB exec API.
 *
 * Patterns (TS / JS):
 *   db.query("SELECT * FROM users WHERE id = " + req.body.id)
 *   db.query(`SELECT * FROM users WHERE id = ${req.body.id}`)
 *   connection.execute("UPDATE x SET y = '" + name + "'")
 *
 * Patterns (Python):
 *   cursor.execute("SELECT * FROM u WHERE id = " + user_id)
 *   cursor.execute(f"SELECT * FROM u WHERE id = {user_id}")
 *   cursor.execute("SELECT * FROM u WHERE id = %s" % user_id)
 *
 * Severity: BLOCKER. SQL injection remains OWASP A03; AI-generated code
 * exhibits the concat pattern at a high baseline rate (per Symbiotic +
 * Veracode 2025-26 data).
 *
 * Fix template: parameterised query (`?` / `$1` / `%s` placeholders).
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// JS/TS call sites: <ident>.<query|execute|exec|raw|prepare>( ... )
// where the FIRST argument concatenates a string literal with +<expr>
// OR uses a template literal with ${...} interpolation. Capture the
// call site and decide via the captured argument's shape.
const JS_CALL_RE = /\b(?:db|conn|connection|client|pool|prisma|knex|trx|cursor|sql)\b[\w.]*\.(?:query|execute|exec|raw|prepare|unsafe)\s*\(([^;]+?)\)/g;
// Python call sites: <ident>.execute( <arg> ) — we look for either a
// concat string ('...' + x), an f-string ( f'...{x}...' ), or
// percent-format ( '...' % x ).
const PY_CALL_RE = /\b(?:cur|cursor|conn|connection|db|session|c)\b[\w.]*\.(?:execute|executemany|raw)\s*\(([^;]+?)\)/g;

// Inside the captured arg: does it look like a sink we care about?
const JS_SUSPECT_RE = /(?:["'][^"'\n]*["']\s*\+\s*\w)|(?:\w\s*\+\s*["'])|(?:`[^`]*\$\{[^}]+\}[^`]*`)/;
const PY_SUSPECT_RE = /(?:["'][^"'\n]*["']\s*\+\s*\w)|(?:f["'][^"'\n]*\{[^}]+\}[^"'\n]*["'])|(?:["'][^"'\n]*["']\s*%\s*\w)/;

function stripJsCommentsAndStrings(content: string): string {
  // We DON'T strip strings here — the rule needs to see the concat. Just
  // strip comments so we don't false-positive on documented patterns.
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

function stripPyComments(content: string): string {
  return content.replace(/(^|[^\\])#[^\n]*/g, (_m, lead) => lead + ' '.repeat(_m.length - lead.length));
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const coreSecuritySqlInjectionConcat: Rule = {
  id: 'core-security-sql-injection-concat',
  version: '1.1.1',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'SQL query built by string concatenation or interpolation',
  whyItMatters:
    'Concatenating or f-string-interpolating a value into a SQL query is the classical injection ' +
    'pattern (OWASP A03). If any concatenated value is reachable from user input — req.body, ' +
    'route param, form, URL query — an attacker can rewrite the query. The fix is parameterised ' +
    'queries: every driver supports `?` / `$1` / `%s` placeholders that bind values out of band.',
  citation: 'https://codemore.tech/rules/core-security-sql-injection-concat',

  detect(ctx: RuleContext): RuleFinding[] {
    const isPy = ctx.language === 'python';
    const sanitized = isPy ? stripPyComments(ctx.content) : stripJsCommentsAndStrings(ctx.content);
    const callRe = isPy ? PY_CALL_RE : JS_CALL_RE;
    const suspectRe = isPy ? PY_SUSPECT_RE : JS_SUSPECT_RE;
    const findings: RuleFinding[] = [];
    callRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(sanitized)) !== null) {
      const arg = m[1] ?? '';
      if (!suspectRe.test(arg)) continue;
      const line = lineForOffset(ctx.content, m.index);
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: 'sql-concat-or-interpolation',
        },
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Replace the concatenated query with a parameterised one:\n\n' +
            '  // Node.js (mysql2):\n' +
            "  db.query('SELECT * FROM users WHERE id = ?', [userId])\n\n" +
            '  # Python (sqlite3 / psycopg / asyncpg):\n' +
            "  cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))\n\n" +
            'If you must build the query dynamically (variable column list), ' +
            'validate the value against an allowlist of column names FIRST, ' +
            'never against user-supplied data.',
          verificationCriteria: [
            'The query string contains only placeholders (`?` / `$1` / `%s`), no concatenation/interpolation',
            'Values are passed via the driver\'s parameter array',
            'Re-scan reports core-security-sql-injection-concat resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
