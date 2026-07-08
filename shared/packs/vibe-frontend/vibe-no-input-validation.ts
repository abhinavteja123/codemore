/**
 * Rule: vibe-no-input-validation
 *
 * Flags state-changing route handlers that read user input (req.body /
 * req.json() / req.query / req.params) without going through a schema
 * validator — Zod, yup, joi, valibot, typia, ajv, superstruct, io-ts,
 * class-validator.
 *
 * Severity: MAJOR.
 *   Same reasoning as vibe-no-rate-limit and vibe-auth-missing-session-check:
 *   tutorial code legitimately ships without strict validation. Apps that
 *   want it gating CI can promote via .codemorerc.json.
 *
 * Detection (two-layer):
 *   - Project layer (cheap):
 *       projectIndex.hasValidatorLib === false
 *         → the project has installed NO validator library; we can be
 *           confident any route reading user input is unvalidated.
 *   - File layer (slightly stricter):
 *       Even if the project DOES have a validator, we still flag a route
 *       file that itself reads `req.body` / `await req.json()` / etc. but
 *       imports no validator package. (i.e. some files validate, this one
 *       doesn't.) This widens recall without blowing up false positives.
 *
 *   For a hit, the file must:
 *     1. Be in projectIndex.routeFiles.
 *     2. Handle POST / PUT / PATCH / DELETE.
 *     3. Have an `await req.json()` / `req.body.*` / `req.query.*` /
 *        `req.params.*` / `await req.formData()` reference.
 *     4. Not import any recognised validator package.
 *
 * Coverage gap (intentional):
 *   - We don't try to verify that the validator ACTUALLY runs against the
 *     input. The presence of an import is treated as evidence of intent;
 *     "imported zod but forgot to call parse()" is a known false-negative.
 *   - tRPC procedures (which validate via the schema attached to the
 *     procedure builder) aren't recognised as routes in v1.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const VALIDATOR_PACKAGES = new Set([
  'zod', 'yup', 'joi', 'valibot', 'typia', 'ajv', 'superstruct', 'io-ts',
  'class-validator', '@sinclair/typebox', 'runtypes',
]);

const REQUEST_OBJECT_NAMES = new Set(['req', 'request', 'ctx', 'context', 'event']);
const USER_INPUT_PROPS = new Set(['body', 'query', 'params', 'formData']);

/** Does any line of the source actually read user input? */
function fileReadsUserInput(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    // await req.json() / req.formData() / req.text()
    if (ts.isAwaitExpression(n)
        && ts.isCallExpression(n.expression)
        && ts.isPropertyAccessExpression(n.expression.expression)) {
      const obj = n.expression.expression.expression;
      const method = n.expression.expression.name.text;
      if (ts.isIdentifier(obj) && REQUEST_OBJECT_NAMES.has(obj.text)
          && (method === 'json' || method === 'formData' || method === 'text')) {
        found = true; return;
      }
    }
    // req.body / req.query / req.params / req.formData accessed as a prop
    if (ts.isPropertyAccessExpression(n)
        && ts.isIdentifier(n.expression)
        && REQUEST_OBJECT_NAMES.has(n.expression.text)
        && USER_INPUT_PROPS.has(n.name.text)) {
      found = true; return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function fileImportsValidator(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteralLike(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (VALIDATOR_PACKAGES.has(spec) || spec.startsWith('zod/')) return true;
    }
  }
  return false;
}

export const vibeNoInputValidation: Rule = {
  id: 'vibe-no-input-validation',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'State-changing route reads user input without a schema validator',
  whyItMatters:
    'A POST / PUT / PATCH / DELETE handler that touches `req.body`, `await req.json()`, ' +
    '`req.query`, or `req.params` without first running the value through Zod / yup / joi / ' +
    'valibot / typia / ajv / superstruct / io-ts / class-validator is open to injection, ' +
    'shape-confusion, and prototype-pollution attacks. Vibe-coded apps almost always skip ' +
    'this step because the AI moves straight from "parse" to "store". The fix is one import ' +
    '+ a `.parse(body)` call per route.',
  citation: 'https://codemore.tech/rules/vibe-no-input-validation',

  detect(ctx: RuleContext): RuleFinding[] {
    const idx = ctx.projectIndex;
    if (!idx || !ctx.sourceFile) return [];

    const me = idx.routeFiles.find(r => r.relPath === ctx.filePath);
    if (!me) return [];

    const isStateChanging = me.methods.some(m => STATE_CHANGING_METHODS.has(m));
    if (!isStateChanging) return [];

    if (!fileReadsUserInput(ctx.sourceFile)) return [];
    if (fileImportsValidator(ctx.sourceFile)) return [];

    return [{
      evidence: {
        file: ctx.filePath,
        line: 1,
        column: 1,
        snippet: (ctx.lines[0] ?? '').trim(),
        matchedPattern: `no-validator-${me.style}`,
      },
      whyItMatters:
        `This route reads user input (req.body / req.json() / req.query / req.params) but ` +
        `does not import any schema validator (zod / yup / joi / valibot / typia / ajv / ` +
        `superstruct / io-ts / class-validator). Unvalidated user input flows directly into ` +
        `your handler and DB calls — injection, shape confusion, prototype pollution.`,
      suggestedFix: {
        type: 'code-patch',
        instructions:
          `Add a schema and parse the input. Example with Zod:\n\n` +
          `  import { z } from 'zod';\n` +
          `  const Body = z.object({\n` +
          `    title: z.string().min(1).max(200),\n` +
          `    isPublic: z.boolean().optional(),\n` +
          `  });\n\n` +
          `  export async function POST(req: Request) {\n` +
          `    const parsed = Body.safeParse(await req.json());\n` +
          `    if (!parsed.success) {\n` +
          `      return new Response('Invalid input', { status: 400 });\n` +
          `    }\n` +
          `    // use parsed.data — typed, sanitised\n` +
          `  }\n\n` +
          `Pick the validator that matches your stack — the rule treats any ` +
          `of zod / yup / joi / valibot / typia / ajv / superstruct / io-ts / class-validator ` +
          `imports as evidence of intent.`,
        verificationCriteria: [
          'The route imports a recognised validator and runs the user input through it',
          'Re-scan reports vibe-no-input-validation resolved for this file',
        ],
      },
    }];
  },
};
