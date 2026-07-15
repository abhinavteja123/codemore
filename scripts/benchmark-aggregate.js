#!/usr/bin/env node
/* codemore-ignore-file: core-quality-leftover-console */
/* Aggregator — console output IS the deliverable (prints JSON). */

/* eslint-disable no-console */

/**
 * Phase 6 benchmark aggregation.
 *
 * Reads benchmark/results/<n>.json (gitignored) joined to
 * benchmark/targets.json by index and prints aggregate JSON:
 * blocker rate, top rules by repos-affected, findings-per-repo
 * distribution, and breakdown by selection-signal group.
 *
 * Aggregates only — no repo identity is ever paired with a finding.
 *
 * Usage: node scripts/benchmark-aggregate.js
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const targets = JSON.parse(fs.readFileSync(path.join(repoRoot, 'benchmark', 'targets.json'), 'utf8'));
const resultsDir = path.join(repoRoot, 'benchmark', 'results');

/** lovable/bolt/cursor/v0/claude-code/vibe-coded vs AI-starter vs hackathon */
function signalGroup(signal) {
  if (/hackathon/i.test(signal)) return 'hackathon';
  if (/AI-starter/i.test(signal)) return 'starter';
  return 'ai-builder';
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const repos = [];
for (let n = 0; n < targets.length; n++) {
  const file = path.join(resultsDir, `${n}.json`);
  if (!fs.existsSync(file)) continue;
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  repos.push({
    n,
    group: signalGroup(targets[n].signal),
    stack: targets[n].stack,
    summary: report.summary,
    issues: report.issues,
    version: report.tool && report.tool.version,
  });
}

// --- rule stats: repos-affected first, so one 2468-issue repo can't dominate ---
const ruleStats = new Map();
for (const r of repos) {
  const perRepo = new Map();
  for (const iss of r.issues) {
    perRepo.set(iss.id, (perRepo.get(iss.id) || 0) + 1);
  }
  for (const [id, count] of perRepo) {
    const s = ruleStats.get(id) || { rule: id, reposAffected: 0, totalFindings: 0, severity: null };
    s.reposAffected++;
    s.totalFindings += count;
    if (!s.severity) s.severity = r.issues.find((i) => i.id === id).severity;
    ruleStats.set(id, s);
  }
}
const rulesRanked = [...ruleStats.values()].sort(
  (a, b) => b.reposAffected - a.reposAffected || b.totalFindings - a.totalFindings
);

// --- findings-per-repo distribution ---
const totals = repos.map((r) => r.summary.issuesTotal).sort((a, b) => a - b);
const scores = repos.map((r) => r.summary.score);
const buckets = { '0': 0, '1-10': 0, '11-50': 0, '51-200': 0, '201-1000': 0, '>1000': 0 };
for (const t of totals) {
  if (t === 0) buckets['0']++;
  else if (t <= 10) buckets['1-10']++;
  else if (t <= 50) buckets['11-50']++;
  else if (t <= 200) buckets['51-200']++;
  else if (t <= 1000) buckets['201-1000']++;
  else buckets['>1000']++;
}

// --- severity reach ---
const severities = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const severityReach = {};
for (const sev of severities) {
  severityReach[sev] = repos.filter((r) => (r.summary.bySeverity[sev] || 0) > 0).length;
}

// --- per signal group ---
const groups = {};
for (const r of repos) {
  const g = (groups[r.group] = groups[r.group] || { repos: 0, withBlocker: 0, totals: [], scores: [] });
  g.repos++;
  if ((r.summary.bySeverity.BLOCKER || 0) > 0) g.withBlocker++;
  g.totals.push(r.summary.issuesTotal);
  g.scores.push(r.summary.score);
}
const byGroup = {};
for (const [name, g] of Object.entries(groups)) {
  const sorted = [...g.totals].sort((a, b) => a - b);
  byGroup[name] = {
    repos: g.repos,
    pctWithBlocker: Math.round((g.withBlocker / g.repos) * 100),
    medianFindings: percentile(sorted, 0.5),
    meanScore: Math.round(g.scores.reduce((a, b) => a + b, 0) / g.repos),
  };
}

const out = {
  scanVersion: repos[0] && repos[0].version,
  reposScanned: repos.length,
  reposWithBlocker: severityReach.BLOCKER,
  pctWithBlocker: Math.round((severityReach.BLOCKER / repos.length) * 100),
  severityReach,
  findingsPerRepo: {
    min: totals[0],
    p25: percentile(totals, 0.25),
    median: percentile(totals, 0.5),
    p75: percentile(totals, 0.75),
    p90: percentile(totals, 0.9),
    max: totals[totals.length - 1],
    mean: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
    totalFindings: totals.reduce((a, b) => a + b, 0),
    buckets,
  },
  scores: {
    min: Math.min(...scores),
    max: Math.max(...scores),
    mean: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  },
  topRulesByReposAffected: rulesRanked.slice(0, 10),
  rulesFiredTotal: rulesRanked.length,
  byGroup,
};

console.log(JSON.stringify(out, null, 2));
