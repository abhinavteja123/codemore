#!/usr/bin/env node
/**
 * Catalog-wide accuracy probe.
 *
 * For every rule that has a corpus/rules/<id>/ directory:
 *   - Scan tp/ — expect >=1 finding with that rule id (recall).
 *   - Scan fp/ — expect zero findings with that rule id (precision).
 *
 * Emits a single table with per-rule TP / FP outcomes and the aggregate
 * recall / precision numbers.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const RULES_ROOT = path.join(REPO, 'corpus', 'rules');

function scan(dir) {
  try {
    const out = execFileSync(process.execPath,
      [path.join(REPO, 'cli.js'), 'scan', dir, '--json', '--enable-experimental'],
      { encoding: 'utf8', cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch (e) {
    return { issues: [], _error: e.message };
  }
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

const ruleIds = fs.readdirSync(RULES_ROOT)
  .filter(d => isDir(path.join(RULES_ROOT, d)))
  .sort();

let tpPass = 0, fpPass = 0, tpTotal = 0, fpTotal = 0;
const rows = [];

for (const id of ruleIds) {
  const tpDir = path.join(RULES_ROOT, id, 'tp');
  const fpDir = path.join(RULES_ROOT, id, 'fp');
  let tpResult = '-', fpResult = '-', tpCount = '-', fpCount = '-';
  if (isDir(tpDir)) {
    tpTotal++;
    const r = scan(tpDir);
    const hits = (r.issues || []).filter(i => i.id === id);
    tpCount = String(hits.length);
    if (hits.length >= 1) { tpResult = 'PASS'; tpPass++; }
    else                  { tpResult = 'FAIL'; }
  }
  if (isDir(fpDir)) {
    fpTotal++;
    const r = scan(fpDir);
    const hits = (r.issues || []).filter(i => i.id === id);
    fpCount = String(hits.length);
    if (hits.length === 0) { fpResult = 'PASS'; fpPass++; }
    else                   { fpResult = 'FAIL'; }
  }
  rows.push({ id, tpResult, tpCount, fpResult, fpCount });
}

const idW = Math.max(...rows.map(r => r.id.length), 4);
const head = `${'rule'.padEnd(idW)}  TP    hits  FP    misfires`;
console.log(head);
console.log('-'.repeat(head.length));
for (const r of rows) {
  console.log(`${r.id.padEnd(idW)}  ${r.tpResult.padEnd(4)}  ${r.tpCount.padStart(4)}  ${r.fpResult.padEnd(4)}  ${r.fpCount.padStart(8)}`);
}
console.log('-'.repeat(head.length));
console.log(`Recall (TP pass / TP total):     ${tpPass}/${tpTotal} = ${(tpPass / tpTotal * 100).toFixed(1)}%`);
console.log(`Precision (FP pass / FP total):  ${fpPass}/${fpTotal} = ${(fpPass / fpTotal * 100).toFixed(1)}%`);
