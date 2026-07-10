/**
 * Health-score tests — the "300 findings but 96/100" regression.
 *
 * The per-file average is kept as the base (it scales with codebase size),
 * but the aggregate is capped by the worst severity present: a project with
 * a live BLOCKER must never read as healthy no matter how many clean files
 * dilute the average.
 */

import { strict as assert } from 'assert';

import {
  calculateHealthScore,
  calculateHealthScoreFromTotals,
  severityCap,
  type IssueSeverityCounts,
} from '../shared/scoring';

const zero: IssueSeverityCounts = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
const c = (partial: Partial<IssueSeverityCounts>): IssueSeverityCounts => ({ ...zero, ...partial });

describe('health scoring', () => {
  it('clean project scores 100; empty project scores 0', () => {
    assert.equal(calculateHealthScore(new Map(), 50), 100);
    assert.equal(calculateHealthScore(new Map(), 0), 0);
  });

  it('minor-only noise on a large codebase may stay high (per-file average intact)', () => {
    const byFile = new Map([['a.ts', c({ MINOR: 3 })], ['b.ts', c({ INFO: 5 })]]);
    const score = calculateHealthScore(byFile, 500);
    assert.ok(score >= 95, `expected >=95, got ${score}`);
  });

  it('REGRESSION: a BLOCKER buried in 500 clean files can no longer read 96', () => {
    const byFile = new Map([['auth.ts', c({ BLOCKER: 1 })]]);
    const score = calculateHealthScore(byFile, 500);
    assert.ok(score <= 59, `expected <=59 with a live BLOCKER, got ${score}`);
  });

  it('caps tighten with count and floor out', () => {
    assert.equal(severityCap(c({ BLOCKER: 1 })), 59);
    assert.equal(severityCap(c({ BLOCKER: 5 })), 47);
    assert.equal(severityCap(c({ BLOCKER: 100 })), 25);   // floor
    assert.equal(severityCap(c({ CRITICAL: 1 })), 79);
    assert.equal(severityCap(c({ CRITICAL: 100 })), 45);  // floor
    assert.equal(severityCap(zero), 100);
    // BLOCKER cap outranks CRITICAL cap
    assert.equal(severityCap(c({ BLOCKER: 1, CRITICAL: 50 })), 59);
  });

  it('totals-based overload applies the same cap', () => {
    const score = calculateHealthScoreFromTotals(c({ BLOCKER: 2, MINOR: 50 }), 400);
    assert.ok(score <= 56, `expected <=56, got ${score}`);
  });
});
