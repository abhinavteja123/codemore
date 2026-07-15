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
  calculateFileHealthScore,
  calculateHealthScore,
  calculateHealthScoreFromTotals,
  calculateTechnicalDebt,
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
    // Mid-range decay: 79 − (6−1)×2 = 69. Exact value locks the ×2 slope
    // (mutation baseline: `* 2` → `/ 2` survived on the loose bounds).
    assert.equal(severityCap(c({ CRITICAL: 6 })), 69);
    assert.equal(severityCap(c({ CRITICAL: 100 })), 45);  // floor
    assert.equal(severityCap(zero), 100);
    // BLOCKER cap outranks CRITICAL cap
    assert.equal(severityCap(c({ BLOCKER: 1, CRITICAL: 50 })), 59);
  });

  it('totals-based overload applies the same cap', () => {
    const score = calculateHealthScoreFromTotals(c({ BLOCKER: 2, MINOR: 50 }), 400);
    assert.ok(score <= 56, `expected <=56, got ${score}`);
  });

  // Exact-value assertions added from the 2026-07-15 mutation baseline
  // (test/MUTATION-BASELINE.md). The loose `>=`/`<=` bounds above let
  // sign-flip and operand-swap mutants through; these pin the arithmetic.
  describe('exact arithmetic (mutation-baseline kills)', () => {
    it('per-file deduction weights are subtracted, per severity', () => {
      // 100 − 15 − 10 − 5 − 2 = 68. Kills `score -=` → `score +=`
      // (which clamps to 100 and makes every file read perfect).
      assert.equal(calculateFileHealthScore(c({ BLOCKER: 1, CRITICAL: 1, MAJOR: 1, MINOR: 1 })), 68);
      assert.equal(calculateFileHealthScore(c({ INFO: 2 })), 99); // INFO = 0.5 each
      assert.equal(calculateFileHealthScore(zero), 100);
    });

    it('clean files contribute 100 to the per-file average', () => {
      // 1 dirty file (MAJOR:4 → 80) + 9 clean → (80 + 900) / 10 = 98.
      // Kills Math.max(filesAnalyzed, size) → Math.min (drops clean files)
      // and `sumScores / total` → `sumScores * total`.
      const byFile = new Map([['a.ts', c({ MAJOR: 4 })]]);
      assert.equal(calculateHealthScore(byFile, 10), 98);
    });

    it('totals overload: zero issues scores 100, zero files scores 0', () => {
      // Kills `filesAnalyzed === 0` → `!== 0` (every real scan returns 0).
      assert.equal(calculateHealthScoreFromTotals(zero, 10), 100);
      assert.equal(calculateHealthScoreFromTotals(zero, 0), 0);
    });

    it('totals overload normalizes by DIVIDING issue counts by file count', () => {
      // MAJOR: ceil(4/2)=2 → 100−10 = 90 (÷→× mutant gives 60).
      assert.equal(calculateHealthScoreFromTotals(c({ MAJOR: 4 }), 2), 90);
      // CRITICAL: ceil(4/4)=1 → file score 90, cap 79−3×2=73 → 73 (mutant gives 0).
      assert.equal(calculateHealthScoreFromTotals(c({ CRITICAL: 4 }), 4), 73);
    });

    it('technical debt minutes: 120/60/30/10/5 per severity', () => {
      assert.equal(calculateTechnicalDebt(c({ BLOCKER: 1, CRITICAL: 1, MAJOR: 1, MINOR: 1, INFO: 1 })), 225);
    });
  });
});
