/**
 * Rule: core-security-innerhtml-assignment
 *
 * Detects `<expr>.innerHTML = <expr>` (and the equivalent .outerHTML and
 * insertAdjacentHTML) in vanilla TS/JS code. This is the framework-free
 * counterpart to vibe-xss-dangerously-set: the same XSS sink, but for
 * code that touches the DOM directly without React.
 *
 * Severity:
 *   - Dynamic value source -> BLOCKER (variable / prop / call / template
 *     with interpolation). Any path that lets a user contribute to the
 *     value is a stored-XSS bug.
 *   - String literal source -> MAJOR. No immediate XSS, but the markup
 *     should be expressed as createElement / append nodes, not parsed
 *     HTML — keeping innerHTML around invites the next maintainer to
 *     pipe a variable through it.
 *
 * Coverage gap:
 *   - We do not detect sanitisers (DOMPurify.sanitize). v1.1 lands AST
 *     awareness and downgrades when the source is wrapped.
 *   - Regex-only — escaped quotes and string concatenation across lines
 *     may slip past.
 */

/* codemore-ignore-file: core-security-innerhtml-assignment */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// `something.innerHTML = ...;` or `.outerHTML = ...;`
// We capture the right-hand side up to a `;` or end of line, non-greedy,
// then classify it.
const INNERHTML_ASSIGN_RE =
  /\.(innerHTML|outerHTML)\s*=\s*([^;\n]+?)\s*[;\n]/g;
// insertAdjacentHTML('beforebegin', <expr>) — both args, second is the HTML.
const INSERT_ADJACENT_RE =
  /\.insertAdjacentHTML\s*\(\s*['"][^'"]+['"]\s*,\s*([^)\n]+?)\s*\)/g;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function stripJsComments(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

function classifyExpression(raw: string): 'literal-string' | 'dynamic' {
  const trimmed = raw.trim();
  // String literal: starts and ends with the SAME quote AND has no
  // template interpolation if it's a backtick.
  const m = /^(['"`])(.*)\1$/s.exec(trimmed);
  if (!m) return 'dynamic';
  if (m[1] === '`' && /\$\{/.test(m[2])) return 'dynamic';
  return 'literal-string';
}

export const coreSecurityInnerhtmlAssignment: Rule = {
  id: 'core-security-innerhtml-assignment',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'innerHTML / outerHTML / insertAdjacentHTML assignment',
  whyItMatters:
    'Direct DOM HTML injection. Anything assigned to .innerHTML is parsed and inserted as ' +
    'live HTML, bypassing the structured-DOM safety React or your templating engine would ' +
    'normally give you. This is the vanilla-JS counterpart to React\'s dangerouslySetInnerHTML ' +
    'and accounts for a large share of stored-XSS reports in non-framework code. Even a fix that ' +
    'looks tidy today becomes a vulnerability the next time someone pipes a variable through it.',
  citation: 'https://codemore.dev/rules/core-security-innerhtml-assignment',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripJsComments(ctx.content);
    const findings: RuleFinding[] = [];

    INNERHTML_ASSIGN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INNERHTML_ASSIGN_RE.exec(sanitized)) !== null) {
      const kind = m[1];   // 'innerHTML' or 'outerHTML'
      const rhs = m[2];
      const expressionKind = classifyExpression(rhs);
      const line = lineForOffset(ctx.content, m.index);
      findings.push(buildFinding(ctx, line, kind, expressionKind, rhs));
    }

    INSERT_ADJACENT_RE.lastIndex = 0;
    while ((m = INSERT_ADJACENT_RE.exec(sanitized)) !== null) {
      const rhs = m[1];
      const expressionKind = classifyExpression(rhs);
      const line = lineForOffset(ctx.content, m.index);
      findings.push(buildFinding(ctx, line, 'insertAdjacentHTML', expressionKind, rhs));
    }

    return findings;
  },
};

function buildFinding(
  ctx: RuleContext,
  line: number,
  sinkKind: string,
  expressionKind: 'literal-string' | 'dynamic',
  rhsPreview: string,
): RuleFinding {
  const snippet = (ctx.lines[line - 1] ?? '').trim();
  return {
    severity: expressionKind === 'dynamic' ? 'BLOCKER' : 'MAJOR',
    confidence: expressionKind === 'dynamic' ? 0.9 : 0.7,
    evidence: {
      file: ctx.filePath,
      line,
      column: 1,
      snippet,
      matchedPattern: `${sinkKind}-${expressionKind}`,
    },
    whyItMatters:
      `Sink: \`.${sinkKind}\`. Value source: \`${rhsPreview.slice(0, 80).trim()}\` — ${expressionKind}. ` +
      (expressionKind === 'dynamic'
        ? 'Any path that lets a user contribute to this expression is a stored-XSS bug.'
        : 'No immediate XSS, but representing markup as a literal HTML string is a design smell — express it as DOM nodes (createElement / append) so future maintainers cannot accidentally pipe a variable through this sink.'),
    suggestedFix: {
      type: 'code-patch',
      instructions:
        'Pick the structured replacement that matches your case:\n\n' +
        '  - Setting plain text?      element.textContent = value;\n' +
        '  - Inserting trusted HTML?  build nodes with document.createElement(...) and append.\n' +
        '  - Rich text from a trusted markdown pipeline? Sanitise first:\n' +
        '      element.innerHTML = DOMPurify.sanitize(html);\n\n' +
        '  - Already using a framework? Render the value through it (e.g. JSX / Lit / Vue ' +
        'template) instead of escaping to .innerHTML.',
      verificationCriteria: [
        'The file no longer contains an unconditional .innerHTML / .outerHTML / .insertAdjacentHTML assignment to a dynamic value',
        'OR the assigned value is wrapped in DOMPurify.sanitize() (or equivalent sanitiser)',
        'OR the assignment is suppressed inline with a comment explaining the trust assumption',
        'Re-scan reports core-security-innerhtml-assignment resolved for this file',
      ],
    },
  };
}
