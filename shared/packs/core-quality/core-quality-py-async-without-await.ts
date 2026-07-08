/**
 * Rule: core-quality-py-async-without-await
 *
 * Python analogue of `core-quality-async-without-await`. Detects
 * `async def` functions whose body contains no `await` expression
 * (skipping nested function/lambda bodies — a nested function's
 * `await` doesn't satisfy the outer's contract).
 *
 * Severity: MAJOR.
 *   In FastAPI / Starlette / asyncio code, an async function with no
 *   await blocks the event loop for the duration of its body — and the
 *   developer almost certainly meant to await something. Either there's
 *   a missing await on a coroutine call, or the function shouldn't be
 *   async at all.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findAsyncWithoutAwait } from '../../rules/pythonHelpers';

export const coreQualityPyAsyncWithoutAwait: Rule = {
  id: 'core-quality-py-async-without-await',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.85,
  title: '`async def` function with no `await` in its body',
  whyItMatters:
    'An `async def` with no `await` inside is almost always a missing-await bug: the developer ' +
    'meant `await something()` but wrote `something()`. The coroutine returns a Coroutine object ' +
    'that nobody schedules, the side effect silently never happens, and FastAPI / asyncio carry ' +
    'on as if the work succeeded. Either add the missing `await` or drop the `async` keyword.',
  citation: 'https://codemore.tech/rules/core-quality-py-async-without-await',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findAsyncWithoutAwait(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `async-def-no-await`,
        },
        whyItMatters:
          `\`async def ${hit.name}\` has no \`await\` inside. Either an \`await\` is missing ` +
          `on a coroutine call, or the function should be a plain \`def\`.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options for \`${hit.name}\`:\n\n` +
            `  # (a) Add the missing await.\n` +
            `  async def ${hit.name}():\n` +
            `      result = await fetch_user()   # ← was: fetch_user()\n\n` +
            `  # (b) Drop the async keyword — the body is synchronous.\n` +
            `  def ${hit.name}():\n` +
            `      ...`,
          verificationCriteria: [
            `\`${hit.name}\` either awaits something OR is no longer declared async`,
            'Re-scan reports core-quality-py-async-without-await resolved for this function',
          ],
        },
      });
    }
    return findings;
  },
};
