/**
 * Rule: core-security-py-eval
 *
 * Python analogue of `core-security-eval`. Detects `eval(...)` and
 * `exec(...)` calls in production code. Both interpret a string as
 * Python code and are the canonical RCE sink.
 *
 * Severity: BLOCKER. An eval() with anything attacker-influenced is game
 * over.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findEvalExecCalls } from '../../rules/pythonHelpers';

export const coreSecurityPyEval: Rule = {
  id: 'core-security-py-eval',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.95,
  title: '`eval` / `exec` call interprets a string as Python code',
  whyItMatters:
    '`eval()` and `exec()` parse and execute their string argument as Python code. With any ' +
    'attacker-influenced data flowing in — a config field, a request body, an LLM response — ' +
    'this is arbitrary code execution at the privilege of the running process.',
  citation: 'https://codemore.tech/rules/core-security-py-eval',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findEvalExecCalls(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `${hit.callee}-call`,
        },
        whyItMatters:
          `\`${hit.callee}(...)\` runs its first argument as code. Replace with a JSON parse + ` +
          `dispatch table, or use \`ast.literal_eval()\` for safe primitive parsing only.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two safer patterns depending on the use case:\n\n` +
            `  # (a) Parse data, don't execute code.\n` +
            `  import json\n` +
            `  data = json.loads(payload)\n\n` +
            `  # (b) If you really need to parse literal Python (ints / lists / dicts):\n` +
            `  import ast\n` +
            `  data = ast.literal_eval(payload)   # rejects any non-literal`,
          verificationCriteria: [
            'eval/exec is replaced with json.loads, ast.literal_eval, or a finite dispatch table',
            'Re-scan reports core-security-py-eval resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
