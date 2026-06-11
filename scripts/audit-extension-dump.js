#!/usr/bin/env node
/**
 * One-shot audit of a legacy-extension dump file.
 *
 * Usage: node scripts/audit-extension-dump.js <dump.json>
 *
 * Prints:
 *   - totals
 *   - scope bucket (file location) — "where" the FPs live
 *   - rule bucket (top 30 rules by count)
 *   - severity histogram
 *   - probable-FP estimate vs probable-actionable estimate
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/audit-extension-dump.js <dump.json>'); process.exit(2); }

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const issues = data.issues || data.findings || data;

console.log('TOTAL:', issues.length);

const scopeBuckets = {};
function addScope(key) { scopeBuckets[key] = (scopeBuckets[key] || 0) + 1; }

const ruleBuckets = {};
const sevBuckets = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };

// Rough "actionable" gate: source file under daemon/, shared/, src/, web/src/,
// webview/ AND not a *.test.* / fixture / docs file.
let probablyActionable = 0;
let probablyFp = 0;
const productionTreeRe = /^(daemon|shared|src|webview|web\/src)\//;
const docsLikeRe = /\.(md|mdx|markdown)$/i;
const testLikeRe = /(?:\.(test|spec)\.[a-z]+$|__tests__|\/test\/|\/tests\/|\/fixtures?\/|\/mocks?\/)/i;

for (const i of issues) {
  const rawPath = (i.location && i.location.filePath || '').replace(/\\/g, '/');
  const rel = (rawPath.toLowerCase().split('/codemore/')[1] || rawPath.toLowerCase());

  // Scope buckets — choose the FIRST matching label, in priority order.
  let label = null;
  if (rel.includes('/node_modules/')) label = 'node_modules/';
  else if (rel.startsWith('corpus/')) label = 'corpus/';
  else if (rel.startsWith('lib/')) label = 'lib/ (compiled)';
  else if (rel.startsWith('.samples-cache/')) label = '.samples-cache/';
  else if (rel.startsWith('test/')) label = 'test/';
  else if (rel.includes('/.next/')) label = '.next/';
  else if (rel.includes('.vscode-test')) label = '.vscode-test/';
  else if (/^(dist|build)\//.test(rel)) label = 'dist/ or build/';
  else if (rel.startsWith('docs/')) label = 'docs/';
  else if (rel.startsWith('scripts/')) label = 'scripts/';
  else if (rel.startsWith('webview-ui/')) label = 'webview-ui/';
  else if (rel.includes('fixtures/')) label = 'fixtures/';
  else if (rel.startsWith('src/')) label = 'src/ (extension)';
  else if (rel.startsWith('daemon/')) label = 'daemon/';
  else if (rel.startsWith('shared/')) label = 'shared/';
  else if (rel.startsWith('web/')) label = 'web/';
  else if (rel.startsWith('webview/')) label = 'webview/';
  else label = '<other root>';
  addScope(label);

  // Rule bucket — id prefix up to first '-N' suffix
  const id = (i.id || 'unknown').replace(/-\d+$/, '');
  const titlePiece = i.title ? ` — ${i.title.slice(0, 50)}` : '';
  const key = `${id}${titlePiece}`;
  ruleBuckets[key] = (ruleBuckets[key] || 0) + 1;

  // Severity
  if (sevBuckets[i.severity] !== undefined) sevBuckets[i.severity]++;

  // FP heuristic
  const isFpScope = /^(corpus|lib|\.samples-cache|test|docs|scripts|fixtures?)\//.test(rel)
    || rel.includes('/node_modules/')
    || rel.includes('/.next/')
    || rel.includes('.vscode-test')
    || /^(dist|build)\//.test(rel)
    || testLikeRe.test(rel)
    || docsLikeRe.test(rel);
  if (isFpScope) probablyFp++;
  else if (productionTreeRe.test(rel)) probablyActionable++;
  else probablyFp++;
}

console.log('\n--- Scope (file location) ---');
for (const [k, v] of Object.entries(scopeBuckets).sort((a, b) => b[1] - a[1])) {
  console.log(String(v).padStart(5), k);
}

console.log('\n--- Top 30 rules ---');
for (const [k, v] of Object.entries(ruleBuckets).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(String(v).padStart(5), k);
}

console.log('\n--- Severity ---');
for (const [k, v] of Object.entries(sevBuckets)) console.log(String(v).padStart(5), k);

console.log('\n--- Probable-FP estimate (heuristic) ---');
const total = probablyFp + probablyActionable;
const pct = total === 0 ? 0 : Math.round((probablyFp / total) * 100);
console.log('probable FP (scope-FP class):', probablyFp, `(${pct}%)`);
console.log('probable actionable        :', probablyActionable);
