/**
 * Tests for the CodeMoreReport → SARIF 2.1.0 converter and the
 * `codemore scan --format sarif` flag.
 *
 * The contract that matters: GitHub code scanning accepts the output.
 * We assert the structural invariants its validator checks — version,
 * runs[0].tool.driver.{name,rules}, results[].ruleId/level/locations —
 * plus our own mapping rules (severity → level, instanceId fingerprint,
 * backslash-free URIs).
 */

import { strict as assert } from 'assert';

import { toSarif } from '../shared/report/sarif';
import { parseScanArgs } from '../daemon/cli/commands/scan';
import type { CodeMoreReport } from '../shared/report/types';

function fakeReport(): CodeMoreReport {
  return {
    schemaVersion: '1.0.0',
    scannedAt: '2026-07-08T00:00:00.000Z',
    tool: { name: 'codemore', version: '0.2.6' },
    project: { root: '.', fingerprint: 'sha256:abc' } as CodeMoreReport['project'],
    summary: {
      issuesTotal: 3,
      bySeverity: { BLOCKER: 1, CRITICAL: 0, MAJOR: 1, MINOR: 1, INFO: 0 },
      byCategory: {},
      filesAnalyzed: 2,
      linesOfCode: 100,
      score: 50,
      technicalDebtMinutes: 30,
    } as unknown as CodeMoreReport['summary'],
    issues: [
      {
        id: 'core-security-eval',
        ruleVersion: '1.0.0',
        instanceId: '01A',
        severity: 'BLOCKER',
        confidence: 0.95,
        category: 'security',
        title: 'eval() on dynamic input',
        evidence: { file: 'src\\app.ts', line: 3, column: 5, snippet: 'eval(x)' },
        whyItMatters: 'why-1',
        citation: 'https://codemore.tech/rules/core-security-eval',
      },
      {
        id: 'core-security-eval',
        ruleVersion: '1.0.0',
        instanceId: '01B',
        severity: 'BLOCKER',
        confidence: 0.95,
        category: 'security',
        title: 'eval() on dynamic input',
        evidence: { file: 'src/other.ts', line: 9, column: 1, endLine: 9, endColumn: 12, snippet: 'eval(y)' },
        whyItMatters: 'why-1',
        citation: 'https://codemore.tech/rules/core-security-eval',
      },
      {
        id: 'core-quality-unused-import',
        ruleVersion: '2.0.0',
        instanceId: '01C',
        severity: 'MINOR',
        confidence: 0.9,
        category: 'code-smell',
        title: 'Unused import',
        evidence: { file: 'src/app.ts', line: 1, column: 0, snippet: 'import x' },
        whyItMatters: 'why-2',
        citation: 'https://codemore.tech/rules/core-quality-unused-import',
      },
    ],
  };
}

describe('SARIF output', () => {
  it('emits valid SARIF 2.1.0 skeleton with one driver rule per distinct rule id', () => {
    const s = toSarif(fakeReport()) as any;
    assert.equal(s.version, '2.1.0');
    assert.match(s.$schema, /sarif-schema-2\.1\.0/);
    assert.equal(s.runs.length, 1);
    assert.equal(s.runs[0].tool.driver.name, 'CodeMore');
    assert.equal(s.runs[0].tool.driver.version, '0.2.6');
    // 3 results but only 2 distinct rules.
    assert.equal(s.runs[0].tool.driver.rules.length, 2);
    assert.equal(s.runs[0].results.length, 3);
    // ruleIndex points back at the right descriptor.
    for (const r of s.runs[0].results) {
      assert.equal(s.runs[0].tool.driver.rules[r.ruleIndex].id, r.ruleId);
    }
  });

  it('maps severities to SARIF levels and preserves the original in properties', () => {
    const s = toSarif(fakeReport()) as any;
    const levels = s.runs[0].results.map((r: any) => r.level);
    assert.deepEqual(levels, ['error', 'error', 'note']);
    assert.equal(s.runs[0].results[0].properties.codemoreSeverity, 'BLOCKER');
  });

  it('normalizes windows paths, clamps column to >=1, carries end positions and instanceId', () => {
    const s = toSarif(fakeReport()) as any;
    const [first, second, third] = s.runs[0].results;
    assert.equal(first.locations[0].physicalLocation.artifactLocation.uri, 'src/app.ts');
    assert.equal(third.locations[0].physicalLocation.region.startColumn, 1); // was 0
    assert.equal(second.locations[0].physicalLocation.region.endLine, 9);
    assert.equal(first.partialFingerprints.codemoreInstanceId, '01A');
  });

  it('parseScanArgs: --format sarif implies machine stdout; bad values rejected', () => {
    const a = parseScanArgs(['.', '--format', 'sarif']);
    assert.equal(a.format, 'sarif');
    assert.equal(a.json, true);
    assert.equal(parseScanArgs(['.']).format, 'json');
    assert.throws(() => parseScanArgs(['.', '--format', 'xml']), /--format expects/);
  });
});
