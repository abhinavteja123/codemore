#!/usr/bin/env node
/* codemore-ignore-file: core-quality-leftover-console */
/* Benchmark runner — console output IS the user-facing UX. */

/* eslint-disable no-console */

/**
 * Phase 6 benchmark harness.
 *
 * Reads benchmark/targets.json, and for each target: shallow-clones to a
 * temp dir under the OS temp root, runs `node cli.js scan <dir> --json`,
 * saves the report to benchmark/results/<n>.json (n = index in
 * targets.json), then deletes the clone.
 *
 * Sequential and resumable: any n whose results file already exists is
 * skipped, so a crashed/interrupted run just continues where it left off.
 * Failed clones/scans write NO results file — they are retried next run.
 *
 * Windows quirk: `node cli.js` may crash at exit AFTER output is written
 * (libuv, cosmetic). A run counts as success if stdout parses as a valid
 * scan report, regardless of exit code.
 *
 * Usage:
 *   node scripts/benchmark.js              # full run (all targets)
 *   node scripts/benchmark.js --limit N    # stop after N successful scans
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'cli.js');
const targetsPath = path.join(repoRoot, 'benchmark', 'targets.json');
const resultsDir = path.join(repoRoot, 'benchmark', 'results');

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : Infinity;
if (limitIdx >= 0 && !(limit > 0)) {
  console.error('--limit needs a positive integer');
  process.exit(2);
}

const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
fs.mkdirSync(resultsDir, { recursive: true });

/** Delete a clone dir; retries cover Windows file-lock flakiness on .git. */
function rmClone(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    console.error(`  WARN could not delete ${dir}: ${err.message}`);
  }
}

/** Scan a dir. Success = stdout is a valid report JSON, exit code ignored. */
function runScan(dir) {
  const res = spawnSync('node', [cliPath, 'scan', dir, '--json'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  try {
    const report = JSON.parse(res.stdout);
    if (report && report.summary) return report;
  } catch {
    /* fall through */
  }
  return null;
}

let done = 0;
let skipped = 0;
let failed = 0;

for (let n = 0; n < targets.length; n++) {
  if (done >= limit) break;
  const target = targets[n];
  const outFile = path.join(resultsDir, `${n}.json`);

  if (fs.existsSync(outFile)) {
    skipped++;
    continue;
  }

  process.stderr.write(`[benchmark] #${n} ${target.url} ... `);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemore-bench-'));
  try {
    try {
      execFileSync('git', ['clone', '--depth', '1', target.url, tmpDir], {
        stdio: 'pipe',
        timeout: 5 * 60 * 1000,
      });
    } catch (err) {
      process.stderr.write(`CLONE FAILED (retried next run)\n`);
      failed++;
      continue;
    }

    const report = runScan(tmpDir);
    if (!report) {
      process.stderr.write(`SCAN FAILED (retried next run)\n`);
      failed++;
      continue;
    }

    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    done++;
    process.stderr.write(`${report.summary.issuesTotal} issues, score ${report.summary.score}\n`);
  } finally {
    rmClone(tmpDir);
  }
}

console.error(`\n[benchmark] scanned ${done}, already-done ${skipped}, failed ${failed}, targets ${targets.length}`);
console.error(`[benchmark] results in ${path.relative(repoRoot, resultsDir)}/<n>.json — re-run to resume`);
