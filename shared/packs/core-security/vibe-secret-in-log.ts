/**
 * Rule: vibe-secret-in-log
 *
 * Detects `console.log` / `console.error` / Pino-style logger calls
 * whose arguments reference a variable whose name strongly suggests it
 * holds a secret (key, token, secret, password, credential, private,
 * jwt, bearer, auth, sessionId, apiKey, ...) — UNLESS the call wraps
 * the value in an obvious redaction helper.
 *
 * Severity: MAJOR.
 *   Logged secrets are the GitGuardian SOSS top finding — they end up in
 *   datadog, sentry, vercel logs, etc. The blast radius is "any team
 *   member with log access can read it." Not a "panic now" but a real
 *   data-leak channel; calibration via experimental lifecycle.
 *
 * Detection (AST, current file only):
 *   - Logger callees recognised: console.log / .info / .warn / .error /
 *     .debug, and bare `log(...)` / `logger.<level>(...)`, `pino.<level>(...)`,
 *     `winston.<level>(...)`.
 *   - For each argument expression:
 *     - Identifier `apiKey` / `accessToken` / `secret` / ... → flag.
 *     - PropertyAccessExpression whose property name ends in `Key`/`Token`
 *       /`Secret`/`Password`/`Credential` → flag.
 *     - Template literal whose substitutions include a tainted name → flag.
 *     - Argument that is `redact(x)` / `mask(x)` / `sanitize(x)` /
 *       `obfuscate(x)` / `hash(x)` is NEVER flagged (developer marked it
 *       as redacted).
 *
 * Coverage gap (intentional):
 *   - Dynamic property access (`obj[fieldName]`) where the name is unknown
 *     at parse time is NOT flagged.
 *   - We don't infer that `req.headers.authorization` contains a secret;
 *     callers should rename the binding if so.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const SECRET_NAME_RE = /(?:^|_)(?:secret|token|password|passwd|credential|private[_-]?key|bearer|jwt|api[_-]?key|access[_-]?key|session[_-]?id|client[_-]?secret|service[_-]?role)/i;
const SECRET_NAME_RE_END = /(?:secret|token|password|passwd|credential|key|bearer|jwt)$/i;

const LOG_LEVEL_NAMES = new Set(['log', 'info', 'warn', 'error', 'debug', 'fatal', 'trace']);
const LOG_OBJECT_NAMES = new Set(['console', 'logger', 'log', 'pino', 'winston']);

const REDACTION_FN_NAMES = new Set([
  'redact', 'mask', 'sanitize', 'sanitise', 'obfuscate', 'hash', 'truncate',
  'sanitizeerror', 'sanitizeError', 'redactsecret', 'redactSecret',
]);

function looksLikeSecretName(name: string): boolean {
  if (SECRET_NAME_RE.test(name)) return true;
  if (SECRET_NAME_RE_END.test(name)) return true;
  return false;
}

function isLoggerCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee) && callee.text.toLowerCase() === 'log') return true;
  if (ts.isPropertyAccessExpression(callee)) {
    if (!LOG_LEVEL_NAMES.has(callee.name.text)) return false;
    let obj: ts.Expression = callee.expression;
    // Strip optional chain head: `logger?.info(…)` — for simplicity we only
    // accept Identifier roots.
    while (ts.isPropertyAccessExpression(obj)) obj = obj.expression;
    if (ts.isIdentifier(obj)) {
      if (LOG_OBJECT_NAMES.has(obj.text.toLowerCase())) return true;
      // Common per-module loggers: `log.info(...)` where `log` is a local.
      if (obj.text === 'log' || obj.text === 'logger') return true;
    }
  }
  return false;
}

function isRedacted(arg: ts.Expression): boolean {
  if (ts.isCallExpression(arg)) {
    const callee = arg.expression;
    if (ts.isIdentifier(callee) && REDACTION_FN_NAMES.has(callee.text)) return true;
    if (ts.isPropertyAccessExpression(callee) && REDACTION_FN_NAMES.has(callee.name.text)) return true;
  }
  return false;
}

interface SecretHit {
  line: number;
  column: number;
  source: string;
}

function classifyArg(arg: ts.Expression, sf: ts.SourceFile): SecretHit | null {
  if (isRedacted(arg)) return null;

  if (ts.isIdentifier(arg) && looksLikeSecretName(arg.text)) {
    const lc = sf.getLineAndCharacterOfPosition(arg.getStart(sf));
    return { line: lc.line + 1, column: lc.character + 1, source: `identifier:${arg.text}` };
  }
  if (ts.isPropertyAccessExpression(arg) && looksLikeSecretName(arg.name.text)) {
    const lc = sf.getLineAndCharacterOfPosition(arg.getStart(sf));
    return { line: lc.line + 1, column: lc.character + 1, source: `property:${arg.name.text}` };
  }
  if (ts.isTemplateExpression(arg)) {
    for (const span of arg.templateSpans) {
      const inner = classifyArg(span.expression, sf);
      if (inner) return { ...inner, source: `template:${inner.source}` };
    }
  }
  // String concat with `+`: `'token=' + accessToken` — recursively
  // classify both sides.
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = classifyArg(arg.left, sf);
    if (l) return { ...l, source: `concat:${l.source}` };
    const r = classifyArg(arg.right, sf);
    if (r) return { ...r, source: `concat:${r.source}` };
  }
  // Object-literal shorthand / key-value: console.log({ apiKey }) / { apiKey: x }
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      // Shorthand: { apiKey } — the property IS the variable; no chance to wrap.
      if (ts.isShorthandPropertyAssignment(prop) && looksLikeSecretName(prop.name.text)) {
        const lc = sf.getLineAndCharacterOfPosition(prop.name.getStart(sf));
        return { line: lc.line + 1, column: lc.character + 1, source: `object-shorthand:${prop.name.text}` };
      }
      // Named: { apiKey: <expr> } — only flag if the value isn't already redacted.
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && looksLikeSecretName(prop.name.text)) {
        if (isRedacted(prop.initializer)) continue;
        const lc = sf.getLineAndCharacterOfPosition(prop.name.getStart(sf));
        return { line: lc.line + 1, column: lc.character + 1, source: `object-key:${prop.name.text}` };
      }
    }
  }
  return null;
}

export const vibeSecretInLog: Rule = {
  id: 'vibe-secret-in-log',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'Logger call references a variable named like a secret',
  whyItMatters:
    'Logged secrets are the canonical GitGuardian SOSS top finding: a stray `console.log({ ' +
    'apiKey })` leaks a token to Datadog / Sentry / Vercel logs / CloudWatch where every team ' +
    'member with log access can read it. AI-generated code reaches for `console.log(token)` ' +
    'during debugging and leaves it in. The fix is one line per call site: redact before log.',
  citation: 'https://codemore.dev/rules/vibe-secret-in-log',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];

    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && isLoggerCall(n)) {
        for (const arg of n.arguments) {
          const hit = classifyArg(arg, ctx.sourceFile!);
          if (hit) {
            findings.push({
              evidence: {
                file: ctx.filePath,
                line: hit.line,
                column: hit.column,
                snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
                matchedPattern: hit.source,
              },
              whyItMatters:
                `A logger call passes a value sourced from \`${hit.source}\`. If that ` +
                `binding holds a real secret it ends up in your log retention system — ` +
                `Datadog, Sentry, Vercel logs, CloudWatch. Wrap with a redaction helper ` +
                `(redact / mask / sanitize / hash) before logging.`,
              suggestedFix: {
                type: 'code-patch',
                instructions:
                  `Either drop the log line or wrap the value:\n\n` +
                  `  // wrong\n` +
                  `  logger.info({ apiKey }, 'configured');\n\n` +
                  `  // right (preview only)\n` +
                  `  logger.info({ apiKey: redact(apiKey) }, 'configured');\n\n` +
                  `  // right (drop entirely)\n` +
                  `  logger.info('configured');\n\n` +
                  `If this is a deliberate audit log and your transport ALREADY redacts ` +
                  `(e.g. pino redact paths), suppress with a Reason comment.`,
                verificationCriteria: [
                  'The secret-named binding is no longer passed to a logger call, OR is wrapped in a redaction helper',
                  'Re-scan reports vibe-secret-in-log resolved for this line',
                ],
              },
            });
            // One finding per logger call to avoid double-reporting on
            // multiple secret-named args.
            return;
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(ctx.sourceFile);
    return findings;
  },
};
