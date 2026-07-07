/**
 * White-box tests for the external-tool adapter parsers
 * (daemon/external/*.ts, PLAN.md Track A / A1).
 *
 * Each adapter wraps an industry linter's `--json` output. The contract the
 * plan pins down: **malformed or old-version output must fail LOUD (a
 * `level:'error'` diagnostic), never a silent zero-findings result.** That
 * "silent zero" is the stale-biome bug class — an old tool binary that
 * ignores the JSON flag and prints text, or a new major version that
 * renamed the top-level container, both of which previously flattened to
 * "0 findings, ran ok" with no signal.
 *
 * The parse+shape step of every adapter is now an exported pure function
 * (`parseXOutput(stdout)`), so we feed each one canned strings directly —
 * no child process, no spawn mock. Four cases per adapter:
 *   - good:     representative JSON -> findings parsed, NO diagnostic
 *   - empty:    "" (tool ran, found nothing) -> empty value, NO diagnostic
 *   - malformed: non-JSON text -> null value + error diagnostic
 *   - drift:    valid JSON, wrong shape -> null value + error diagnostic
 *
 * Each `drift`/`malformed` assertion asserts BOTH `value === null` AND an
 * error diagnostic: a parser that silently returned an empty result (the
 * bug) would fail these, so the tests have teeth.
 */

import { strict as assert } from 'assert';

import { parseBanditOutput } from '../daemon/external/bandit';
import { parseBiomeOutput } from '../daemon/external/biome';
import { parseGolangciOutput } from '../daemon/external/golangci';
import { parseNpmAuditOutput } from '../daemon/external/npm-audit';
import { parsePipAuditOutput } from '../daemon/external/pip-audit';
import { parseGitleaksOutput } from '../daemon/external/gitleaks';
import { parseRuffOutput } from '../daemon/external/ruff';
import { parseClippyOutput } from '../daemon/external/clippy';

describe('external adapters: bandit parser', () => {
  it('parses a well-formed results payload', () => {
    const out = parseBanditOutput(JSON.stringify({
      results: [{ filename: '/x.py', test_id: 'B102', test_name: 'exec_used', issue_severity: 'HIGH', issue_text: 'exec', line_number: 1 }],
    }));
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.value?.results?.length, 1);
  });
  it('treats empty stdout as a clean run, no diagnostic', () => {
    const out = parseBanditOutput('');
    assert.equal(out.diagnostic, undefined);
    assert.deepEqual(out.value, { results: [] });
  });
  it('fails loud on non-JSON output (old binary printing text)', () => {
    const out = parseBanditOutput('[main]\tINFO\tprofile include tests: None');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /failed to parse bandit/);
  });
  it('fails loud on valid JSON missing the "results" array (version drift)', () => {
    const out = parseBanditOutput(JSON.stringify({ errors: [], generated_at: '2026-07-07' }));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /results/);
  });
});

describe('external adapters: biome parser', () => {
  it('parses a well-formed diagnostics payload', () => {
    const out = parseBiomeOutput(JSON.stringify({
      diagnostics: [{ category: 'lint/correctness/noUnusedVariables', severity: 'error', description: 'x', location: { path: { file: '/x.ts' }, span: [0, 5] } }],
    }));
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.value?.length, 1);
  });
  it('treats empty stdout as a clean run', () => {
    const out = parseBiomeOutput('');
    assert.equal(out.diagnostic, undefined);
    assert.deepEqual(out.value, []);
  });
  it('fails loud on non-JSON output (stale biome ignoring --reporter=json)', () => {
    const out = parseBiomeOutput('Checked 3 files in 12ms. No fixes applied.');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /failed to parse biome/);
  });
  it('fails loud on valid JSON missing the "diagnostics" array', () => {
    const out = parseBiomeOutput(JSON.stringify({ summary: { errors: 0 } }));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /diagnostics/);
  });
});

describe('external adapters: golangci parser', () => {
  it('parses a well-formed Issues payload', () => {
    const out = parseGolangciOutput(JSON.stringify({
      Issues: [{ FromLinter: 'govet', Text: 'x', Pos: { Filename: '/x.go', Line: 1, Column: 1 } }],
    }));
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.value?.length, 1);
  });
  it('accepts "Issues": null as a clean run (Go marshals empty slice as null)', () => {
    const out = parseGolangciOutput(JSON.stringify({ Issues: null, Report: {} }));
    assert.equal(out.diagnostic, undefined);
    assert.deepEqual(out.value, []);
  });
  it('fails loud on valid JSON with NO Issues key (schema drift)', () => {
    const out = parseGolangciOutput(JSON.stringify({ Report: {} }));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /Issues/);
  });
  it('fails loud on non-JSON output', () => {
    const out = parseGolangciOutput('level=error msg="something broke"');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
});

