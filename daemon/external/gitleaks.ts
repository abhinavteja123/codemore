/**
 * Gitleaks adapter.
 *
 * Wraps `gitleaks detect --report-format=json --report-path=- --no-banner
 * --source <root>`. Gitleaks emits an NDJSON-ish array. We treat every
 * finding as a BLOCKER — leaked credentials are non-negotiable.
 *
 * Output shape (each entry):
 *   {
 *     "Description": "AWS Access Key",
 *     "RuleID": "aws-access-token",
 *     "File": "src/foo.env",
 *     "StartLine": 3, "EndLine": 3,
 *     "Match": "AKIA...",
 *     "Secret": "AKIA...",
 *     "Commit": "<sha>"
 *   }
 *
 * Severity: BLOCKER on every gitleaks finding. Cleanup requires rotation,
 * not just code edit.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ReportIssue } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';
import { parseToolJson, type ParseResult } from './parseShape';

interface GitleaksFinding {
  Description?: string;
  RuleID?: string;
  File?: string;
  StartLine?: number;
  EndLine?: number;
  Match?: string;
  Secret?: string;
  Commit?: string;
}

function relativise(rootAbs: string, fileAbs: string): string {
  let rel = path.relative(rootAbs, fileAbs);
  rel = rel.replace(/\\/g, '/');
  if (rel.length === 0) {rel = path.basename(fileAbs);}
  return rel;
}

function ulidLike(): string {
  return crypto.randomBytes(8).toString('hex');
}

function redact(secret: string): string {
  // Keep first 4 and last 2 chars of the secret, mask the middle.
  if (!secret) {return '';}
  if (secret.length <= 8) {return '***';}
  return `${secret.slice(0, 4)}…${secret.slice(-2)}`;
}

/**
 * Parse gitleaks' `--report-format json` stdout, a top-level array of
 * findings. Empty output or the literal `null` = clean run. Malformed JSON,
 * or valid JSON that isn't an array (renamed/wrapped schema in a new
 * version), fails loud with an error diagnostic instead of a silent zero.
 */
export function parseGitleaksOutput(stdout: string): ParseResult<GitleaksFinding[]> {
  const text = stdout.trim();
  if (text.length === 0 || text === 'null') { return { value: [] }; }
  return parseToolJson<GitleaksFinding[]>(
    text, 'gitleaks',
    (p) => Array.isArray(p),
    'was not a JSON array',
  );
}

async function runGitleaksJson(root: string, timeoutMs: number, diagnostics: ExternalToolDiagnostic[]):
    Promise<GitleaksFinding[] | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn('gitleaks', ['detect', '--report-format=json', '--report-path=-', '--no-banner', '--source', root, '--no-git'], {
        cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'gitleaks', level: 'info',
        message: `gitleaks not on PATH; skipped (${(err as Error).message})`,
      });
      resolve(null);
      return;
    }

    let stdout = '';
    let stderr = '';
    let killed = false;
    let errored = false;
    const timer = setTimeout(() => { killed = true; try { proc.kill('SIGTERM'); } catch { /* intentionally empty */ } }, timeoutMs);

    proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });

    proc.on('error', (err) => {
      if (errored) {return;}
      errored = true;
      clearTimeout(timer);
      const msg = (err as { code?: string }).code === 'ENOENT'
        ? 'gitleaks not on PATH; install from https://github.com/gitleaks/gitleaks'
        : `gitleaks spawn failed: ${err.message}`;
      diagnostics.push({ tool: 'gitleaks', level: 'info', message: msg });
      resolve(null);
    });

    proc.on('close', (code) => {
      if (errored) {return;}
      clearTimeout(timer);
      if (killed) {
        diagnostics.push({ tool: 'gitleaks', level: 'warn', message: 'gitleaks timeout' });
        resolve(null);
        return;
      }
      // Gitleaks exits 1 when leaks found (NORMAL for us). Exit > 1 is error.
      if (code !== 0 && code !== 1) {
        diagnostics.push({
          tool: 'gitleaks', level: 'error',
          message: `gitleaks exited ${code}: ${stderr.split('\n')[0] || '(no stderr)'}`,
        });
        resolve(null);
        return;
      }
      const { value, diagnostic } = parseGitleaksOutput(stdout);
      if (diagnostic) { diagnostics.push(diagnostic); }
      resolve(value);
    });
  });
}

export async function runGitleaks(root: string, opts: { timeoutMs: number }): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const findings = await runGitleaksJson(root, opts.timeoutMs, diagnostics);
  if (findings === null) {return { issues: [], diagnostics };}

  const rootAbs = path.resolve(root);
  const issues: ReportIssue[] = [];
  for (const f of findings) {
    if (!f || !f.RuleID || !f.File) {continue;}
    const file = relativise(rootAbs, f.File);
    const ruleId = f.RuleID;
    issues.push({
      id: `ext:gitleaks:${ruleId}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity: 'BLOCKER',
      confidence: 0.9,
      category: 'security',
      title: `gitleaks: ${f.Description ?? ruleId}`,
      whyItMatters:
        `gitleaks found a credential matching the \`${ruleId}\` pattern in this file. ` +
        `Rotate the secret IMMEDIATELY — assume it is leaked — then remove it from the file. ` +
        `Redacted preview: ${redact(f.Secret ?? f.Match ?? '')}.`,
      citation: `https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml`,
      evidence: {
        file,
        line: f.StartLine ?? 1,
        column: 1,
        endLine: f.EndLine,
        // Do NOT put the real secret into the report. Redact.
        snippet: redact(f.Secret ?? f.Match ?? ''),
        matchedPattern: ruleId,
      },
      suggestedFix: undefined,
      suppression: {
        available: true,
        directive: `// codemore-ignore-next-line: ext:gitleaks:${ruleId}`,
        scope: 'next-line',
      },
    });
  }
  return { issues, diagnostics };
}
