/**
 * Rule: vibe-cicd-secret-in-yaml
 *
 * Detects secrets in CI/CD pipeline YAML — `.github/workflows/*.yml`,
 * `.gitlab-ci.yml`, `azure-pipelines.yml`. Two failure modes:
 *
 *   1. Literal secret embedded in YAML: api_key: "sk-..."
 *   2. Echo of a secret to the job log:
 *        run: echo ${{ secrets.PROD_DB_URL }}
 *        run: curl -H "Authorization: $TOKEN" ...
 *
 * Pattern (2) is the more common in AI-generated workflows — the developer
 * pulls a secret in via the GitHub Actions secrets vault and then `echo`s
 * it during a debug step. That puts the secret in the workflow log, which
 * may be public on public repos.
 *
 * Severity: BLOCKER. Once a token leaks to a GH log, it's exposed.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Literal-secret patterns (overlap with hardcoded-secret-pattern but in
// the YAML language space). Keep tight to avoid noise from YAML aliases.
const LITERAL_SECRET_RE = /\b(?:api[_-]?key|api[_-]?token|secret|password|access[_-]?token|private[_-]?key|jwt|webhook)\s*:\s*['"]?(?:sk[_-][A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9._-]{40,}|gh[pous]_[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|[A-Za-z0-9]{32,})['"]?/g;

// Secret echo in a run step.
const ECHO_SECRET_RE = /\b(?:echo|printf|print|tee|>\s*\S+)[^\n]{0,200}?\$\{\{\s*secrets\.[A-Z_][A-Z0-9_]*\s*\}\}/g;
// Authorization header with an unquoted secret pulled from env or secret.
const AUTH_HEADER_SECRET_RE = /Authorization[^"\n]*?\$(?:\{\{\s*secrets\.|TOKEN|API_KEY)/g;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function isWorkflowFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return /\.github\/workflows\//.test(norm) ||
         /\.gitlab-ci\.ya?ml$/.test(norm) ||
         /azure-pipelines\.ya?ml$/.test(norm) ||
         /\.circleci\/config\.ya?ml$/.test(norm);
}

export const vibeCicdSecretInYaml: Rule = {
  id: 'vibe-cicd-secret-in-yaml',
  version: '1.1.0',
  pack: 'vibe-secrets',
  lifecycle: 'beta',
  languages: ['yaml'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'Secret literal or echoed-secret in CI/CD workflow',
  whyItMatters:
    'Two ways a CI workflow leaks a secret: a literal API key checked into the YAML, or an ' +
    "`echo \${{ secrets.X }}` step that dumps it to the build log. On public repos the log is " +
    'public; on private repos the log is still accessible to anyone with read access. Replace ' +
    'literal keys with `${{ secrets.NAME }}`; remove echo/curl-with-bare-token steps; mask ' +
    'sensitive output via the `add-mask` workflow command.',
  citation: 'https://codemore.tech/rules/vibe-cicd-secret-in-yaml',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!isWorkflowFile(ctx.filePath)) return [];
    const findings: RuleFinding[] = [];
    for (const [re, kind] of [
      [LITERAL_SECRET_RE,     'literal-secret-in-workflow'],
      [ECHO_SECRET_RE,        'secret-echo-to-log'],
      [AUTH_HEADER_SECRET_RE, 'auth-header-bare-token'],
    ] as const) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const line = lineForOffset(ctx.content, m.index);
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: kind,
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              kind === 'literal-secret-in-workflow'
                ? `Move the secret to GitHub's secret vault and reference via\n` +
                  `\`\${{ secrets.NAME }}\` — never check the literal into YAML.`
                : kind === 'secret-echo-to-log'
                  ? `Remove the echo / printf step. If you need the value at runtime,\n` +
                    `pipe it through stdin or assign to an env var WITHOUT echoing.\n` +
                    `To mask sensitive output explicitly:\n` +
                    `  - run: echo "::add-mask::$THE_VALUE"`
                  : `Quote the header and avoid template-substituting the token into the\n` +
                    `command line. Pass via stdin or use the action's auth: input instead.`,
            verificationCriteria: [
              'No literal secret value remains in the YAML',
              'No step echoes secrets.* into the job log',
              'Re-scan reports vibe-cicd-secret-in-yaml resolved for this file',
            ],
          },
        });
      }
    }
    return findings;
  },
};