describe('external adapters: npm-audit parser', () => {
  it('parses a well-formed v7+ vulnerabilities payload', () => {
    const out = parseNpmAuditOutput(JSON.stringify({
      vulnerabilities: { lodash: { name: 'lodash', severity: 'high', via: [{ title: 'proto' }], range: '<4.17.21' } },
    }));
    assert.equal(out.diagnostic, undefined);
    assert.equal(Object.keys(out.value?.vulnerabilities ?? {}).length, 1);
  });
  it('fails loud on npm v6 output shape ("advisories", not "vulnerabilities")', () => {
    const out = parseNpmAuditOutput(JSON.stringify({ advisories: {}, actions: [], metadata: {} }));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /vulnerabilities/);
  });
  it('fails loud on non-JSON output', () => {
    const out = parseNpmAuditOutput('npm ERR! code ENOLOCK');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
});

describe('external adapters: pip-audit parser', () => {
  it('parses a well-formed dependencies payload', () => {
    const out = parsePipAuditOutput(JSON.stringify({
      dependencies: [{ name: 'flask', version: '1.0', vulns: [{ id: 'CVE-1' }] }],
    }));
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.value?.dependencies?.length, 1);
  });
  it('fails loud on the old flat-array format (no "dependencies" object)', () => {
    const out = parsePipAuditOutput(JSON.stringify([{ name: 'flask', vulns: [] }]));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /dependencies/);
  });
  it('fails loud on non-JSON output', () => {
    const out = parsePipAuditOutput('No known vulnerabilities found');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
});

describe('external adapters: gitleaks parser', () => {
  it('parses a well-formed findings array', () => {
    const out = parseGitleaksOutput(JSON.stringify([{ RuleID: 'aws-key', File: '/x', StartLine: 1, Secret: 'AKIA...' }]));
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.value?.length, 1);
  });
  it('treats "null" and empty as a clean run', () => {
    assert.deepEqual(parseGitleaksOutput('null').value, []);
    assert.deepEqual(parseGitleaksOutput('').value, []);
    assert.equal(parseGitleaksOutput('null').diagnostic, undefined);
  });
  it('fails loud when output is an object, not an array (schema drift)', () => {
    const out = parseGitleaksOutput(JSON.stringify({ findings: [] }));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
  it('fails loud on non-JSON output', () => {
    const out = parseGitleaksOutput('INF scanning for exposed secrets...');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
});

describe('external adapters: ruff parser', () => {
  it('parses a well-formed diagnostics array', () => {
    const out = parseRuffOutput(JSON.stringify([{ code: 'E501', message: 'line too long', filename: '/x.py', location: { row: 1, column: 1 } }]));
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.value?.length, 1);
  });
  it('treats empty stdout as a clean run', () => {
    assert.deepEqual(parseRuffOutput('').value, []);
    assert.equal(parseRuffOutput('').diagnostic, undefined);
  });
  it('fails loud when output is an object, not an array (version drift)', () => {
    const out = parseRuffOutput(JSON.stringify({ E501: 1 }));
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
  it('fails loud on the old text format', () => {
    const out = parseRuffOutput('x.py:1:1: E501 line too long');
    assert.equal(out.value, null);
    assert.equal(out.diagnostic?.level, 'error');
  });
});

describe('external adapters: clippy parser (NDJSON)', () => {
  it('keeps compiler-message records, ignores build noise', () => {
    const stdout = [
      JSON.stringify({ reason: 'compiler-artifact' }),
      JSON.stringify({ reason: 'compiler-message', message: { code: { code: 'clippy::needless_collect' }, level: 'warning', message: 'bad', spans: [] } }),
    ].join('\n');
    const out = parseClippyOutput(stdout);
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.messages.length, 1);
  });
  it('a clean build (JSON records, zero compiler-messages) is NOT an error', () => {
    const stdout = [
      JSON.stringify({ reason: 'compiler-artifact' }),
      JSON.stringify({ reason: 'build-finished', success: true }),
    ].join('\n');
    const out = parseClippyOutput(stdout);
    assert.equal(out.diagnostic, undefined, 'zero findings on a clean build must not raise a drift error');
    assert.equal(out.messages.length, 0);
  });
  it('fails loud when output has content but NOT ONE line is JSON (cargo format drift)', () => {
    const out = parseClippyOutput('error: could not compile `foo`\nwarning: unused variable');
    assert.equal(out.messages.length, 0);
    assert.equal(out.diagnostic?.level, 'error');
    assert.match(out.diagnostic!.message, /drift|non-JSON/);
  });
  it('treats empty stdout as a clean run', () => {
    const out = parseClippyOutput('');
    assert.equal(out.diagnostic, undefined);
    assert.equal(out.messages.length, 0);
  });
});
