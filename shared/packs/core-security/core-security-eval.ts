/**
 * Rule: core-security-eval
 *
 * Detects `eval(...)` and `new Function(<string args>)` — the two dynamic
 * code-execution sinks that show up in nearly every shipped XSS / RCE
 * incident report. The Function constructor is a "stealth eval": it
 * compiles its string arguments into a function body, with the same
 * security profile as eval itself.
 *
 * Severity: BLOCKER. Modern JavaScript almost never needs either; when
 * it does (sandboxed REPL, vetted DSL evaluator), the suppression
 * directive is the right answer rather than turning the rule off.
 *
 * Coverage gap:
 *   - We do not distinguish "literal-string eval" from "user-input eval"
 *     because regex over text cannot prove what flows into the call.
 *     Both are flagged. Use the suppression directive when the input is
 *     verifiably trusted.
 *   - We do not catch indirect eval through aliases (`const e = eval; e(x)`)
 *     or computed property access (`window['eval'](x)`). A future AST-aware
 *     v1.1 will catch those.
 */

/* codemore-ignore-file: core-security-eval */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// `eval(` and `new Function(` as code, not as text inside a string literal.
// Strip line and block comments before matching to avoid flagging doc text.
const EVAL_RE = /\beval\s*\(/g;
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/g;

function stripJsCommentsPreservingPositions(content: string): string {
  // Strip line + block comments AND string literals: the rule needs to find
  // real eval() / new Function() calls, not pattern-matchers and docs that
  // mention the names. Without string stripping, legacy analyzers and tests
  // that contain `'eval('` or `/eval\(/` regex literals as DATA would
  // false-positive. Backtick stripping is conservative (preserves newlines).
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
  // Strip regex literals too — they're not call expressions.
  out = out.replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, m => ' '.repeat(m.length));
  return out;
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const coreSecurityEval: Rule = {
  id: 'core-security-eval',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.95,
  title: 'Dynamic code execution via eval() or new Function()',
  whyItMatters:
    'eval() and new Function() compile arbitrary strings into executable code. Any path that ' +
    'lets a user contribute to the string is a remote code execution bug. Modern JavaScript has ' +
    'a structured alternative for every legitimate use of eval (JSON.parse, AST libraries, ' +
    'vm.Script with a curated context, dynamic import()). If you genuinely need a sandboxed ' +
    'eval, the suppression directive plus a one-line comment is the right answer — not turning ' +
    'this rule off project-wide.',
  citation: 'https://codemore.tech/rules/core-security-eval',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripJsCommentsPreservingPositions(ctx.content);
    const findings: RuleFinding[] = [];

    for (const re of [EVAL_RE, NEW_FUNCTION_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sanitized)) !== null) {
        const line = lineForOffset(ctx.content, m.index);
        const snippet = (ctx.lines[line - 1] ?? '').trim();
        const kind = re === EVAL_RE ? 'eval-call' : 'new-function-constructor';

        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet,
            matchedPattern: kind,
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              kind === 'eval-call'
                ? 'Replace `eval(x)` with the structured equivalent for your case:\n\n' +
                  '  - Parsing JSON?           JSON.parse(x)\n' +
                  '  - Running a config DSL?   write a tiny parser, or use a vetted lib\n' +
                  '  - Loading a module?       dynamic import(x) (ESM) or require(x) (CJS)\n' +
                  '  - Sandboxed evaluation?   node:vm with an empty context, OR isolated-vm.\n\n' +
                  'If the input is provably trusted (e.g. a hardcoded literal from your own ' +
                  'config), suppress with a comment that explains why.'
                : 'Replace `new Function(...)` with the structured equivalent for your case:\n\n' +
                  '  - Building a callback at runtime?   factor it as a higher-order function.\n' +
                  '  - Loading user-defined code?        use node:vm or isolated-vm.\n\n' +
                  'If the bodies are hardcoded literals, an arrow function or named function is ' +
                  'always clearer than the Function constructor.',
            verificationCriteria: [
              `The file no longer contains a ${kind === 'eval-call' ? '`eval(' : '`new Function('} call`,
              'OR the call is suppressed inline with a comment explaining the trust assumption',
              'Re-scan reports core-security-eval resolved for this file',
            ],
          },
        });
      }
    }

    return findings;
  },
};
