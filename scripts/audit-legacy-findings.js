/* codemore-ignore-file: core-quality-leftover-console, core-bugs-todo-fixme */
// One-off audit script — categorize the 1,359 legacy-extension findings
// in codemore-issues-2026-06-08.json by location bucket and by rule id.
// Tells us what fraction are genuine source-file findings vs scope errors
// (scanning compile output, vendored deps, intentional fixtures, etc.).

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'codemore-issues-2026-06-08.json';
const r = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function bucket(p) {
  const s = p.replace(/\\/g, '/').toLowerCase();
  if (s.includes('/node_modules/')) return 'node_modules (third-party, NEVER scan)';
  if (s.includes('/lib/'))           return 'lib/ (publish-bundle output, ignore)';
  if (s.includes('/.samples-cache/'))return '.samples-cache/ (corpus clones, ignore)';
  if (s.includes('/corpus/rules/')) {
    if (s.includes('/tp/'))          return 'corpus/rules/**/tp/ (INTENTIONALLY bad)';
    if (s.includes('/fp/'))          return 'corpus/rules/**/fp/ (look-alike-correct)';
    return 'corpus/rules/** (other fixture)';
  }
  if (s.includes('/dist/'))          return 'dist/ (webpack output, ignore)';
  if (s.includes('/.git/'))          return '.git/ (NEVER scan)';
  if (s.includes('/.next/'))         return '.next/ (next.js cache, ignore)';
  if (s.includes('/coverage/'))      return 'coverage/ (ignore)';
  if (s.includes('/.scan-artifacts/'))return '.scan-artifacts/ (scanner cache, ignore)';
  if (/\/codemore-issues-/.test(s))  return 'codemore-issues-*.json (previous dumps, ignore)';
  if (s.endsWith('.tgz'))            return '*.tgz (npm tarball, ignore)';
  if (s.endsWith('.vsix'))           return '*.vsix (vsce package, ignore)';
  return 'PROJECT SOURCE';
}

const byBucket = {};
const byRule = {};
const projectFindings = [];
for (const i of r.issues) {
  const b = bucket(i.location.filePath);
  byBucket[b] = (byBucket[b] || 0) + 1;
  byRule[i.id.replace(/-\d+$/, '')] = (byRule[i.id.replace(/-\d+$/, '')] || 0) + 1;
  if (b === 'PROJECT SOURCE') projectFindings.push(i);
}

console.log('Total findings:', r.totalIssues, '\n');
console.log('=== BY LOCATION (where the extension looked) ===');
for (const [b, c] of Object.entries(byBucket).sort((a, b) => b[1] - a[1])) {
  const pct = ((c / r.totalIssues) * 100).toFixed(1);
  console.log(c.toString().padStart(5), '(' + pct.padStart(5) + '%)', b);
}

console.log('\n=== BY RULE (top 20) ===');
for (const [rid, c] of Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(c.toString().padStart(5), rid);
}

console.log('\n=== Source-only findings: ', projectFindings.length);
console.log('Source-only findings by file (top 15):');
const byFile = {};
for (const i of projectFindings) {
  const f = i.location.filePath.split(/[\\/]/).slice(-3).join('/');
  byFile[f] = (byFile[f] || 0) + 1;
}
for (const [f, c] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(c.toString().padStart(5), f);
}

console.log('\n=== Severity breakdown across ALL 1359 ===');
const bySev = {};
for (const i of r.issues) bySev[i.severity] = (bySev[i.severity] || 0) + 1;
for (const [s, c] of Object.entries(bySev).sort((a, b) => b[1] - a[1])) {
  console.log(c.toString().padStart(5), s);
}
