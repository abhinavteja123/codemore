/**
 * Surface-parity test.
 *
 * The thesis of CodeMore Phase 2 was "one brain, many skins": the CLI, the
 * MCP server, and the VS Code extension should all produce the same report
 * for the same input. This test enforces that property.
 *
 * What we exercise:
 *   1. CLI            — spawn `node cli.js scan <fixture> --json --enable-experimental`,
 *                       parse stdout.
 *   2. MCP-equivalent — in-process call to `scanProject(...)`. The MCP
 *                       server's scan_project tool wraps exactly this call,
 *                       so calling the function is contract-equivalent to
 *                       speaking the protocol.
 *   3. Daemon adapter — registryAdapter.runRegistryScan(...). The VS Code
 *                       extension consumes findings through this path.
 *
 * What "parity" means: after stripping fields that are intentionally
 * non-deterministic (instanceId — a fresh ULID per scan; scannedAt and
 * scanDurationMs — wall clock), the three reports must produce identical
 * issue arrays when normalised. Specifically:
 *
 *   - Same rule id, file, line, column, severity, confidence, category.
 *   - Same `matchedPattern` evidence (the canonical match label per rule).
 *   - Same total count.
 *
 * If this test goes red, a regression has broken parity — usually because
 * one surface stopped feeding `projectIndex` or `frameworks` through to
 * the registry, and project-level rules started silently no-op'ing there.
 */

import { strict as assert } from 'assert';
import { execFileSync } from 'child_process';
import * as path from 'path';

import { scanProject } from '../daemon/cli/projectScanner';
import { registerAllPacks } from '../daemon/cli/registerPacks';
import { runRegistryScan } from '../daemon/services/registryAdapter';
import type { ReportIssue, CodeMoreReport } from '../shared/report/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI_JS = path.join(REPO_ROOT, 'cli.js');

/**
 * Pick the fields we expect to be stable across invocations. Skips
 * instanceId, ruleVersion (read off the rule module; same across runs but
 * we leave it out for forward-compat) and any timestamp shaped field.
 */
function fingerprintIssue(iss: ReportIssue): string {
  const ev = iss.evidence;
  return [
    iss.id,
    iss.severity,
    iss.confidence.toFixed(2),
    iss.category,
    ev.file.replace(/\\/g, '/'),
    String(ev.line),
    String(ev.column),
    ev.matchedPattern ?? '',
  ].join('|');
}

function fingerprints(issues: ReadonlyArray<ReportIssue>): string[] {
  return issues.map(fingerprintIssue).sort();
}

function cliScan(rootAbs: string): CodeMoreReport {
  // Spawn the CLI fresh so we exercise the actual ship path, not just an
  // in-process function call. --json: stdout is the canonical report.
  const stdout = execFileSync(
    process.execPath,
    [CLI_JS, 'scan', rootAbs, '--json', '--enable-experimental'],
    { encoding: 'utf8', cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(stdout) as CodeMoreReport;
}

describe('surface parity (CLI ↔ MCP-equivalent ↔ daemon adapter)', function () {
  // Pick a fixture that exercises both project-level rules (route file
  // walking + import-graph signals) AND file-level rules (AST + regex).
  // realistic-vibe-app is the densest such corpus we ship.
  //
  // Two candidate locations:
  //   - C:/tmp/realistic-vibe-app  — where scripts/scan-samples.js looks
  //   - corpus/synthetic-realistic-vibe-app/ — co-located alt
  //   - any vibe-no-rate-limit TP fixture — guaranteed to exist in CI
  //
  // We pick the first one that exists; the parity property is the same
  // regardless of which fixture is used. If none exist, the test skips
  // rather than failing — parity isn't useful to assert on no input.
  const candidates = [
    'C:/tmp/realistic-vibe-app',
    path.join(REPO_ROOT, 'corpus', 'synthetic-realistic-vibe-app'),
    path.join(REPO_ROOT, 'corpus', 'rules', 'vibe-no-rate-limit', 'tp'),
  ];
  const fs = require('fs') as typeof import('fs');
  const fixture = candidates.find(p => {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
  });
  // Mocha doesn't allow `this.skip()` in describe-time code; gate per-test instead.
  const skipReason = fixture ? null : `no fixture found (tried: ${candidates.join(', ')})`;
  this.timeout(120000);

  before(() => {
    registerAllPacks();
  });

  it('CLI and in-process scanProject produce identical issue fingerprints', function () {
    if (skipReason || !fixture) { this.skip(); return; }
    const cliReport = cliScan(fixture);
    // The MCP server's scan_project tool is `scanProject(...)`, so calling
    // it directly is the canonical in-process equivalent of an MCP call.
    return scanProject({
      root: fixture,
      enableExperimental: true,
    }).then(mcpReport => {
      const cliPrint = fingerprints(cliReport.issues);
      const mcpPrint = fingerprints(mcpReport.issues);
      assert.deepEqual(
        mcpPrint, cliPrint,
        `CLI returned ${cliPrint.length} issues; in-process returned ${mcpPrint.length}. ` +
        `Difference (first 10 of either side):\n` +
        `  only-cli: ${cliPrint.filter(x => !mcpPrint.includes(x)).slice(0, 10).join('\n             ')}\n` +
        `  only-mcp: ${mcpPrint.filter(x => !cliPrint.includes(x)).slice(0, 10).join('\n             ')}`,
      );
    });
  });

  it('daemon adapter (extension path) produces identical issue fingerprints to CLI', async function () {
    if (skipReason || !fixture) { this.skip(); return; }
    const cliReport = cliScan(fixture);
    const daemon = await runRegistryScan(fixture, { enableExperimental: true });
    const cliPrint = fingerprints(cliReport.issues);
    const daemonPrint = fingerprints(daemon.report.issues);
    assert.deepEqual(
      daemonPrint, cliPrint,
      `CLI returned ${cliPrint.length} issues; daemon adapter returned ${daemonPrint.length}. ` +
      `Difference (first 10 of either side):\n` +
      `  only-cli:    ${cliPrint.filter(x => !daemonPrint.includes(x)).slice(0, 10).join('\n                  ')}\n` +
      `  only-daemon: ${daemonPrint.filter(x => !cliPrint.includes(x)).slice(0, 10).join('\n                  ')}`,
    );
  });

  it('all three surfaces agree on the same total issue count', async function () {
    if (skipReason || !fixture) { this.skip(); return; }
    const cliReport = cliScan(fixture);
    const mcpReport = await scanProject({ root: fixture, enableExperimental: true });
    const daemon = await runRegistryScan(fixture, { enableExperimental: true });
    assert.equal(
      mcpReport.issues.length, cliReport.issues.length,
      `MCP-equivalent diverged from CLI: ${mcpReport.issues.length} vs ${cliReport.issues.length}`,
    );
    assert.equal(
      daemon.report.issues.length, cliReport.issues.length,
      `Daemon adapter diverged from CLI: ${daemon.report.issues.length} vs ${cliReport.issues.length}`,
    );
  });

  it('rule packs loaded are identical across surfaces', async function () {
    if (skipReason || !fixture) { this.skip(); return; }
    const cliReport = cliScan(fixture);
    const mcpReport = await scanProject({ root: fixture, enableExperimental: true });
    const cliPacks = (cliReport.meta?.packsLoaded ?? []).slice().sort();
    const mcpPacks = (mcpReport.meta?.packsLoaded ?? []).slice().sort();
    assert.deepEqual(mcpPacks, cliPacks);
    assert.equal(mcpReport.meta?.rulesEnabled ?? 0, cliReport.meta?.rulesEnabled ?? 0);
  });
});
