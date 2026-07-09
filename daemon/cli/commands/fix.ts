/**
 * `codemore fix` — CLI wrapper around the existing agentic fix loop.
 *
 * Scans the target, picks findings (blockers first), and runs
 * detect → plan → generate → validate (runAgenticFix, ≤3 attempts) with an
 * LLM generator selected from the environment. CLI parity with the MCP
 * server's apply_fix/validate_fix pair, but self-contained: the CLI brings
 * its own generator, the MCP agent IS its own generator.
 *
 * Safety contract:
 *   - Dry-run by default: proposed content is written to a `<file>.codemore-fix`
 *     sidecar. `--write` patches the file in place, backing up to `<file>.bak`
 *     first (same convention as `codemore mcp install`).
 *   - No LLM key configured → exit 1 with setup guidance, never a stack trace.
 *   - Non-interactive safe: never prompts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { registerAllPacks } from '../registerPacks';
import { scanProject } from '../projectScanner';
import { runAgenticFix } from '../../services/agenticFixer';
import type { ReportIssue } from '../../../shared/report/types';
import { color } from '../colors';

interface FixArgs {
  path: string;
  rule?: string;
  all: boolean;
  write: boolean;
  maxAttempts: number;
  enableExperimental: boolean;
}

export function parseFixArgs(rest: string[]): FixArgs {
  const args: FixArgs = {
    path: '.',
    rule: undefined,
    all: false,
    write: false,
    maxAttempts: 3,
    enableExperimental: false,
  };
  let pathSet = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    switch (a) {
      case '--rule':
        args.rule = rest[++i];
        if (!args.rule) throw new Error('--rule requires a rule id');
        break;
      case '--all':
        args.all = true;
        break;
      case '--write':
        args.write = true;
        break;
      case '--max-attempts': {
        const n = Number(rest[++i]);
        if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('--max-attempts requires an integer 1-10');
        args.maxAttempts = n;
        break;
      }
      case '--enable-experimental':
        args.enableExperimental = true;
        break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown flag for fix: "${a}". See --help.`);
        if (pathSet) throw new Error(`fix takes one path; got "${args.path}" and "${a}"`);
        args.path = a;
        pathSet = true;
    }
  }
  return args;
}

type Generator = { name: string; generate: (prompt: string) => Promise<string> };

const GUIDANCE =
  'codemore fix needs an LLM API key to generate patches. Set ONE of:\n' +
  '  ANTHROPIC_API_KEY   (uses claude-haiku-4-5)\n' +
  '  OPENAI_API_KEY      (uses gpt-4o-mini)\n' +
  '  GEMINI_API_KEY      (uses gemini-2.0-flash)\n' +
  'Optional: CODEMORE_LLM_PROVIDER=anthropic|openai|gemini to force one,\n' +
  '          CODEMORE_LLM_MODEL=<model-id> to override the default model.\n' +
  'No key is stored or sent anywhere except the provider you choose.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider JSON shapes differ; callers use optional chaining
async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

/** Pick a generator from env. Returns undefined when no key is configured. */
export function makeEnvGenerator(env: NodeJS.ProcessEnv = process.env): Generator | undefined {
  const forced = (env.CODEMORE_LLM_PROVIDER || '').toLowerCase();
  const model = env.CODEMORE_LLM_MODEL;

  const anthropic = (): Generator => ({
    name: 'anthropic',
    generate: async (prompt) => {
      const data = await postJson('https://api.anthropic.com/v1/messages', {
        'x-api-key': env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      }, {
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      });
      return data.content?.[0]?.text || '';
    },
  });
  const openai = (): Generator => ({
    name: 'openai',
    generate: async (prompt) => {
      const data = await postJson('https://api.openai.com/v1/chat/completions', {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      }, {
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });
      return data.choices?.[0]?.message?.content || '';
    },
  });
  const gemini = (): Generator => ({
    name: 'gemini',
    generate: async (prompt) => {
      const m = model || 'gemini-2.0-flash';
      const data = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_API_KEY}`,
        {},
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
      );
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
  });

  if (forced === 'anthropic') return env.ANTHROPIC_API_KEY ? anthropic() : undefined;
  if (forced === 'openai') return env.OPENAI_API_KEY ? openai() : undefined;
  if (forced === 'gemini') return env.GEMINI_API_KEY ? gemini() : undefined;
  if (env.ANTHROPIC_API_KEY) return anthropic();
  if (env.OPENAI_API_KEY) return openai();
  if (env.GEMINI_API_KEY) return gemini();
  return undefined;
}

const SEV_RANK: Record<string, number> = { BLOCKER: 5, CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1 };

export async function runFix(rest: string[]): Promise<number> {
  const args = parseFixArgs(rest);

  const generator = makeEnvGenerator();
  if (!generator) {
    process.stderr.write(color.red('codemore fix: no LLM provider configured.\n') + GUIDANCE + '\n');
    return 1;
  }

  registerAllPacks();

  const targetAbs = path.resolve(args.path);
  if (!fs.existsSync(targetAbs)) {
    process.stderr.write(color.red(`codemore fix: path not found: ${targetAbs}\n`));
    return 2;
  }
  const isFile = fs.statSync(targetAbs).isFile();
  const root = isFile ? path.dirname(targetAbs) : targetAbs;

  const report = await scanProject({ root, enableExperimental: args.enableExperimental });

  let issues: ReportIssue[] = report.issues;
  if (isFile) {
    issues = issues.filter(i => path.resolve(root, i.evidence.file) === targetAbs);
  }
  if (args.rule) {
    issues = issues.filter(i => i.id === args.rule);
  }
  issues.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
  if (!args.all) issues = issues.slice(0, 1);

  if (issues.length === 0) {
    process.stdout.write(color.green('codemore fix: nothing to fix') +
      (args.rule ? ` for rule ${args.rule}` : '') + ` in ${args.path}\n`);
    return 0;
  }

  process.stdout.write(
    `${color.bold('codemore fix')} — ${issues.length} finding(s), generator: ${generator.name}, ` +
    `${args.write ? color.yellow('WRITE mode (backs up to .bak)') : 'dry-run (writes .codemore-fix sidecars; use --write to patch)'}\n\n`,
  );

  let failed = 0;
  for (const issue of issues) {
    const label = `${color.bold(issue.id)} ${color.gray(`${issue.evidence.file}:${issue.evidence.line}`)}`;
    process.stdout.write(`fixing ${label} ...\n`);

    const result = await runAgenticFix({
      workspaceRoot: root,
      issue,
      generate: generator.generate,
      options: { maxAttempts: args.maxAttempts },
    });

    if (result.status !== 'applied' || result.finalContent === undefined) {
      failed++;
      process.stdout.write(`  ${color.red('FAIL')} after ${result.attempts} attempt(s): ${result.reason}\n`);
      continue;
    }

    const absFile = path.resolve(root, issue.evidence.file);
    if (args.write) {
      fs.copyFileSync(absFile, absFile + '.bak');
      fs.writeFileSync(absFile, result.finalContent, 'utf8');
      process.stdout.write(`  ${color.green('PASS')} in ${result.attempts} attempt(s) — patched ${issue.evidence.file} (backup: ${issue.evidence.file}.bak)\n`);
    } else {
      const sidecar = absFile + '.codemore-fix';
      fs.writeFileSync(sidecar, result.finalContent, 'utf8');
      process.stdout.write(`  ${color.green('PASS')} in ${result.attempts} attempt(s) — proposed content at ${issue.evidence.file}.codemore-fix\n`);
    }
  }

  return failed > 0 ? 1 : 0;
}
