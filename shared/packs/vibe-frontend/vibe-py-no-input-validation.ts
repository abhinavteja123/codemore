/**
 * Rule: vibe-py-no-input-validation
 *
 * Python analogue of `vibe-no-input-validation`. Flags state-changing
 * Flask / FastAPI route handlers that read raw request input
 * (`request.json`, `request.get_json()`, `request.form`, `request.args`,
 * `request.values`, `request.data`, `await request.json()`) in a file
 * that imports no recognised schema validator (pydantic, marshmallow,
 * cerberus, wtforms / flask_wtf, voluptuous, trafaret, flask_restful's
 * reqparse, DRF serializers).
 *
 * FastAPI handlers that take a Pydantic model parameter never read the
 * raw request — they're clean by construction and never match.
 *
 * Severity: MAJOR — same calibration as the TS rule: tutorial code
 * legitimately ships without strict validation.
 *
 * Coverage gap (intentional, mirrors the TS rule):
 *   - An import is treated as evidence of intent; "imported marshmallow
 *     but never called .load()" is a known false negative.
 *   - Test files are skipped entirely (they define throwaway routes).
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import {
  isPyTestFilePath,
  iterDecoratedFunctions,
  parseRouteDecorators,
} from '../../rules/pythonHelpers';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// `import pydantic` / `from marshmallow import Schema` / etc.
const VALIDATOR_IMPORT_RE =
  /(?:^|\n)\s*(?:import|from)\s+(?:pydantic|marshmallow|cerberus|wtforms|flask_wtf|voluptuous|trafaret|flask_restful|rest_framework)\b/;

// Raw request-input reads inside a handler body.
const RAW_INPUT_RE =
  /\brequest\.(?:json\b|get_json\s*\(|form\b|args\b|values\b|data\b)|await\s+request\.(?:json|form|body)\s*\(/;

export const vibePyNoInputValidation: Rule = {
  id: 'vibe-py-no-input-validation',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'State-changing route reads raw request input without a schema validator',
  whyItMatters:
    'A POST / PUT / PATCH / DELETE handler that reads `request.json` / `request.form` / ' +
    '`request.args` without running the value through pydantic / marshmallow / cerberus / ' +
    'wtforms is open to injection, shape-confusion, and mass-assignment attacks. Vibe-coded ' +
    'Flask apps almost always go straight from `request.get_json()` to the DB call.',
  citation: 'https://codemore.tech/rules/vibe-py-no-input-validation',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    if (isPyTestFilePath(ctx.filePath)) return [];
    if (VALIDATOR_IMPORT_RE.test(ctx.content)) return [];

    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    for (const fn of iterDecoratedFunctions(tree)) {
      const route = parseRouteDecorators(fn.decorators);
      if (!route.isRoute) continue;
      if (!route.methods.some(m => STATE_CHANGING.has(m))) continue;
      if (!RAW_INPUT_RE.test(fn.fullText)) continue;

      findings.push({
        evidence: {
          file: ctx.filePath,
          line: fn.line,
          column: fn.column,
          snippet: (ctx.lines[fn.line - 1] ?? '').trim(),
          matchedPattern: 'py-route-raw-input-no-validator',
        },
        whyItMatters:
          `Route handler \`${fn.name}\` handles ${route.methods.filter(m => STATE_CHANGING.has(m)).join(', ')} ` +
          `and reads raw request input, but this file imports no schema validator ` +
          `(pydantic / marshmallow / cerberus / wtforms / voluptuous). Unvalidated input flows ` +
          `straight into your handler and DB calls.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Define a schema and validate the payload before using it. Example with pydantic:\n\n` +
            `  from pydantic import BaseModel, ValidationError\n\n` +
            `  class CreatePost(BaseModel):\n` +
            `      title: str\n` +
            `      is_public: bool = False\n\n` +
            `  @app.route('/posts', methods=['POST'])\n` +
            `  def create_post():\n` +
            `      try:\n` +
            `          payload = CreatePost.model_validate(request.get_json())\n` +
            `      except ValidationError:\n` +
            `          return {'error': 'invalid input'}, 400\n` +
            `      # use payload — typed, sanitised\n\n` +
            `On FastAPI, declare the model as the handler parameter instead of reading ` +
            `\`await request.json()\` — the framework then validates for you.`,
          verificationCriteria: [
            'The route runs user input through a recognised schema validator before use',
            'Re-scan reports vibe-py-no-input-validation resolved for this file',
          ],
        },
      });
    }
    return findings;
  },
};
