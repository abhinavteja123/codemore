/**
 * Rule: core-bugs-loose-equality
 *
 * Detects `==` and `!=` (loose equality) where `===` / `!==` (strict
 * equality) is almost always what the author meant. The classic JS bug
 * class: `0 == '0'` is true, `[] == false` is true, `'' == 0` is true.
 * A regex over text is enough for the common cases because the operator
 * is unambiguous in tokenized source.
 *
 * Severity: MINOR. Each instance is a subtle bug waiting to be triggered
 * by edge-case inputs; the fix is mechanical (add an =), so leaving it
 * unflagged is pure technical debt.
 *
 * Coverage gap:
 *   - We do not catch the `Object.is(x, y)` vs `x === y` distinction;
 *     both pass.
 *   - Comments and string literals are stripped before matching, so
 *     example code in docs strings does not fire.
 *   - JSX expression `a == b` inside attribute braces fires the same
 *     as expression-context `==`.
 */

/* codemore-ignore-file: core-bugs-loose-equality */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Loose `==` / `!=`. Negative lookbehind excludes part of `===` / `!==`.
// Negative lookahead excludes the third `=` of `===`.
const LOOSE_EQ_RE = /(?<![=!])(==|!=)(?!=)/g;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Strip comments + string literals, preserve offsets. */
function stripCommentsAndStrings(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

export const coreBugsLooseEquality: Rule = {
  id: 'core-bugs-loose-equality',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MINOR',
  defaultConfidence: 0.95,
  title: 'Loose equality (== / !=) where strict (=== / !==) was meant',
  whyItMatters:
    '`==` and `!=` apply JavaScript\'s type-coercion rules, which produce a long list of ' +
    'surprising truths: `0 == \'0\'`, `\'\' == 0`, `[] == false`, `null == undefined`. ' +
    'Strict equality (`===` / `!==`) compares without coercion and is what the author ' +
    'almost always meant. AI-generated code reaches for `==` at a much higher rate than ' +
    'human-written code in modern style guides, so flagging it surfaces a systemic quality ' +
    'gap rather than one-off mistakes.',
  citation: 'https://codemore.tech/rules/core-bugs-loose-equality',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripCommentsAndStrings(ctx.content);
    const findings: RuleFinding[] = [];

    LOOSE_EQ_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LOOSE_EQ_RE.exec(sanitized)) !== null) {
      const op = m[1];
      const replacement = op === '==' ? '===' : '!==';
      const line = lineForOffset(ctx.content, m.index);
      const snippet = (ctx.lines[line - 1] ?? '').trim();

      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet,
          matchedPattern: op === '==' ? 'loose-equals' : 'loose-not-equals',
        },
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Replace \`${op}\` with \`${replacement}\` on this line. ` +
            `If you specifically need null-or-undefined equality (the one legitimate use of \`==\`), ` +
            `write it as \`x ${replacement === '===' ? '===' : '!=='} null\` (TypeScript ` +
            `narrows both null and undefined when compared with strict null) or use the ` +
            `nullish-coalescing operator \`x ?? fallback\`.`,
          verificationCriteria: [
            `The line no longer uses \`${op}\``,
            `Behavior remains correct for the actual input shapes (run the tests touching this file)`,
            'Re-scan reports core-bugs-loose-equality resolved for this line',
          ],
        },
      });
    }

    return findings;
  },
};
