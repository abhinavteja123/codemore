/**
 * Rule: vibe-py-secret-in-log
 *
 * Python analogue of `vibe-secret-in-log`. Detects logger calls (or
 * print()) whose argument is a variable / attribute / object-key
 * matching a "looks like a secret" name, UNLESS the value is wrapped
 * in a recognised redaction helper.
 *
 * Severity: MAJOR.
 *   GitGuardian SOSS 2026 top finding. Same calibration as the TS rule.
 *
 * Detection (tree-sitter-python AST):
 *   - Logger callees recognised:
 *       logging.<level>(...) / logger.<level>(...) / log.<level>(...)
 *       print(...) and pprint.pprint(...)   (debug-print leakage)
 *   - For each call, classify positional arguments + keyword values
 *     against the secret-name pattern.
 *   - Redaction wrappers exempted: redact, mask, sanitize, sanitise,
 *     obfuscate, hash, truncate.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree, PythonNode } from '../../rules/pythonAst';
// We walk the tree manually to enforce single-finding-per-logger-call;
// `findCallsTo` would surface every match but we need to short-circuit
// the args iteration after the first hit.

const SECRET_NAME_RE = /(?:^|_)(?:secret|token|password|passwd|credential|private[_-]?key|bearer|jwt|api[_-]?key|access[_-]?key|session[_-]?id|client[_-]?secret|service[_-]?role)/i;
const SECRET_NAME_RE_END = /(?:secret|token|password|passwd|credential|key|bearer|jwt)$/i;

// Counting / measurement prefixes — when a name starts with these, the
// trailing "token/key/secret" word is a quantity, not the secret itself.
// Eliminates the dominant FP class on real Python apps (LLM token
// counts: input_tokens, output_tokens, total_tokens, n_tokens, etc.).
// See PART 5 §2 — borderline FP on claw-code's src/main.py:169.
const COUNT_PREFIX_RE = /^(?:input|output|total|num|n|count|len|size|max|min|prev|next|new|old|first|last|cur|current)_/i;

const REDACTION_FNS = new Set([
  'redact', 'mask', 'sanitize', 'sanitise', 'obfuscate', 'hash', 'truncate',
]);

const LOGGER_LEVELS = new Set([
  'debug', 'info', 'warning', 'warn', 'error', 'critical', 'exception', 'log', 'fatal',
]);

const LOGGER_ROOTS = new Set([
  'logger', 'log', 'logging',
]);

function looksLikeSecret(name: string): boolean {
  if (COUNT_PREFIX_RE.test(name)) return false;
  return SECRET_NAME_RE.test(name) || SECRET_NAME_RE_END.test(name);
}

function calleeDotted(call: PythonNode): string | null {
  const callee = (call as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('function');
  if (!callee) return null;
  if (callee.type === 'identifier') return (callee as { text: string }).text;
  if (callee.type !== 'attribute') return null;
  let cur: PythonNode | null = callee;
  let path: string[] = [];
  while (cur && cur.type === 'attribute') {
    const a = (cur as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('attribute');
    if (a) path.unshift((a as { text: string }).text);
    cur = (cur as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('object');
  }
  if (cur && cur.type === 'identifier') path.unshift((cur as { text: string }).text);
  return path.join('.');
}

function isLoggerCall(call: PythonNode): boolean {
  const dotted = calleeDotted(call);
  if (!dotted) return false;
  // print / pprint.pprint
  if (dotted === 'print') return true;
  if (dotted === 'pprint.pprint') return true;
  // logger.<level> / log.<level> / logging.<level>
  const parts = dotted.split('.');
  if (parts.length >= 2) {
    const root = parts[0];
    const tail = parts[parts.length - 1];
    if (LOGGER_ROOTS.has(root) && LOGGER_LEVELS.has(tail)) return true;
  }
  return false;
}

function isRedactionCall(arg: PythonNode): boolean {
  if (arg.type !== 'call') return false;
  const dotted = calleeDotted(arg);
  if (!dotted) return false;
  const tail = dotted.split('.').pop();
  if (!tail) return false;
  return REDACTION_FNS.has(tail.toLowerCase());
}

interface SecretHit {
  line: number;
  column: number;
  source: string;
}

function posOf(n: PythonNode): { line: number; column: number } {
  return { line: (n as { startPosition: { row: number } }).startPosition.row + 1,
           column: (n as { startPosition: { column: number } }).startPosition.column + 1 };
}

function classifyArg(arg: PythonNode): SecretHit | null {
  if (isRedactionCall(arg)) return null;

  if (arg.type === 'identifier') {
    const text = (arg as { text: string }).text;
    if (looksLikeSecret(text)) {
      return { ...posOf(arg), source: `identifier:${text}` };
    }
  }
  if (arg.type === 'attribute') {
    const a = (arg as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('attribute');
    if (a && looksLikeSecret((a as { text: string }).text)) {
      return { ...posOf(arg), source: `attribute:${(a as { text: string }).text}` };
    }
  }
  // f-string with substitution that mentions a secret-named identifier
  if (arg.type === 'string' || arg.type === 'concatenated_string') {
    for (let i = 0; i < (arg.childCount as number); i++) {
      const c = arg.child(i) as PythonNode | null;
      if (!c || c.type !== 'interpolation') continue;
      for (let j = 0; j < (c.childCount as number); j++) {
        const inner = c.child(j) as PythonNode | null;
        if (!inner || inner.type === '{' || inner.type === '}') continue;
        const hit = classifyArg(inner);
        if (hit) return { ...hit, source: `f-string:${hit.source}` };
      }
    }
  }
  // dict literal with secret-shaped keys
  if (arg.type === 'dictionary') {
    for (let i = 0; i < (arg.childCount as number); i++) {
      const pair = arg.child(i) as PythonNode | null;
      if (!pair || pair.type !== 'pair') continue;
      const key = (pair as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('key');
      const value = (pair as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('value');
      if (!key) continue;
      const keyText = (key as { text: string }).text.replace(/['"]/g, '');
      if (looksLikeSecret(keyText) && value && !isRedactionCall(value)) {
        return { ...posOf(pair), source: `dict-key:${keyText}` };
      }
    }
  }
  // keyword argument `apiKey=...` (only if value isn't redacted)
  if (arg.type === 'keyword_argument') {
    const name = (arg as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('name');
    const value = (arg as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('value');
    if (name && value) {
      const nt = (name as { text: string }).text;
      if (looksLikeSecret(nt) && !isRedactionCall(value)) {
        return { ...posOf(arg), source: `kwarg:${nt}` };
      }
    }
  }
  // binary concat
  if (arg.type === 'binary_operator') {
    for (let i = 0; i < (arg.childCount as number); i++) {
      const c = arg.child(i) as PythonNode | null;
      if (!c) continue;
      const r = classifyArg(c);
      if (r) return { ...r, source: `concat:${r.source}` };
    }
  }
  return null;
}

export const vibePySecretInLog: Rule = {
  id: 'vibe-py-secret-in-log',
  version: '1.1.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'Logger / print call references a variable named like a secret',
  whyItMatters:
    'GitGuardian SOSS 2026 top finding: a stray `logger.info({"apiKey": api_key})` or ' +
    '`print(token)` leaks a credential to Datadog / Sentry / CloudWatch / stdout where it ' +
    'stays grep-able for everyone with log access. Wrap with a redaction helper or drop the line.',
  citation: 'https://codemore.tech/rules/vibe-py-secret-in-log',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    // Walk every call; check those that look like logger calls.
    function walk(n: PythonNode): void {
      if (n.type === 'call' && isLoggerCall(n)) {
        const args = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('arguments');
        if (args) {
          for (let i = 0; i < (args.childCount as number); i++) {
            const a = args.child(i) as PythonNode | null;
            if (!a || a.type === '(' || a.type === ')' || a.type === ',') continue;
            const hit = classifyArg(a);
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
                  `A logger / print call passes a value sourced from \`${hit.source}\`. ` +
                  `Wrap with a redaction helper or drop the line.`,
                suggestedFix: {
                  type: 'code-patch',
                  instructions:
                    `Either drop the log line or wrap the value before logging:\n\n` +
                    `  # wrong\n` +
                    `  logger.info({'apiKey': api_key})\n\n` +
                    `  # right\n` +
                    `  logger.info({'apiKey': redact(api_key)})   # preview only\n` +
                    `  # OR\n` +
                    `  logger.info('configured')                   # drop entirely\n\n` +
                    `If your transport handles redaction (Pino-style), suppress with a Reason comment.`,
                  verificationCriteria: [
                    'The secret-named value is either removed from the log call OR wrapped in a redaction helper',
                    'Re-scan reports vibe-py-secret-in-log resolved for this line',
                  ],
                },
              });
              // One finding per logger call.
              return;
            }
          }
        }
      }
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (c) walk(c);
      }
    }
    walk(tree.rootNode);
    return findings;
  },
};
