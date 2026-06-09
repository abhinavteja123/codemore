/**
 * Rule: vibe-prompt-injection-sink
 *
 * Emerging class: AI-generated agents that feed an LLM's text response
 * directly into a code-execution or DB-query sink. The attacker crafts a
 * prompt that returns `'); DROP TABLE users; --` (or `process.exit()`,
 * or any executable string), and the surrounding `eval(...)` / `sql`
 * template / `exec(...)` does the rest.
 *
 * Severity: BLOCKER. The sinks themselves are already game-over (eval
 * with anything attacker-controlled). The LLM-output flow adds a fresh
 * delivery channel that few audits look for.
 *
 * Detection (AST, file-only, per function-like body):
 *   - Sinks:
 *       eval(...) / new Function(...)
 *       child_process exec(...) / execSync(...) / spawn(...) / spawnSync(...)
 *       sql`…${x}…` tagged template
 *       .query(<dynamic string>) / .execute(<dynamic string>) etc. when
 *         the argument is a template literal with interpolation.
 *   - Tainted (the LLM-response side):
 *       PropertyAccessExpression chain that mentions one of:
 *         choices, message, completion, completions, generations,
 *         response, output, text, content       (intermediate segments)
 *       Identifier whose name matches:
 *         /^(?:llm|ai|model|assistant|completion|gen|chat).*(?:Response|Result|Text|Content|Message|Output)$/i
 *         or a one-hop assignment from a recognised LLM call:
 *         openai.chat.completions.create / openai.completions.create /
 *         anthropic.messages.create / model.generateContent /
 *         generativeModel.generateContent / chat(...) returning a string-shaped value.
 *
 * Coverage gap (intentional):
 *   - Multi-hop taint isn't traced (one assignment hop only).
 *   - Manually JSON-parsed responses (`const cmd = JSON.parse(response.content).cmd`)
 *     aren't traced through the JSON parse boundary.
 *   - Sanitisation wrappers (`sanitizeShell(x)`) aren't recognised in v1;
 *     suppress with a Reason comment if you have a safe wrapper.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const LLM_PATH_SEGMENTS = new Set([
  'choices', 'message', 'completion', 'completions', 'generations',
  'response', 'output', 'text', 'content',
]);

const LLM_NAME_RE = /^(?:llm|ai|model|assistant|completion|gen|chat).*(?:response|result|text|content|message|output)$/i;

const LLM_CREATION_PATHS: ReadonlyArray<RegExp> = [
  /\bopenai\.(?:chat\.)?completions\.create\b/,
  /\banthropic\.messages\.create\b/,
  /\b(?:generativeModel|model)\.generateContent\b/,
  /\bgemini\.generateContent\b/,
  /\bchat\.create\b/,
];

const CHILD_PROCESS_SINKS = new Set(['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync']);

const CHILD_PROCESS_ROOTS = new Set([
  'cp', 'childProcess', 'child_process',
]);

function fileImportsChildProcess(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteralLike(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (spec === 'child_process' || spec === 'node:child_process') return true;
    }
  }
  return false;
}

type TaintMap = Map<string, string>;

function chainContainsLlmSegment(expr: ts.Expression): string | null {
  let cur: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
    if (ts.isPropertyAccessExpression(cur) && LLM_PATH_SEGMENTS.has(cur.name.text)) {
      return cur.name.text;
    }
    cur = cur.expression as ts.Expression;
  }
  return null;
}

function isLlmCreationCall(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const calleeText = expr.expression.getText(sf);
  return LLM_CREATION_PATHS.some(re => re.test(calleeText));
}

function isAwaitOfLlm(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (ts.isAwaitExpression(expr)) return isLlmCreationCall(expr.expression, sf);
  return isLlmCreationCall(expr, sf);
}

function classifySinkArg(arg: ts.Expression, taintMap: TaintMap, sf: ts.SourceFile): string | null {
  let cur: ts.Expression = arg;
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression as ts.Expression;
  }
  // Static literal — safe.
  if (ts.isStringLiteralLike(cur)) return null;
  if (ts.isNoSubstitutionTemplateLiteral(cur)) return null;
  // PropertyAccess chain mentioning a known LLM segment.
  const segHit = chainContainsLlmSegment(cur);
  if (segHit) return `chain:${segHit}`;
  // Identifier whose name matches LLM_NAME_RE OR was assigned from an LLM call.
  if (ts.isIdentifier(cur)) {
    if (LLM_NAME_RE.test(cur.text)) return `name:${cur.text}`;
    const taint = taintMap.get(cur.text);
    if (taint) return taint;
  }
  // Binary string concat — either side tainted.
  if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return classifySinkArg(cur.left, taintMap, sf) ?? classifySinkArg(cur.right, taintMap, sf);
  }
  // Template with interpolation — any tainted substitution.
  if (ts.isTemplateExpression(cur)) {
    for (const span of cur.templateSpans) {
      const inner = classifySinkArg(span.expression, taintMap, sf);
      if (inner) return `template:${inner}`;
    }
  }
  return null;
}

function collectTaintInFunction(body: ts.Node, sf: ts.SourceFile): TaintMap {
  const taint: TaintMap = new Map();
  const visit = (n: ts.Node): void => {
    // const X = await openai.chat.completions.create(...)
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      if (isAwaitOfLlm(n.initializer, sf)) {
        taint.set(n.name.text, `llm-call`);
      } else if (chainContainsLlmSegment(n.initializer)) {
        taint.set(n.name.text, `chain:${chainContainsLlmSegment(n.initializer)}`);
      }
    }
    // const { content } = response; / const { content } = response.choices[0].message
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isObjectBindingPattern(n.name)) {
      const initText = n.initializer.getText(sf);
      const initOriginatesFromLlm =
        chainContainsLlmSegment(n.initializer) !== null
        || isLlmCreationCall(n.initializer, sf)
        || /\b(?:llm|ai|model|assistant|completion|gen|chat).*?(?:Response|Result|Text|Content|Message|Output)\b/i.test(initText);
      if (initOriginatesFromLlm) {
        for (const elt of n.name.elements) {
          if (ts.isIdentifier(elt.name)) taint.set(elt.name.text, `destructured-from-llm`);
        }
      }
    }
    // X = await openai.chat.completions.create(...)
    if (ts.isBinaryExpression(n)
        && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(n.left)
        && isAwaitOfLlm(n.right, sf)) {
      taint.set(n.left.text, `llm-call`);
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return taint;
}

interface SinkHit {
  line: number;
  column: number;
  sink: string;
  source: string;
}

function findSinks(sf: ts.SourceFile): SinkHit[] {
  const hits: SinkHit[] = [];

  function scanBody(body: ts.Node, taint: TaintMap): void {
    const visit = (n: ts.Node): void => {
      // eval(...)
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'eval') {
        if (n.arguments.length > 0) {
          const reason = classifySinkArg(n.arguments[0], taint, sf);
          if (reason) push(n, 'eval', reason);
        }
      }
      // new Function('return ' + x)
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function') {
        for (const arg of n.arguments ?? []) {
          const reason = classifySinkArg(arg, taint, sf);
          if (reason) { push(n, 'new-Function', reason); break; }
        }
      }
      // child_process exec / spawn / execFile / execSync / spawnSync.
      // Distinguishing this from `regex.exec(content)` is critical — `exec`
      // is also a string-regex method. We require either the BARE form
      // (`exec(cmd)` — only valid if the project imports child_process) OR
      // the method form rooted at a known child_process alias.
      if (ts.isCallExpression(n)) {
        let sinkName: string | null = null;
        let allow = false;
        if (ts.isIdentifier(n.expression) && CHILD_PROCESS_SINKS.has(n.expression.text)) {
          sinkName = n.expression.text;
          allow = fileImportsChildProcess(sf);
        } else if (ts.isPropertyAccessExpression(n.expression)
                && CHILD_PROCESS_SINKS.has(n.expression.name.text)) {
          sinkName = n.expression.name.text;
          const obj = n.expression.expression;
          if (ts.isIdentifier(obj) && CHILD_PROCESS_ROOTS.has(obj.text)) {
            allow = true;
          }
        }
        if (sinkName && allow && n.arguments.length > 0) {
          const reason = classifySinkArg(n.arguments[0], taint, sf);
          if (reason) push(n, sinkName, reason);
        }
      }
      // sql`...${x}...` tagged template
      if (ts.isTaggedTemplateExpression(n)
          && ts.isIdentifier(n.tag) && n.tag.text === 'sql'
          && ts.isTemplateExpression(n.template)) {
        for (const span of n.template.templateSpans) {
          const reason = classifySinkArg(span.expression, taint, sf);
          if (reason) { push(n, 'sql-template', reason); break; }
        }
      }
      // .query(<tainted-template>) — the template-with-substitution variant.
      if (ts.isCallExpression(n)
          && ts.isPropertyAccessExpression(n.expression)
          && (n.expression.name.text === 'query'
           || n.expression.name.text === 'execute'
           || n.expression.name.text === 'unsafe'
           || n.expression.name.text === 'raw')
          && n.arguments.length > 0
          && ts.isTemplateExpression(n.arguments[0])) {
        for (const span of (n.arguments[0] as ts.TemplateExpression).templateSpans) {
          const reason = classifySinkArg(span.expression, taint, sf);
          if (reason) { push(n, `${n.expression.name.text}-template`, reason); break; }
        }
      }
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
          || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
          || ts.isConstructorDeclaration(n)) {
        return;
      }
      ts.forEachChild(n, visit);
    };

    function push(node: ts.Node, sink: string, source: string): void {
      const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push({ line: lc.line + 1, column: lc.character + 1, sink, source });
    }

    visit(body);
  }

  // Top-level pass (no in-function taint context).
  scanBody(sf, new Map());

  // Per-function pass.
  const walkFunctions = (n: ts.Node): void => {
    const isFn = ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
              || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
              || ts.isConstructorDeclaration(n);
    if (isFn) {
      const body = (n as ts.FunctionLikeDeclaration).body;
      if (body && ts.isBlock(body)) {
        const taint = collectTaintInFunction(body, sf);
        scanBody(body, taint);
      }
    }
    ts.forEachChild(n, walkFunctions);
  };
  walkFunctions(sf);

  return hits;
}

export const vibePromptInjectionSink: Rule = {
  id: 'vibe-prompt-injection-sink',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.8,
  title: 'LLM response flows into a code-execution or SQL sink',
  whyItMatters:
    'An AI agent that feeds an LLM\'s text directly into eval / Function / exec / sql is one ' +
    'crafted prompt away from arbitrary code execution. Attackers can manipulate the model ' +
    'via inputs you don\'t fully control (RAG sources, scraped pages, user chat messages) ' +
    'into emitting `\'); DROP TABLE users; --` or `process.exit()` — and the sink does the ' +
    'rest. This is an emerging class as agentic apps proliferate; the cost of getting it ' +
    'wrong is the same as any other RCE / SQL injection.',
  citation: 'https://codemore.dev/rules/vibe-prompt-injection-sink',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findSinks(ctx.sourceFile)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `${hit.sink}-from-${hit.source}`,
        },
        whyItMatters:
          `\`${hit.sink}\` is called with a value the rule recognised as LLM-sourced ` +
          `(\`${hit.source}\`). An adversarial prompt can produce arbitrary code / SQL / shell ` +
          `text here and have it executed verbatim.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Never pass LLM output to eval / Function / exec / sql unchanged.\n\n` +
            `  // (a) Parse the output as JSON and route through a tiny dispatch table:\n` +
            `  const cmd = JSON.parse(response.content);\n` +
            `  const ACTIONS = { foo, bar, baz } as const;\n` +
            `  const fn = ACTIONS[cmd.action];\n` +
            `  if (!fn) return new Response('Unknown action', { status: 400 });\n` +
            `  await fn(cmd.args);\n\n` +
            `  // (b) For SQL, use parameterised queries — never interpolate model output\n` +
            `  // into a template literal:\n` +
            `  await db.query('SELECT * FROM items WHERE id = $1', [parsedId]);\n\n` +
            `  // (c) For shell, pass argv arrays — never a single concatenated command:\n` +
            `  await execFile('git', ['log', '--oneline', parsedRev]);\n\n` +
            `If the value is constrained to a safe enum at the LLM tool-spec level (e.g. via ` +
            `function-calling with a JSON schema) AND validated by the receiving code, ` +
            `suppress with a Reason comment.`,
          verificationCriteria: [
            'The LLM output is parsed into a typed structure and dispatched via a finite table',
            'OR the SQL uses parameter binding instead of string interpolation',
            'OR the shell call uses argv arrays instead of a single command string',
            'Re-scan reports vibe-prompt-injection-sink resolved for this call site',
          ],
        },
      });
    }
    return findings;
  },
};
