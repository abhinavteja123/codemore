/**
 * Telemetry sender (CLI side).
 *
 * Engaged ONLY when:
 *   - the user passes `--telemetry` to a single `codemore scan` run, OR
 *   - the user has previously written `{ "telemetry": true }` to
 *     `~/.codemore/config.json` and the current run does NOT pass
 *     `--no-telemetry`.
 *
 * Privacy contract (mirrors the endpoint side):
 *   - We send only schemaVersion + toolVersion + fingerprintHash (already
 *     computed by the scanner) + per-rule { id, severity, confidence,
 *     context: 'fired' }. No paths, no file content, no snippets.
 *   - Send is best-effort: network errors / non-2xx responses are swallowed
 *     silently. We DO NOT block the scan or surface noisy stderr.
 *
 * Endpoint: process.env.CODEMORE_TELEMETRY_URL override OR the default
 * `https://codemore.dev/api/telemetry`. The override is how staging /
 * tests redirect.
 */

import type { CodeMoreReport } from '../../shared/report/types';

const DEFAULT_ENDPOINT = 'https://codemore.dev/api/telemetry';

interface TelemetryRulePing {
  id: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  confidence: number;
  context: 'fired';
}

interface TelemetryPayload {
  schemaVersion: string;
  toolVersion: string;
  fingerprintHash: string;
  surface: 'cli' | 'mcp' | 'extension' | 'gh-action';
  rules: TelemetryRulePing[];
}

function buildPayload(report: CodeMoreReport, surface: TelemetryPayload['surface']): TelemetryPayload | null {
  if (!report?.project?.fingerprint) return null;
  const rules: TelemetryRulePing[] = (report.issues ?? []).map(i => ({
    id: i.id,
    severity: i.severity,
    confidence: i.confidence,
    context: 'fired',
  }));
  return {
    schemaVersion: report.schemaVersion ?? '1.0.0',
    toolVersion: report.tool?.version ?? '0.0.0',
    fingerprintHash: report.project.fingerprint,
    surface,
    rules,
  };
}

/**
 * Send the report to the telemetry endpoint. Returns true on a 2xx
 * response, false on every other outcome (including network error).
 * Never throws.
 */
export async function sendTelemetry(
  report: CodeMoreReport,
  surface: TelemetryPayload['surface'] = 'cli',
): Promise<boolean> {
  const payload = buildPayload(report, surface);
  if (!payload) return false;
  const endpoint = process.env.CODEMORE_TELEMETRY_URL?.trim() || DEFAULT_ENDPOINT;
  // 3 second timeout — we don't block the CLI on slow telemetry.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 3000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
