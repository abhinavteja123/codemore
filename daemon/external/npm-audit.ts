/**
 * npm-audit adapter.
 *
 * Wraps `npm audit --json` in the project root (where package-lock.json
 * lives). npm v7+ outputs a nested `vulnerabilities` map keyed by package
 * name. We flatten and emit one finding per vulnerability.
 *
 * Output shape (npm v9+):
 *   {
 *     "vulnerabilities": {
 *       "<pkg>": {
 *         "name": "<pkg>",
 *         "severity": "critical" | "high" | "moderate" | "low" | "info",
 *         "via": [{ "title": "...", "url": "...", "source": <id>, "name": "..." }],
 *         "range": "<x.y.z>",
 *         ...
 *       }
 *     },
 *     "metadata": { ... }
 *   }
 *
 * Severity map:
 *   critical -> BLOCKER
 *   high     -> MAJOR
 *   moderate -> MINOR
 *   low / info -> INFO
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { ReportIssue, Severity } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';
import { parseToolJson, isRecord, type ParseResult } from './parseShape';

interface NpmAuditVia {
  title?: string;
  url?: string;
  source?: number;
  name?: string;
  severity?: string;
}

interface NpmAuditVulnerability {
  name?: string;
  severity?: string;
  via?: Array<NpmAuditVia | string>;
  range?: string;
  fixAvailable?: boolean | { name: string; version: string };
}

interface NpmAuditOutput {
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

function classify(sev: string): Severity {
  switch (sev) {
    case 'critical': return 'BLOCKER';
    case 'high':     return 'MAJOR';
    case 'moderate': return 'MINOR';
    case 'low':
    case 'info':     return 'INFO';
    default:         return 'MAJOR';
  }
}

function ulidLike(): string { return crypto.randomBytes(8).toString('hex'); }

/**
 * Parse `npm audit --json` stdout. Empty output = clean. Malformed JSON or
 * a payload missing the top-level `vulnerabilities` object fails loud with
 * an error diagnostic instead of a silent zero — this is the exact npm v6
 * drift case (v6 emitted `advisories`/`actions`, not `vulnerabilities`, so
 * the old shape would otherwise flatten to zero findings unnoticed).
 */
export function parseNpmAuditOutput(stdout: string): ParseResult<NpmAuditOutput> {
  if (stdout.trim().length === 0) { return { value: { vulnerabilities: {} } }; }
  return parseToolJson<NpmAuditOutput>(
    stdout, 'npm-audit',
    (p) => isRecord(p) && isRecord((p as NpmAuditOutput).vulnerabilities),
    'is missing the "vulnerabilities" object (npm < 7 used "advisories")',
  );
}

async function runNpmAuditJson(root: string, timeoutMs: number, diagnostics: ExternalToolDiagnostic[]):
    Promise<NpmAuditOutput | null> {
  // npm audit requires package-lock.json. If not present, skip cleanly.
  if (!fs.existsSync(path.join(root, 'package-lock.json')) && !fs.existsSync(path.join(root, 'npm-shrinkwrap.json'))) {
    diagnostics.push({
      tool: 'npm-audit', level: 'info',
      message: 'no package-lock.json found at root; skipping (npm audit needs a lockfile)',
    });
    return null;
  }
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      // npm.cmd on Windows; node spawns the .cmd via PATHEXT but we hint.
      const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      proc = spawn(cmd, ['audit', '--json'], {
        cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'npm-audit', level: 'info',
        message: `npm not on PATH; skipped (${(err as Error).message})`,
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
      diagnostics.push({ tool: 'npm-audit', level: 'info', message: `npm spawn failed: ${err.message}` });
      resolve(null);
    });
    proc.on('close', (_code) => {
      if (errored) {return;}
      clearTimeout(timer);
      if (killed) {
        diagnostics.push({ tool: 'npm-audit', level: 'warn', message: 'npm audit timeout' });
        resolve(null);
        return;
      }
      // npm audit exits non-zero when vulns found — that's the success path.
      if (stdout.trim().length === 0) {
        if (stderr.trim().length > 0) {
          diagnostics.push({ tool: 'npm-audit', level: 'error', message: stderr.split('\n')[0] });
        }
        resolve(null);
        return;
      }
      const { value, diagnostic } = parseNpmAuditOutput(stdout);
      if (diagnostic) { diagnostics.push(diagnostic); }
      resolve(value);
    });
  });
}

export async function runNpmAudit(root: string, opts: { timeoutMs: number }): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const output = await runNpmAuditJson(root, opts.timeoutMs, diagnostics);
  if (output === null) {return { issues: [], diagnostics };}

  const issues: ReportIssue[] = [];
  for (const [pkg, vuln] of Object.entries(output.vulnerabilities ?? {})) {
    const sev = (vuln.severity ?? '').toLowerCase();
    const severity = classify(sev);
    const via = Array.isArray(vuln.via) ? vuln.via.find(v => typeof v === 'object') as NpmAuditVia | undefined : undefined;
    const title = via?.title ?? `Vulnerability in ${pkg}`;
    const url = via?.url ?? `https://www.npmjs.com/advisories?search=${encodeURIComponent(pkg)}`;
    issues.push({
      id: `ext:npm-audit:${pkg}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity,
      confidence: 0.85,
      category: 'security',
      title: `npm-audit: ${title}`,
      whyItMatters:
        `npm audit reports a ${sev} vulnerability in \`${pkg}\` (range ${vuln.range ?? '?'}). ` +
        `Run \`npm audit fix\` or upgrade to the fixed version. ` +
        (vuln.fixAvailable ? 'A fix is available via `npm audit fix`.' : 'No automatic fix is available — review the advisory.'),
      citation: url,
      evidence: {
        file: 'package.json',
        line: 1,
        column: 1,
        snippet: `${pkg} ${vuln.range ?? ''}`.trim(),
        matchedPattern: `vuln:${pkg}`,
      },
      suggestedFix: undefined,
      suppression: {
        available: true,
        directive: `// codemore-ignore-next-line: ext:npm-audit:${pkg}`,
        scope: 'next-line',
      },
    });
  }
  return { issues, diagnostics };
}
