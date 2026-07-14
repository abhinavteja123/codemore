#!/usr/bin/env node
/**
 * Telemetry flywheel report — per-rule FP rates over the trailing 30 days.
 *
 * Reads the `rule_events_stats_30d` Supabase view (migration 007) and the
 * rule catalog (shared/packs/), then prints:
 *   - a per-rule table: lifecycle, tp / fp / suppressed counts, FP rate
 *   - PROMOTION CANDIDATES: beta rules with FP rate < 5% over >= 50 verdicts
 *   - DEMOTION ALERTS:      default-on rules with FP rate > 10% over >= 50 verdicts
 *
 * FP rate = fp / (tp + fp). Suppressions are shown but not counted in the
 * rate (a suppression is "don't tell me again", not necessarily "wrong").
 * Thresholds mirror PROMOTION_THRESHOLDS in shared/rules/lifecycle.ts —
 * keep in sync.
 *
 * Env (service-role — the table/view is RLS-locked to everyone else):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/telemetry-report.js          # human table
 *   node scripts/telemetry-report.js --json   # machine output (used by
 *                                             # .github/workflows/auto-demote-rules.yml)
 *
 * Promotion itself is a human PR — see CONTRIBUTING-RULES.md "Promoting a
 * rule". This script only surfaces the evidence.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(REPO, 'shared', 'packs');

// Keep in sync with shared/rules/lifecycle.ts PROMOTION_THRESHOLDS.
const THRESHOLDS = {
  promoteMaxFpRate: 0.05, // betaToStable.maxFpRate
  demoteFpRate: 0.10,     // autoDemoteFromStable.fpRateTrigger
  minEvents: 50,          // minimum (tp + fp) verdicts for a meaningful rate
  windowDays: 30,
};

/** Parse rule id + lifecycle out of every rule module under shared/packs/. */
function loadCatalog() {
  const catalog = new Map(); // ruleId -> lifecycle
  for (const pack of fs.readdirSync(PACKS_DIR)) {
    const packDir = path.join(PACKS_DIR, pack);
    if (!fs.statSync(packDir).isDirectory()) continue;
    for (const file of fs.readdirSync(packDir)) {
      if (!file.endsWith('.ts') || file === 'index.ts') continue;
      const src = fs.readFileSync(path.join(packDir, file), 'utf8');
      const id = src.match(/id:\s*['"]([a-z][a-z0-9-]+)['"]/);
      const lifecycle = src.match(/lifecycle:\s*['"](experimental|beta|stable|deprecated)['"]/);
      if (id && lifecycle) catalog.set(id[1], lifecycle[1]);
    }
  }
  return catalog;
}

/**
 * Pure aggregation — exported for the unit test.
 * @param statsRows rows from rule_events_stats_30d: { rule_id, tp, fp, suppressed }
 * @param catalog   Map<ruleId, lifecycle>
 */
function computeFlywheel(statsRows, catalog, thresholds = THRESHOLDS) {
  const rules = statsRows.map(row => {
    const tp = Number(row.tp) || 0;
    const fp = Number(row.fp) || 0;
    const suppressed = Number(row.suppressed) || 0;
    const verdicts = tp + fp;
    const fpRate = verdicts > 0 ? fp / verdicts : null;
    return {
      ruleId: row.rule_id,
      lifecycle: catalog.get(row.rule_id) ?? 'unknown',
      tp, fp, suppressed, verdicts, fpRate,
    };
  }).sort((a, b) => (b.fpRate ?? -1) - (a.fpRate ?? -1));

  const promotionCandidates = rules.filter(r =>
    r.lifecycle === 'beta' &&
    r.verdicts >= thresholds.minEvents &&
    r.fpRate !== null && r.fpRate < thresholds.promoteMaxFpRate);

  // ponytail: single 30-day window, not "sustained over 14 days" — add a
  // day-bucketed view if the coarse window ever flags rules unfairly.
  const demotionAlerts = rules.filter(r =>
    (r.lifecycle === 'beta' || r.lifecycle === 'stable') &&
    r.verdicts >= thresholds.minEvents &&
    r.fpRate !== null && r.fpRate > thresholds.demoteFpRate);

  return { windowDays: thresholds.windowDays, rules, promotionCandidates, demotionAlerts };
}

async function fetchStats() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    process.stderr.write(
      'telemetry-report: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and ' +
      'SUPABASE_SERVICE_ROLE_KEY must be set.\n');
    process.exit(2);
  }
  const res = await fetch(`${url}/rest/v1/rule_events_stats_30d?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    process.stderr.write(`telemetry-report: Supabase returned ${res.status}: ${await res.text()}\n`);
    process.exit(2);
  }
  return res.json();
}

function pct(rate) {
  return rate === null ? '   -' : `${(rate * 100).toFixed(1)}%`.padStart(5);
}

function printHuman(result, catalogSize) {
  console.log(`Telemetry flywheel report — trailing ${result.windowDays} days`);
  console.log(`Catalog: ${catalogSize} rules · ${result.rules.length} with recorded verdicts\n`);

  if (result.rules.length === 0) {
    console.log('No rule_events rows in the window. Telemetry is opt-in (--telemetry) —');
    console.log('the flywheel starts turning once real-world verdicts arrive.');
    return;
  }

  const idW = Math.max(...result.rules.map(r => r.ruleId.length), 4);
  const head = `${'rule'.padEnd(idW)}  lifecycle     tp    fp  suppr  fpRate`;
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of result.rules) {
    console.log(
      `${r.ruleId.padEnd(idW)}  ${r.lifecycle.padEnd(12)}` +
      `${String(r.tp).padStart(4)}  ${String(r.fp).padStart(4)}  ${String(r.suppressed).padStart(5)}  ${pct(r.fpRate)}`);
  }
  console.log('-'.repeat(head.length));

  console.log(`\nPROMOTION CANDIDATES (beta → stable: FP rate < ${THRESHOLDS.promoteMaxFpRate * 100}% over >= ${THRESHOLDS.minEvents} verdicts):`);
  if (result.promotionCandidates.length === 0) console.log('  (none yet)');
  for (const r of result.promotionCandidates) {
    console.log(`  ${r.ruleId} — ${pct(r.fpRate).trim()} FP over ${r.verdicts} verdicts. Open a promotion PR (see CONTRIBUTING-RULES.md).`);
  }

  console.log(`\nDEMOTION ALERTS (FP rate > ${THRESHOLDS.demoteFpRate * 100}% over >= ${THRESHOLDS.minEvents} verdicts):`);
  if (result.demotionAlerts.length === 0) console.log('  (none)');
  for (const r of result.demotionAlerts) {
    console.log(`  ${r.ruleId} (${r.lifecycle}) — ${pct(r.fpRate).trim()} FP over ${r.verdicts} verdicts. Needs human demotion review.`);
  }
}

async function main() {
  const catalog = loadCatalog();
  const stats = await fetchStats();
  const result = computeFlywheel(stats, catalog);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
  } else {
    printHuman(result, catalog.size);
  }
}

module.exports = { computeFlywheel, loadCatalog, THRESHOLDS };

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`telemetry-report: ${err.stack || err}\n`);
    process.exit(2);
  });
}
