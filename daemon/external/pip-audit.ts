/**
 * pip-audit adapter.
 *
 * Wraps `pip-audit --format json`. Run with `--requirement` if the
 * project has a requirements.txt or `--strict` against the active env
 * otherwise. Output shape:
 *   {
 *     "dependencies": [{
 *       "name": "<pkg>",
 *       "version": "<x.y.z>",
 *       "vulns": [{
 *         "id": "PYSEC-2024-xxx" | "GHSA-...",
 *         "fix_versions": ["<a.b.c>", ...],
 *         "description": "...",
 *         "aliases": ["CVE-..."]
 *       }]
 *     }, ...]
 *   }
 *
 * Severity: pip-audit doesn't categorise. We pin to MAJOR with note —
 * users escalate via .codemorerc.json overrides for known-critical CVEs.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { ReportIssue } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';
import { parseToolJson, isRecord, type ParseResult } from './parseShape';

interface PipVuln {
  id?: string;
  description?: string;
  fix_versions?: string[];
  aliases?: string[];
}

interface PipDep {
  name?: string;
  version?: string;
  vulns?: PipVuln[];
}

interface PipAuditOutput {
  dependencies?: PipDep[];
}

function ulidLike(): string { return crypto.randomBytes(8).toString('hex'); }

/**
 * Parse `pip-audit --format json` stdout. Empty output = clean. Malformed
 * JSON or a payload missing the top-level `dependencies` array (old
 * pip-audit emitted a flat vuln array) fails loud with an error diagnostic
 * instead of silently reporting zero findings.
 */
export function parsePipAuditOutput(stdout: string): ParseResult<PipAuditOutput> {
  if (stdout.trim().length === 0) { return { value: { dependencies: [] } }; }
  return parseToolJson<PipAuditOutput>(
    stdout, 'pip-audit',
    (p) => isRecord(p) && Array.isArray((p as PipAuditOutput).dependencies),
    'is missing the "dependencies" array',
  );
}

async function runPipAuditJson(root: string, timeoutMs: number, diagnostics: ExternalToolDiagnostic[]):
    Promise<PipAuditOutput | null> {
  // pip-audit prefers a requirements file; fall back to the active env.
  const hasReq = fs.existsSync(path.join(root, 'requirements.txt'));
  const args = hasReq
    ? ['--format', 'json', '--requirement', path.join(root, 'requirements.txt')]
    : ['--format', 'json', '--strict'];

  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn('pip-audit', args, {
        cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'pip-audit', level: 'info',
        message: `pip-audit not on PATH; install with \`pip install pip-audit\` (${(err as Error).message})`,
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
      diagnostics.push({
        tool: 'pip-audit', level: 'info',
        message: (err as { code?: string }).code === 'ENOENT'
          ? 'pip-audit not on PATH; install with `pip install pip-audit`'
          : `pip-audit spawn failed: ${err.message}`,
      });
      resolve(null);
    });
    proc.on('close', (code) => {
      if (errored) {return;}
      clearTimeout(timer);
      if (killed) {
        diagnostics.push({ tool: 'pip-audit', level: 'warn', message: 'pip-audit timeout' });
        resolve(null);
        return;
      }
      // pip-audit exits 1 when vulns present.
      if (code !== 0 && code !== 1) {
        diagnostics.push({
          tool: 'pip-audit', level: 'error',
          message: `pip-audit exited ${code}: ${stderr.split('\n')[0] || '(no stderr)'}`,
        });
        resolve(null);
        return;
      }
      const { value, diagnostic } = parsePipAuditOutput(stdout);
      if (diagnostic) { diagnostics.push(diagnostic); }
      resolve(value);
    });
  });
}

export async function runPipAudit(root: string, opts: { timeoutMs: number }): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const output = await runPipAuditJson(root, opts.timeoutMs, diagnostics);
  if (output === null) {return { issues: [], diagnostics };}

  const issues: ReportIssue[] = [];
  for (const dep of output.dependencies ?? []) {
    if (!dep || !dep.name || !dep.vulns?.length) {continue;}
    for (const v of dep.vulns) {
      const vulnId = v.id ?? 'unknown';
      const file = fs.existsSync('requirements.txt') ? 'requirements.txt' : 'pyproject.toml';
      issues.push({
        id: `ext:pip-audit:${vulnId}`,
        ruleVersion: '1.0.0',
        instanceId: ulidLike(),
        severity: 'MAJOR',
        confidence: 0.85,
        category: 'security',
        title: `pip-audit: ${vulnId} in ${dep.name} ${dep.version ?? ''}`.trim(),
        whyItMatters:
          `pip-audit reports ${vulnId} affecting \`${dep.name}\` ${dep.version ?? ''}. ` +
          (v.description ?? '').slice(0, 200) + ' ' +
          (v.fix_versions?.length
            ? `Upgrade to ${v.fix_versions.join(' or ')}.`
            : 'No fix release listed; check the advisory.'),
        citation: vulnId.startsWith('CVE-') || vulnId.startsWith('GHSA-')
          ? `https://github.com/advisories/${vulnId}`
          : `https://osv.dev/vulnerability/${vulnId}`,
        evidence: {
          file,
          line: 1,
          column: 1,
          snippet: `${dep.name}==${dep.version ?? ''}`.trim(),
          matchedPattern: vulnId,
        },
        suggestedFix: undefined,
        suppression: {
          available: true,
          directive: `# codemore-ignore-next-line: ext:pip-audit:${vulnId}`,
          scope: 'next-line',
        },
      });
    }
  }
  return { issues, diagnostics };
}
