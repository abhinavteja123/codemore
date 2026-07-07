/**
 * Bandit adapter.
 *
 * Wraps `bandit -r <root> -f json -q`. Bandit's JSON output:
 *   {
 *     "results": [{
 *       "filename": "/abs/path/x.py",
 *       "test_id": "B102",
 *       "test_name": "exec_used",
 *       "issue_severity": "MEDIUM" | "HIGH" | "LOW",
 *       "issue_confidence": "MEDIUM" | "HIGH" | "LOW",
 *       "issue_text": "Use of exec detected.",
 *       "line_number": 14,
 *       "more_info": "https://bandit.readthedocs.io/..."
 *     }, ...]
 *   }
 *
 * Severity map:
 *   HIGH   -> BLOCKER (SQL injection, exec, eval, pickle)
 *   MEDIUM -> MAJOR
 *   LOW    -> MINOR
 *
 * Rule id namespace: `ext:bandit:<test_id>` (e.g. ext:bandit:B102).
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ReportIssue, Severity } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';
import { parseToolJson, isRecord, type ParseResult } from './parseShape';

interface BanditResult {
  filename: string;
  test_id: string;
  test_name: string;
  issue_severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue_confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  issue_text: string;
  line_number: number;
  more_info?: string;
}

interface BanditOutput { results?: BanditResult[] }

function classifySeverity(sev: string): Severity {
  switch (sev) {
    case 'HIGH':   return 'BLOCKER';
    case 'MEDIUM': return 'MAJOR';
    case 'LOW':    return 'MINOR';
    default:       return 'MAJOR';
  }
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

/**
 * Parse bandit's `-f json` stdout. Empty output = clean run. Malformed
 * JSON or a payload missing the top-level `results` array (old/renamed
 * schema) fails loud with an error diagnostic instead of silently
 * reporting zero findings.
 */
export function parseBanditOutput(stdout: string): ParseResult<BanditOutput> {
  if (stdout.trim().length === 0) { return { value: { results: [] } }; }
  return parseToolJson<BanditOutput>(
    stdout, 'bandit',
    (p) => isRecord(p) && Array.isArray((p as BanditOutput).results),
    'is missing the "results" array',
  );
}

async function runBanditJson(root: string, timeoutMs: number, diagnostics: ExternalToolDiagnostic[]):
    Promise<BanditOutput | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn('bandit', ['-r', root, '-f', 'json', '-q'], {
        cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'bandit', level: 'info',
        message: `bandit not on PATH; skipped (${(err as Error).message})`,
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
        ? 'bandit not on PATH; install with `pip install bandit` to enable Python SAST'
        : `bandit spawn failed: ${err.message}`;
      diagnostics.push({ tool: 'bandit', level: 'info', message: msg });
      resolve(null);
    });

    proc.on('close', (code) => {
      if (errored) {return;}
      clearTimeout(timer);
      if (killed) {
        diagnostics.push({ tool: 'bandit', level: 'warn', message: 'bandit timeout' });
        resolve(null);
        return;
      }
      // Bandit exits 1 when findings present (NORMAL). Exit > 1 is failure.
      if (code !== 0 && code !== 1) {
        diagnostics.push({
          tool: 'bandit', level: 'error',
          message: `bandit exited ${code}: ${stderr.split('\n')[0] || '(no stderr)'}`,
        });
        resolve(null);
        return;
      }
      const { value, diagnostic } = parseBanditOutput(stdout);
      if (diagnostic) { diagnostics.push(diagnostic); }
      resolve(value);
    });
  });
}

export async function runBandit(root: string, opts: { timeoutMs: number }): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const output = await runBanditJson(root, opts.timeoutMs, diagnostics);
  if (output === null) {return { issues: [], diagnostics };}

  const rootAbs = path.resolve(root);
  const issues: ReportIssue[] = [];
  for (const r of output.results ?? []) {
    if (!r || typeof r.test_id !== 'string' || typeof r.filename !== 'string') {continue;}
    const file = relativise(rootAbs, r.filename);
    issues.push({
      id: `ext:bandit:${r.test_id}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity: classifySeverity(r.issue_severity),
      confidence: 0.8,
      category: 'security',
      title: `bandit ${r.test_id}: ${r.test_name}`,
      whyItMatters: `${r.issue_text} (bandit ${r.test_id}; severity=${r.issue_severity}).`,
      citation: r.more_info || `https://bandit.readthedocs.io/en/latest/plugins/${r.test_id.toLowerCase()}_${r.test_name}.html`,
      evidence: {
        file,
        line: r.line_number ?? 1,
        column: 1,
        snippet: r.issue_text.slice(0, 120),
        matchedPattern: r.test_id,
      },
      suggestedFix: undefined,
      suppression: {
        available: true,
        directive: `# codemore-ignore-next-line: ext:bandit:${r.test_id}`,
        scope: 'next-line',
      },
    });
  }
  return { issues, diagnostics };
}
