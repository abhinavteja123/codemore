#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Self-test corpus runner.
 *
 * Reads samples.json, scans each entry, aggregates per-rule hit counts
 * and per-sample scores, writes SAMPLES_REPORT.md.
 *
 * Each sample is one of:
 *   - { source: "local",  path: "/abs/path/to/app" }
 *   - { source: "git",    url: "https://...", ref?: "main", subpath?: "examples/foo" }
 *
 * Git samples are cloned into samples.json -> cacheDir (default
 * .samples-cache/, gitignored). The cache is reused across runs unless
 * --refresh is passed.
 *
 * Failure modes are non-fatal: if a clone fails, the sample is skipped
 * with a "skipped: <reason>" note in the report. This lets the script run
 * in environments without network and still produce partial stats.
 *
 * Usage:
 *   node scripts/scan-samples.js              # run with cached clones
 *   node scripts/scan-samples.js --refresh    # delete cache, re-clone all git samples
 *   node scripts/scan-samples.js --out X.md   # custom output path (default: SAMPLES_REPORT.md)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const repoRoot = process.cwd();
const samplesPath = path.join(repoRoot, 'samples.json');
const cliPath = path.join(repoRoot, 'cli.js');

if (!fs.existsSync(samplesPath)) {
  console.error('samples.json not found at', samplesPath);
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(samplesPath, 'utf8'));
const cacheDir = path.resolve(repoRoot, config.cacheDir || '.samples-cache');
const argv = process.argv.slice(2);
const refresh = argv.includes('--refresh');
const outIdx = argv.indexOf('--out');
const outPath = outIdx >= 0 ? argv[outIdx + 1] : path.join(repoRoot, 'SAMPLES_REPORT.md');

if (refresh && fs.existsSync(cacheDir)) {
  fs.rmSync(cacheDir, { recursive: true, force: true });
}
fs.mkdirSync(cacheDir, { recursive: true });

/** Ensure a local checkout for a git sample. Returns the scan path or null on failure. */
function ensureGitSample(sample) {
  const cloneDir = path.join(cacheDir, sanitize(sample.name));
  const repoDir = sample.subpath ? path.join(cloneDir, sample.subpath) : cloneDir;

  if (fs.existsSync(repoDir)) return repoDir;
  if (!sample.url) return null;

  // Sparse-checkout the subpath when given, otherwise a shallow full clone.
  try {
    if (sample.subpath) {
      execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', sample.url, cloneDir], { stdio: 'pipe' });
      execFileSync('git', ['sparse-checkout', 'set', sample.subpath], { cwd: cloneDir, stdio: 'pipe' });
    } else {
      execFileSync('git', ['clone', '--depth', '1', sample.url, cloneDir], { stdio: 'pipe' });
    }
    if (sample.ref) {
      try {
        execFileSync('git', ['fetch', '--depth', '1', 'origin', sample.ref], { cwd: cloneDir, stdio: 'pipe' });
        execFileSync('git', ['checkout', sample.ref], { cwd: cloneDir, stdio: 'pipe' });
      } catch {
        // ref unavailable — leave on default branch
      }
    }
    return repoDir;
  } catch (err) {
    return null;
  }
}

function sanitize(name) { return name.replace(/[^a-zA-Z0-9_.-]/g, '_'); }

