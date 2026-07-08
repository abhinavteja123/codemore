/**
 * Rule: core-security-py-shell-injection
 *
 * Python analogue of `core-security-shell-injection`. Detects calls to:
 *   - subprocess.call / run / Popen / check_call / check_output / getoutput
 *     with `shell=True` keyword argument
 *   - os.system(cmd) where cmd is a string concat / f-string / format
 *
 * Severity: BLOCKER. Shell-piped strings are the canonical command-
 * injection sink; vibe-coded apps reach for `shell=True` because the
 * AI's first sample shows that shape.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree, PythonNode } from '../../rules/pythonAst';
import { findCallsTo, type CallLike } from '../../rules/pythonHelpers';

const SUBPROCESS_METHODS = new Set([
  'subprocess.call', 'subprocess.run', 'subprocess.Popen',
  'subprocess.check_call', 'subprocess.check_output',
]);

/**
 * subprocess methods that ALWAYS pipe through the shell, regardless of
 * any `shell=True` argument. The presence of a dynamic first-arg string
 * is enough to flag.
 */
const SUBPROCESS_ALWAYS_SHELL = new Set([
  'subprocess.getoutput', 'subprocess.getstatusoutput',
]);

const OS_SHELL_METHODS = new Set([
  'os.system', 'os.popen',
]);

function hasShellTrue(call: CallLike): boolean {
  if (!call.args) return false;
  // argument_list children include `keyword_argument` nodes; each has
  // fields: name (identifier), value (expression).
  for (let i = 0; i < (call.args.childCount as number); i++) {
    const c = call.args.child(i) as PythonNode | null;
    if (!c || c.type !== 'keyword_argument') continue;
    const nameNode = (c as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('name');
    const valueNode = (c as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('value');
    if (!nameNode || !valueNode) continue;
    if ((nameNode as { text: string }).text === 'shell'
        && (valueNode as { text: string }).text.trim() === 'True') {
      return true;
    }
  }
  return false;
}

function firstArgIsDynamicString(call: CallLike): boolean {
  if (!call.args) return false;
  // Find the first positional argument (not a keyword_argument).
  let first: PythonNode | null = null;
  for (let i = 0; i < (call.args.childCount as number); i++) {
    const c = call.args.child(i) as PythonNode | null;
    if (!c) continue;
    if (c.type === '(' || c.type === ')' || c.type === ',') continue;
    if (c.type === 'keyword_argument') continue;
    first = c;
    break;
  }
  if (!first) return false;
  // String concat with `+`, f-string with substitution, or `.format(...)`.
  if (first.type === 'binary_operator') return true;
  if (first.type === 'string' || first.type === 'concatenated_string') {
    // f-string: child is `interpolation` node when there's a substitution.
    for (let i = 0; i < (first.childCount as number); i++) {
      const c = first.child(i) as PythonNode | null;
      if (c && c.type === 'interpolation') return true;
    }
    return false;
  }
  if (first.type === 'call') {
    // `.format(...)` or `%` formatting through a method? Method form:
    // attribute callee with name == 'format'.
    const callee = (first as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('function');
    if (callee && callee.type === 'attribute') {
      const attr = (callee as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('attribute');
      if (attr && (attr as { text: string }).text === 'format') return true;
    }
  }
  if (first.type === 'identifier') {
    // A bare identifier — we don't know its provenance. Treat as dynamic
    // to stay on the safer side.
    return true;
  }
  return false;
}

export const coreSecurityPyShellInjection: Rule = {
  id: 'core-security-py-shell-injection',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'subprocess / os.system call passes a dynamic shell string',
  whyItMatters:
    'Passing `shell=True` to subprocess (or any string to `os.system`) lets the shell parse ' +
    'argument boundaries, redirections, and command substitution. With anything user-controlled ' +
    'in the string this is command injection. Use the argv-list form: `subprocess.run([...])` ' +
    'with `shell=False` (the default).',
  citation: 'https://codemore.tech/rules/core-security-py-shell-injection',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    // subprocess.* with shell=True
    for (const c of findCallsTo(tree.rootNode, SUBPROCESS_METHODS)) {
      if (!hasShellTrue(c)) continue;
      findings.push(buildFinding(ctx, c, 'shell-true'));
    }
    // subprocess.getoutput / getstatusoutput — always shell-piped.
    for (const c of findCallsTo(tree.rootNode, SUBPROCESS_ALWAYS_SHELL)) {
      if (!firstArgIsDynamicString(c)) continue;
      findings.push(buildFinding(ctx, c, 'always-shell'));
    }
    // os.system / os.popen with dynamic string argument
    for (const c of findCallsTo(tree.rootNode, OS_SHELL_METHODS)) {
      if (!firstArgIsDynamicString(c)) continue;
      findings.push(buildFinding(ctx, c, 'os-system-dynamic'));
    }

    return findings;
  },
};

function buildFinding(ctx: RuleContext, call: CallLike, matched: string): RuleFinding {
  return {
    evidence: {
      file: ctx.filePath,
      line: call.line,
      column: call.column,
      snippet: (ctx.lines[call.line - 1] ?? '').trim(),
      matchedPattern: matched,
    },
    whyItMatters:
      `\`${call.callee}(...)\` either passes \`shell=True\` or runs a dynamic command string. ` +
      `Switch to the argv-list form so the shell can't reinterpret the arguments.`,
    suggestedFix: {
      type: 'code-patch',
      instructions:
        `Use the argv-list form. Each list element becomes a single argv slot the shell never sees:\n\n` +
        `  # wrong\n` +
        `  subprocess.run(f'git log --oneline {rev}', shell=True)\n\n` +
        `  # right\n` +
        `  subprocess.run(['git', 'log', '--oneline', rev], check=True)\n\n` +
        `If you absolutely need shell features, escape every interpolated value with \`shlex.quote()\` ` +
        `AND document why in a Reason comment.`,
      verificationCriteria: [
        'The call uses argv-list form OR every interpolated value is wrapped in shlex.quote()',
        'Re-scan reports core-security-py-shell-injection resolved for this line',
      ],
    },
  };
}
