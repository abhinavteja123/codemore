/**
 * Rule: vibe-py-cookie-missing-flags
 *
 * Python analogue of `vibe-cookie-missing-flags`. Detects Flask / Django
 * `set_cookie(...)` calls that are missing `secure=True`, `httponly=True`,
 * or a `samesite` value. Both frameworks default all three OFF, and
 * AI-generated auth code almost never sets them.
 *
 * Patterns:
 *   resp.set_cookie('session_id', token)                       ← all three missing
 *   response.set_cookie('sessionid', token, secure=False)      ← explicitly off
 *
 * Not flagged:
 *   resp.set_cookie('sid', t, secure=True, httponly=True, samesite='Lax')
 *   resp.set_cookie('sid', t, **cookie_opts)                   ← flags invisible, skip
 *
 * Severity: MAJOR. Missing `secure` = token sniffable over HTTP; missing
 * `httponly` = any XSS exfiltrates the session; missing `samesite` = CSRF.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree, PythonNode } from '../../rules/pythonAst';

interface FieldNode {
  childForFieldName: (k: string) => PythonNode | null;
}

function calleeAttribute(call: PythonNode): string | null {
  const callee = (call as unknown as FieldNode).childForFieldName('function');
  if (!callee || callee.type !== 'attribute') return null;
  const attr = (callee as unknown as FieldNode).childForFieldName('attribute');
  return attr ? (attr as { text: string }).text : null;
}

/** Truthiness of a keyword value at the "is this flag actually on" level. */
function valueSatisfies(valueText: string): boolean {
  return valueText !== 'False' && valueText !== 'None';
}

export const vibePyCookieMissingFlags: Rule = {
  id: 'vibe-py-cookie-missing-flags',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.8,
  title: 'set_cookie call is missing secure / httponly / samesite',
  whyItMatters:
    'Flask and Django `set_cookie()` default `secure`, `httponly`, and `samesite` OFF. ' +
    'A session cookie set without them is sniffable over any HTTP fallback, readable by any ' +
    'XSS payload, and attached to cross-site requests (CSRF). AI-generated login handlers ' +
    'routinely emit the bare two-argument form.',
  citation: 'https://codemore.tech/rules/vibe-py-cookie-missing-flags',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    function inspect(call: PythonNode): void {
      if (calleeAttribute(call) !== 'set_cookie') return;
      const args = (call as unknown as FieldNode).childForFieldName('arguments');
      if (!args) return;

      const seen = new Map<string, string>();
      for (let i = 0; i < (args.childCount as number); i++) {
        const a = args.child(i) as PythonNode | null;
        if (!a) continue;
        // `**opts` — flags may be supplied by the caller; can't see them.
        if (a.type === 'dictionary_splat') return;
        if (a.type !== 'keyword_argument') continue;
        const name = (a as unknown as FieldNode).childForFieldName('name');
        const value = (a as unknown as FieldNode).childForFieldName('value');
        if (name && value) {
          seen.set((name as { text: string }).text.toLowerCase(), (value as { text: string }).text);
        }
      }

      const missing: string[] = [];
      for (const kw of ['httponly', 'secure', 'samesite']) {
        const v = seen.get(kw);
        if (v === undefined || !valueSatisfies(v)) {
          missing.push(kw === 'samesite' ? "samesite='Lax'" : `${kw}=True`);
        }
      }
      if (missing.length === 0) return;

      const pos = (call as { startPosition: { row: number; column: number } }).startPosition;
      const line = pos.row + 1;
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: pos.column + 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: `cookie-missing:${missing.length}`,
        },
        whyItMatters:
          `This set_cookie call is missing: ${missing.join(', ')}. Set each before deploying.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Add the missing flags to the set_cookie call:\n\n` +
            `  resp.set_cookie(\n` +
            `      'session_id', token,\n` +
            `      secure=True,        # only sent over HTTPS\n` +
            `      httponly=True,      # invisible to JS / XSS\n` +
            `      samesite='Lax',     # not attached to cross-site POSTs\n` +
            `  )\n\n` +
            `In development, condition "secure" on your environment so localhost still works:\n` +
            `  secure=not app.debug`,
          verificationCriteria: [
            'set_cookie includes secure=True (or environment-conditional in dev)',
            'set_cookie includes httponly=True',
            "set_cookie includes samesite='Lax' or 'Strict'",
            'Re-scan reports vibe-py-cookie-missing-flags resolved for this line',
          ],
        },
      });
    }

    function walk(n: PythonNode): void {
      if (n.type === 'call') inspect(n);
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (c) walk(c);
      }
    }
    walk(tree.rootNode);
    return findings;
  },
};
