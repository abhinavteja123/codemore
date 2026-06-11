/* codemore-ignore-file: vibe-xss-dangerously-set */
/**
 * Rule: vibe-xss-dangerously-set
 *
 * Detects React's `dangerouslySetInnerHTML={{ __html: <expr> }}` in TSX/JSX.
 *
 * The attribute is named "dangerously" for a reason: any string passed
 * through it bypasses React's escaping and lands in the DOM as live HTML.
 * Veracode's 2025/26 study found 86% of AI-generated samples failed to
 * defend against XSS — and dangerouslySetInnerHTML is the single most
 * common React-side sink that AI tools reach for when prompted to
 * "render this HTML string".
 *
 * Severity model:
 *   - BLOCKER  : the value is dynamic (variable / function call / prop /
 *                template literal with interpolation). Even with a sanitiser
 *                we cannot prove safety from a regex, so default to blocking.
 *   - MAJOR    : the value is a plain string literal. Still bad design (the
 *                HTML should be JSX), but the immediate XSS risk is lower.
 *
 * Coverage gap (documented in docs page):
 *   - We do not detect sanitisers (DOMPurify, sanitize-html). A future
 *     v1.1 will downgrade severity when a sanitiser call wraps the source.
 *   - The matcher is regex-only; deeply nested attribute syntax may slip
 *     past. A JSX-AST path lands when more frontend rules need it.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findDangerouslySetInnerHTML } from '../../rules/astHelpers';

// Match dangerouslySetInnerHTML={{ __html: <expression> }}.
// The value group uses non-greedy [\s\S]+? so template-literal interpolation
// (with `${...}`) and small inline object/function-call expressions still
// match. The trailing `\s*\}\s*\}` anchors termination on the OUTER `}}`.
// Known limitation: a value containing literal `}}` (extremely rare in
// JSX-attribute context) terminates the match early. Documented in the
// rule's docs page.
const DANGEROUS_SET_RE =
  /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*(?<value>[\s\S]+?)\s*\}\s*\}/g;

const STRING_LITERAL_RE = /^\s*(['"`])(.*)\1\s*$/s;
const TEMPLATE_INTERP_RE = /\$\{/;
const PURE_SVG_RE = /^\s*['"]<svg\b[^]*<\/svg>\s*['"]\s*$/i;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Classify the captured value expression.
 *
 *   'literal-string'  — `'<b>x</b>'` or `"<i>x</i>"` (no template interpolation)
 *   'static-svg'      — pure inline SVG string literal, lower priority
 *   'dynamic'         — anything else: identifier, call, member, template w/ ${}
 */
function classifyValueExpression(raw: string): 'literal-string' | 'static-svg' | 'dynamic' {
  const trimmed = raw.trim();
  if (PURE_SVG_RE.test(trimmed)) return 'static-svg';
  const lit = STRING_LITERAL_RE.exec(trimmed);
  if (lit) {
    // Template literal containing ${...} counts as dynamic.
    if (lit[1] === '`' && TEMPLATE_INTERP_RE.test(lit[2])) return 'dynamic';
    return 'literal-string';
  }
  return 'dynamic';
}

export const vibeXssDangerouslySet: Rule = {
  id: 'vibe-xss-dangerously-set',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  // React-family only. `frameworkDetect` collapses `next` -> 'nextjs' (and
  // drops the bare `react` label), so we list both — apps that import React
  // directly emit 'react', apps using Next emit 'nextjs', and rarer setups
  // (remix, expo) emit those labels.
  targetFrameworks: ['react', 'nextjs', 'remix', 'expo'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'dangerouslySetInnerHTML opens an XSS sink',
  whyItMatters:
    'React deliberately names this attribute "dangerously" — anything passed via __html ' +
    'bypasses React\'s escaping and lands in the DOM as live HTML. Veracode\'s 2025/26 ' +
    'study found 86% of AI-generated samples failed XSS defenses, and dangerouslySetInnerHTML ' +
    'is the single React API most often used as the unsafe sink. Even a one-off "render this ' +
    'markdown to HTML" prompt that flows here is enough to ship a stored-XSS bug.',
  citation: 'https://codemore.dev/rules/vibe-xss-dangerously-set',

  detect(ctx: RuleContext): RuleFinding[] {
    // Quick reject — most TS/JS files don't contain JSX at all.
    if (!/dangerouslySetInnerHTML/.test(ctx.content)) return [];

    const buildFinding = (
      kind: 'literal-string' | 'static-svg' | 'dynamic',
      line: number,
      column: number,
      valueText: string,
    ): RuleFinding => {
      const snippet = (ctx.lines[line - 1] ?? '').trim();
      const severity: 'BLOCKER' | 'MAJOR' = kind === 'dynamic' ? 'BLOCKER' : 'MAJOR';
      const confidence = kind === 'dynamic' ? 0.9 : 0.75;
      const why =
        kind === 'dynamic'
          ? `Value source: \`${valueText.trim().slice(0, 80)}\` — dynamic. Any path that lets a user contribute to this expression is a stored-XSS bug.`
          : kind === 'static-svg'
          ? `Value source: inline SVG literal. Lower urgency, but inline SVG should be a React component (Icon library or imported svg), not injected HTML.`
          : `Value source: string literal. Still a design smell — render the markup as JSX instead so React's escaping protects you when the source later becomes dynamic.`;
      return {
        severity,
        confidence,
        evidence: {
          file: ctx.filePath,
          line,
          column,
          snippet,
          matchedPattern: `dangerously-set-${kind}`,
        },
        whyItMatters: why,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Replace \`dangerouslySetInnerHTML\` with normal JSX that React will escape, or wrap ` +
            `the input with a sanitiser:\n\n` +
            `  // a) Prefer JSX:\n` +
            `  <div>{message}</div>\n\n` +
            `  // b) If the source is rich text from a trusted markdown pipeline:\n` +
            `  import DOMPurify from 'dompurify';\n` +
            `  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />\n\n` +
            (kind === 'dynamic'
              ? `Because the source is dynamic, the sanitiser path is required if you keep the attribute. ` +
                `Otherwise refactor to plain JSX.`
              : `Because the source is a literal, refactoring to JSX is straightforward — paste the markup as JSX nodes.`),
          verificationCriteria: [
            'The file no longer contains a dangerouslySetInnerHTML attribute, OR',
            'The __html expression is wrapped in DOMPurify.sanitize(...) or an equivalent sanitiser call',
            'Re-scan reports vibe-xss-dangerously-set resolved for this file',
          ],
        },
      };
    };

    // AST path — exact JSX attribute traversal. Eliminates the
    // "JSX-as-string in a fixture/test file" false-positive class entirely.
    if (ctx.sourceFile) {
      const findings: RuleFinding[] = [];
      for (const hit of findDangerouslySetInnerHTML(ctx.sourceFile)) {
        findings.push(buildFinding(hit.valueKind, hit.line, hit.column, hit.valueText));
      }
      return findings;
    }

    // Regex fallback. Only used when the source file failed to parse.
    const findings: RuleFinding[] = [];
    DANGEROUS_SET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DANGEROUS_SET_RE.exec(ctx.content)) !== null) {
      const value = m.groups?.value ?? '';
      const kind = classifyValueExpression(value);
      const line = lineForOffset(ctx.content, m.index);
      findings.push(buildFinding(kind, line, 1, value));
    }
    return findings;
  },
};
