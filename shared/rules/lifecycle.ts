/**
 * Rule Lifecycle Policy
 *
 * Controls which rules ship enabled-by-default and how telemetry promotes
 * or demotes them between states. See CONTRIBUTING-RULES.md for the
 * promotion/demotion criteria.
 */

import type { Lifecycle } from '../report/types';

export const LIFECYCLE_ORDER: ReadonlyArray<Lifecycle> = [
  'experimental',
  'beta',
  'stable',
  'deprecated',
];

/**
 * Whether a rule at this lifecycle state runs by default in the default pack.
 *
 * - experimental: opt-in only (must be enabled via .codemorerc.json)
 * - beta: default-on, surfaces as MINOR or below unless severity overridden
 * - stable: default-on at declared severity
 * - deprecated: still runs (for one major), tagged in output, emits a notice
 */
export function isEnabledByDefault(lifecycle: Lifecycle): boolean {
  return lifecycle === 'beta' || lifecycle === 'stable' || lifecycle === 'deprecated';
}

/**
 * Maximum confidence allowed at each state.
 *
 * Experimental findings are clamped to a low ceiling so noisy detectors
 * cannot flood the user's view before they earn promotion.
 */
export function maxConfidenceFor(lifecycle: Lifecycle): number {
  switch (lifecycle) {
    case 'experimental': return 0.6;
    case 'beta':         return 0.85;
    case 'stable':       return 1.0;
    case 'deprecated':   return 0.75;
  }
}

/**
 * Promotion thresholds (used by the telemetry-driven lifecycle bot).
 *
 * - To promote experimental → beta: need >=3 fixture pairs AND
 *   <15% false-positive rate over 7+ days of opt-in telemetry.
 * - To promote beta → stable: need <5% false-positive rate over
 *   30+ days of opt-in telemetry, with at least `minEvents` recorded
 *   verdicts so the rate is statistically meaningful.
 * - Auto-demote when telemetry FP rate crosses 10%: the nightly
 *   workflow (.github/workflows/auto-demote-rules.yml) opens an
 *   ISSUE tagging the rule for human demotion review — demotion
 *   itself, like promotion, always lands via a human PR.
 *
 * scripts/telemetry-report.js mirrors these numbers — keep in sync.
 */
export const PROMOTION_THRESHOLDS = {
  experimentalToBeta: { minFixturePairs: 3, maxFpRate: 0.15, minTelemetryDays: 7 },
  betaToStable:       { minFixturePairs: 3, maxFpRate: 0.05, minTelemetryDays: 30, minEvents: 50 },
  autoDemoteFromStable: { fpRateTrigger: 0.10, sustainedDays: 14, minEvents: 50 },
} as const;