/** Run codemore scan on a path. Returns the parsed report or null on failure. */
function runScan(scanPath) {
  try {
    const stdout = execFileSync(
      'node',
      [cliPath, 'scan', scanPath, '--json', '--enable-experimental'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } catch (err) {
    return null;
  }
}

const results = [];

for (const sample of config.samples) {
  process.stderr.write(`[scan-samples] ${sample.name} ... `);

  let scanPath = null;
  let skipReason = null;

  if (sample.source === 'local') {
    if (sample.path && fs.existsSync(sample.path)) scanPath = sample.path;
    else skipReason = `local path not found: ${sample.path}`;
  } else if (sample.source === 'git') {
    scanPath = ensureGitSample(sample);
    if (!scanPath) skipReason = `git clone failed (offline?) for ${sample.url}`;
  } else {
    skipReason = `unknown source: ${sample.source}`;
  }

  if (!scanPath) {
    process.stderr.write(`SKIP — ${skipReason}\n`);
    results.push({ sample, skipped: true, skipReason });
    continue;
  }

  const report = runScan(scanPath);
  if (!report) {
    process.stderr.write(`SCAN-FAILED\n`);
    results.push({ sample, skipped: true, skipReason: 'codemore scan exited non-zero' });
    continue;
  }

  process.stderr.write(`${report.summary.issuesTotal} issues, score ${report.summary.score}\n`);
  results.push({ sample, scanPath, report });
}

// -------- Aggregate stats --------
const scanned = results.filter(r => r.report);
const totalFiles = scanned.reduce((n, r) => n + r.report.summary.filesAnalyzed, 0);
const totalIssues = scanned.reduce((n, r) => n + r.report.summary.issuesTotal, 0);
const totalLines = scanned.reduce((n, r) => n + r.report.summary.linesOfCode, 0);

const perRule = new Map();
for (const r of scanned) {
  for (const iss of r.report.issues) {
    const slot = perRule.get(iss.id) ?? { id: iss.id, total: 0, perSample: new Map() };
    slot.total++;
    slot.perSample.set(r.sample.name, (slot.perSample.get(r.sample.name) ?? 0) + 1);
    perRule.set(iss.id, slot);
  }
}
const rulesActive = Array.from(perRule.values()).sort((a, b) => b.total - a.total);

const sevTotals = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
for (const r of scanned) {
  for (const [k, v] of Object.entries(r.report.summary.bySeverity)) {
    sevTotals[k] = (sevTotals[k] ?? 0) + v;
  }
}

// -------- Write report --------
const lines = [];
lines.push(`# CodeMore Self-Test Corpus`);
lines.push('');
lines.push(`_Generated ${new Date().toISOString()} by \`scripts/scan-samples.js\`._`);
lines.push('');
lines.push(`Samples in config: **${config.samples.length}** — scanned: **${scanned.length}**, skipped: **${results.length - scanned.length}**.`);
lines.push('');
lines.push(`## Aggregate`);
lines.push('');
lines.push(`| Metric | Value |`);
lines.push(`|---|---|`);
lines.push(`| Files scanned (sum across samples) | ${totalFiles} |`);
lines.push(`| Lines of code (sum) | ${totalLines} |`);
lines.push(`| Issues found (sum) | ${totalIssues} |`);
lines.push(`| BLOCKERs | ${sevTotals.BLOCKER} |`);
lines.push(`| CRITICALs | ${sevTotals.CRITICAL} |`);
lines.push(`| MAJORs | ${sevTotals.MAJOR} |`);
lines.push(`| MINORs | ${sevTotals.MINOR} |`);
lines.push(`| INFOs | ${sevTotals.INFO} |`);
lines.push('');
lines.push(`## Per-rule hit counts`);
lines.push('');
if (rulesActive.length === 0) {
  lines.push('_No findings across the scanned samples._');
} else {
  lines.push(`| Rule | Total hits | Samples it fired on |`);
  lines.push(`|---|--:|---|`);
  for (const slot of rulesActive) {
    const samples = Array.from(slot.perSample.entries()).map(([n, c]) => `${n} (${c})`).join(', ');
    lines.push(`| \`${slot.id}\` | ${slot.total} | ${samples} |`);
  }
}
lines.push('');
lines.push(`## Per-sample summary`);
lines.push('');
lines.push(`| Sample | Source | Files | Issues | Score | BLOCKERs | Status |`);
lines.push(`|---|---|--:|--:|--:|--:|---|`);
for (const r of results) {
  if (r.skipped) {
    lines.push(`| \`${r.sample.name}\` | ${r.sample.source} | — | — | — | — | _skipped: ${r.skipReason}_ |`);
    continue;
  }
  const s = r.report.summary;
  const status = (() => {
    const exp = r.sample.expectsBlockers;
    if (typeof exp === 'number') {
      return s.bySeverity.BLOCKER === exp
        ? `✅ expected ${exp} BLOCKERs`
        : `⚠️ expected ${exp}, got ${s.bySeverity.BLOCKER}`;
    }
    return s.bySeverity.BLOCKER === 0 ? '✅ clean' : `${s.bySeverity.BLOCKER} BLOCKERs`;
  })();
  lines.push(`| \`${r.sample.name}\` | ${r.sample.source} | ${s.filesAnalyzed} | ${s.issuesTotal} | ${s.score} | ${s.bySeverity.BLOCKER} | ${status} |`);
}
lines.push('');
lines.push(`## How to extend`);
lines.push('');
lines.push(`Add an entry to \`samples.json\`. Local apps point at an absolute path; git samples specify \`url\` and optional \`subpath\` for monorepo subdirectories.`);
lines.push('');
lines.push(`Set \`expectsBlockers: N\` on a sample to make the status column show ✅ / ⚠️ when the count matches or drifts — useful when calibrating a new rule against a known-buggy sample.`);
lines.push('');
lines.push(`Re-run with \`node scripts/scan-samples.js --refresh\` to discard the clone cache and re-clone everything.`);
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'));

process.stderr.write(`\n[scan-samples] report written to ${path.relative(repoRoot, outPath)}\n`);
process.stderr.write(`[scan-samples] scanned ${scanned.length}/${config.samples.length} samples — ${totalIssues} issues across ${totalFiles} files\n`);
