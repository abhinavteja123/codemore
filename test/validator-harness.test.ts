/**
 * White-box tests for the agentic-loop validator harness
 * (daemon/services/validatorHarness.ts, PLAN.md Track A / A2).
 *
 * The happy path (a fix that fully resolves the targeted issue) is already
 * exercised indirectly through test/agentic-fixer.test.ts, which drives the
 * whole loop. This file targets the harness's own branch logic that the
 * loop tests don't isolate:
 *
 *   - PARTIAL PASS: the targeted issue (specific rule + line) is resolved,
 *     but the SAME rule still fires elsewhere on the file. The agent fixes
 *     one issue at a time, so this must report passed=true with
 *     ruleFiresElsewhere=true (validatorHarness.ts:163-168).
 *   - LINE-DRIFT TOLERANCE: a still-firing finding within ±3 lines of the
 *     original counts as "not resolved" (fail); one further away counts as
 *     resolved (pass) (validatorHarness.ts:80,153-156).
 *   - includeOtherRules: remainingFindings widens to every rule's findings.
 *   - CRASH RESILIENCE: pathological input (unknown rule id, empty content,
 *     non-TS extension) must return a verdict, never throw.
 *
 * Issues are built by scanning real fixtures through the registry — the
 * same construction the MCP validate_fix tool uses — rather than
 * hand-rolling a ReportIssue, so the evidence.line values are authentic.
 */

import { strict as assert } from 'assert';
import * as ts from 'typescript';

import { registerAllPacks } from '../daemon/cli/registerPacks';
import { globalRegistry } from '../shared/rules/registry';
import { validateFix } from '../daemon/services/validatorHarness';
import type { ReportIssue } from '../shared/report/types';
import type { RuleContext } from '../shared/rules/Rule';

/** Scan `content` as a TS file and return every finding, so a test can
 *  pick the specific issue it wants to hand to validateFix. */
function scan(relPath: string, content: string): ReportIssue[] {
  const ctx: RuleContext = {
    filePath: relPath,
    extension: '.ts',
    language: 'typescript',
    content,
    lines: content.split('\n'),
    sourceFile: ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true),
    frameworks: [],
  };
  return globalRegistry.scanFile(ctx, { enableExperimental: true }).issues;
}

// Two functions, each with an unreachable statement after `return`. The
// rule core-quality-unreachable-code fires once per function.
const TWO_UNREACHABLE = [
  'export function a(): string {',
  '  return "a";',
  '  cleanup();',            // unreachable #1
  '}',
  '',
  'export function b(): string {',
  '  return "b";',
  '  cleanup();',            // unreachable #2
  '}',
  '',
  'function cleanup(): void {}',
  '',
].join('\n');

// Same, but function a's unreachable line removed. Function b's remains.
const FIRST_FIXED = [
  'export function a(): string {',
  '  return "a";',
  '}',
  '',
  'export function b(): string {',
  '  return "b";',
  '  cleanup();',            // still unreachable
  '}',
  '',
  'function cleanup(): void {}',
  '',
].join('\n');

// Both unreachable lines removed — the rule fires nowhere.
const BOTH_FIXED = [
  'export function a(): string {',
  '  return "a";',
  '}',
  '',
  'export function b(): string {',
  '  return "b";',
  '}',
  '',
  'function cleanup(): void {}',
  '',
].join('\n');

const RULE = 'core-quality-unreachable-code';

let firstIssue: ReportIssue;
let secondIssue: ReportIssue;

before(() => {
  registerAllPacks();
  const findings = scan('src/pivot.ts', TWO_UNREACHABLE)
    .filter(i => i.id === RULE)
    .sort((x, y) => x.evidence.line - y.evidence.line);
  assert.equal(findings.length, 2, `setup: expected 2 ${RULE} findings, got ${findings.length}`);
  firstIssue = findings[0];
  secondIssue = findings[1];
});

