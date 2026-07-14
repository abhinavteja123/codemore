/* codemore-ignore-file: core-quality-leftover-console */
/* Telemetry flywheel: verdict derivation (web/src/lib/telemetryVerdicts.ts)
   and the promotion/demotion aggregation (scripts/telemetry-report.js).
   Thresholds under test mirror PROMOTION_THRESHOLDS in shared/rules/lifecycle.ts. */

import { strict as assert } from "assert";
import { deriveVerdict, deriveRuleEvents } from "../web/src/lib/telemetryVerdicts";

// CommonJS script — exports computeFlywheel for exactly this test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeFlywheel, THRESHOLDS } = require("../scripts/telemetry-report.js");

describe("telemetry verdict derivation", () => {
  it("maps vote/context to verdicts", () => {
    assert.equal(deriveVerdict({ id: "r", vote: "down" }), "fp");
    assert.equal(deriveVerdict({ id: "r", vote: "up" }), "tp");
    assert.equal(deriveVerdict({ id: "r", context: "resolved" }), "tp");
    assert.equal(deriveVerdict({ id: "r", context: "suppressed" }), "suppressed");
    assert.equal(deriveVerdict({ id: "r", context: "fired" }), null);
    assert.equal(deriveVerdict({ id: "r" }), null);
    // An explicit down-vote outranks a resolved context.
    assert.equal(deriveVerdict({ id: "r", vote: "down", context: "resolved" }), "fp");
  });

  it("fans rules out to rows, dropping verdict-less pings", () => {
    const rows = deriveRuleEvents(
      [
        { id: "a", vote: "up" },
        { id: "b", context: "fired" },
        { id: "c", context: "suppressed" },
      ],
      "0.2.8"
    );
    assert.deepEqual(rows, [
      { rule_id: "a", verdict: "tp", tool_version: "0.2.8" },
      { rule_id: "c", verdict: "suppressed", tool_version: "0.2.8" },
    ]);
  });
});

describe("flywheel aggregation (computeFlywheel)", () => {
  const catalog = new Map([
    ["good-beta", "beta"],
    ["thin-beta", "beta"],
    ["noisy-beta", "beta"],
    ["noisy-exp", "experimental"],
  ]);

  const stats = [
    // 48 tp / 2 fp = 4% FP over 50 verdicts -> promotion candidate (<5%).
    { rule_id: "good-beta", tp: 48, fp: 2, suppressed: 5 },
    // 0% FP but only 49 verdicts -> below minEvents, no candidate.
    { rule_id: "thin-beta", tp: 49, fp: 0, suppressed: 0 },
    // 15% FP over 60 verdicts -> demotion alert (>10%).
    { rule_id: "noisy-beta", tp: 51, fp: 9, suppressed: 0 },
    // Same rate but experimental -> not default-on, no alert.
    { rule_id: "noisy-exp", tp: 51, fp: 9, suppressed: 0 },
    // Suppressions only -> no verdicts, fpRate null, in neither list.
    { rule_id: "unknown-rule", tp: 0, fp: 0, suppressed: 20 },
  ];

  const result = computeFlywheel(stats, catalog, THRESHOLDS);

  it("computes FP rate from tp+fp only (suppressions excluded)", () => {
    const good = result.rules.find((r: { ruleId: string }) => r.ruleId === "good-beta");
    assert.equal(good.verdicts, 50);
    assert.ok(Math.abs(good.fpRate - 0.04) < 1e-9);
  });

  it("promotes only beta rules meeting rate AND minEvents", () => {
    assert.deepEqual(
      result.promotionCandidates.map((r: { ruleId: string }) => r.ruleId),
      ["good-beta"]
    );
  });

  it("alerts only default-on rules over the demotion threshold", () => {
    assert.deepEqual(
      result.demotionAlerts.map((r: { ruleId: string }) => r.ruleId),
      ["noisy-beta"]
    );
  });

  it("marks rules missing from the catalog and null rates", () => {
    const unknown = result.rules.find((r: { ruleId: string }) => r.ruleId === "unknown-rule");
    assert.equal(unknown.lifecycle, "unknown");
    assert.equal(unknown.fpRate, null);
  });
});
