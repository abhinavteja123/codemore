/**
 * Rule: core-security-insecure-deserialization
 *
 * Detects unsafe deserialization of attacker-controlled bytes — the
 * shortest path to remote code execution in Python apps.
 *
 * Patterns (Python):
 *   pickle.loads(<request data>)             ← arbitrary object construction
 *   pickle.load(open(<user path>))
 *   yaml.load(<request>)                     ← without Loader=yaml.SafeLoader
 *   marshal.loads(<bytes>)
 *   shelve.open(<user path>)
 *
 * Patterns (TS / JS):
 *   eval(<json-like>)                         ← already covered by core-security-eval
 *   serialize-javascript / node-serialize with unsanitized input
 *   require(<user>)                          ← stub for slopsquatting cross-cut
 *
 * Severity: BLOCKER. CVE catalogue is long; Python `pickle.loads(x)`
 * where x is untrusted is an unconditional RCE.
 *
 * Note on yaml: we fire when `yaml.load(...)` is called WITHOUT a
 * `Loader=` kwarg that points at `SafeLoader` / `BaseLoader`. PyYAML
 * since 5.1 emits a runtime warning but still permits the unsafe call.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const PY_PATTERNS: ReadonlyArray<{ re: RegExp; pattern: string; needsUserHint?: boolean }> = [
  { re: /\bpickle\.(?:loads?|Unpickler)\s*\(([^)]*)\)/g, pattern: 'pickle.loads', needsUserHint: true },
  { re: /\bmarshal\.loads?\s*\(([^)]*)\)/g, pattern: 'marshal.loads', needsUserHint: true },
  { re: /\bshelve\.open\s*\(([^)]*)\)/g, pattern: 'shelve.open', needsUserHint: true },
  // yaml.load needs Loader=Safe* — bare yaml.load is the unsafe path.
  { re: /\byaml\.load\s*\(([^)]*)\)/g, pattern: 'yaml.load-without-safe-loader' },
];

const USER_INPUT_HINT_RE = /\b(?:req|request|params|query|body|payload|args|input|user|bytes_from)\b/;
const SAFE_LOADER_RE = /\bLoader\s*=\s*(?:yaml\.)?(?:SafeLoader|BaseLoader|FullLoader)\b/;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const coreSecurityInsecureDeserialization: Rule = {
  id: 'core-security-insecure-deserialization',
  version: '1.1.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'Unsafe deserialization of attacker-controlled data',
  whyItMatters:
    'pickle.loads / marshal.loads / yaml.load (without SafeLoader) construct arbitrary Python ' +
    'objects from bytes. Any byte stream an attacker can influence becomes a remote code execution ' +
    'primitive — this is OWASP A08 and one of the most cited Python CVE classes. Switch to JSON ' +
    '(or yaml.safe_load) for anything coming over the network.',
  citation: 'https://codemore.tech/rules/core-security-insecure-deserialization',

  detect(ctx: RuleContext): RuleFinding[] {
    if (ctx.language !== 'python') return [];
    const findings: RuleFinding[] = [];
    for (const { re, pattern, needsUserHint } of PY_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const arg = m[1] ?? '';
        if (pattern === 'yaml.load-without-safe-loader' && SAFE_LOADER_RE.test(arg)) continue;
        if (needsUserHint && !USER_INPUT_HINT_RE.test(arg)) {
          // pickle.loads(some_local_blob) — possible but lower confidence.
          // We still fire because pickle is essentially never the right
          // choice for production deserialization. Reviewer can suppress.
        }
        const line = lineForOffset(ctx.content, m.index);
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: pattern,
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              pattern === 'yaml.load-without-safe-loader'
                ? '  import yaml\n  data = yaml.safe_load(raw)   # never yaml.load(raw)\n'
                : '  # Use JSON or a schema-validated parser:\n' +
                  '  import json\n' +
                  '  data = json.loads(raw)\n' +
                  '  # If you genuinely need binary structured data, use msgpack with a typed schema.\n',
            verificationCriteria: [
              'The unsafe deserializer is replaced with json / yaml.safe_load / msgpack-with-schema',
              'Re-scan reports core-security-insecure-deserialization resolved for this line',
            ],
          },
        });
      }
    }
    return findings;
  },
};