describe('validatorHarness: verdict branches', () => {
  it('FULL PASS: both instances removed → passed, rule fires nowhere', () => {
    const res = validateFix(firstIssue, BOTH_FIXED);
    assert.equal(res.passed, true);
    assert.equal(res.ruleFiresElsewhere, false);
    assert.equal(res.remainingForRule, 0);
    assert.match(res.summary, /no longer fires anywhere/);
  });

  it('PARTIAL PASS: targeted line fixed but same rule fires elsewhere → passed + ruleFiresElsewhere', () => {
    const res = validateFix(firstIssue, FIRST_FIXED);
    assert.equal(res.passed, true, 'the targeted issue (function a) is resolved');
    assert.equal(res.ruleFiresElsewhere, true, 'the rule still fires in function b');
    assert.equal(res.remainingForRule, 1);
    assert.equal(res.ruleStillFires, false);
    assert.match(res.summary, /still fires elsewhere/);
  });

  it('FAIL: patch that resolves NOTHING → still fires at the target line', () => {
    // Hand back the original content unchanged: the targeted finding is
    // still exactly where it was.
    const res = validateFix(firstIssue, TWO_UNREACHABLE);
    assert.equal(res.passed, false);
    assert.equal(res.ruleStillFires, true);
    assert.match(res.summary, /^FAIL/);
  });

  it('FAIL from the SECOND issue perspective when only the first was fixed', () => {
    // secondIssue is function b's finding; FIRST_FIXED leaves b untouched,
    // so from b's perspective nothing was resolved.
    const res = validateFix(secondIssue, FIRST_FIXED);
    assert.equal(res.passed, false);
    assert.equal(res.ruleStillFires, true);
  });
});

describe('validatorHarness: line-drift tolerance (±3)', () => {
  it('a still-firing finding within 3 lines of the original counts as NOT resolved', () => {
    // Prepend 2 blank lines: function a's unreachable shifts down by 2
    // lines (< 3 tolerance) but is otherwise unchanged → still fail.
    const shifted = '\n\n' + TWO_UNREACHABLE;
    const res = validateFix(firstIssue, shifted);
    assert.equal(res.passed, false, 'a <=3-line shift must not be mistaken for a fix');
  });

  it('a finding more than 3 lines away is treated as the targeted issue resolved', () => {
    // Prepend 6 blank lines: the original finding line is now empty and the
    // rule fires only >3 lines away → targeted issue counts as resolved.
    const shifted = '\n'.repeat(6) + TWO_UNREACHABLE;
    const res = validateFix(firstIssue, shifted);
    assert.equal(res.passed, true, 'a finding beyond the drift tolerance is a different location');
    assert.equal(res.ruleFiresElsewhere, true);
  });
});

describe('validatorHarness: options + resilience', () => {
  it('includeOtherRules widens remainingFindings beyond the targeted rule', () => {
    const only = validateFix(firstIssue, FIRST_FIXED);
    const withOthers = validateFix(firstIssue, FIRST_FIXED, { includeOtherRules: true });
    // The default only lists the targeted rule's remaining findings.
    assert.ok(only.remainingFindings.every(f => f.id === RULE));
    // With the flag, at least as many findings are surfaced (other rules
    // may or may not fire on the fixture, so assert a superset, not >).
    assert.ok(withOthers.remainingFindings.length >= only.remainingFindings.length);
  });

  it('does not throw on an unknown rule id — returns passed (nothing to still-fire)', () => {
    const bogus: ReportIssue = { ...firstIssue, id: 'this-rule-does-not-exist' };
    const res = validateFix(bogus, BOTH_FIXED);
    assert.equal(res.passed, true);
    assert.equal(res.remainingForRule, 0);
  });

  it('does not throw on empty content', () => {
    const res = validateFix(firstIssue, '');
    assert.equal(res.passed, true);
    assert.ok(Array.isArray(res.diagnostics));
  });

  it('does not throw when the file extension is not TS/JS (no sourceFile built)', () => {
    const nonTs: ReportIssue = {
      ...firstIssue,
      evidence: { ...firstIssue.evidence, file: 'notes/readme.md' },
    };
    // buildContext infers a non-TS language and builds no sourceFile; AST
    // rules simply produce no findings rather than crashing.
    const res = validateFix(nonTs, '# just markdown\n');
    assert.equal(res.passed, true);
    assert.ok(Array.isArray(res.remainingFindings));
  });
});
