/* codemore-ignore-file: core-quality-leftover-console */
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('codemore-issues-2026-06-08.json', 'utf8'));

console.log('=== 4 CRITICAL findings ===');
for (const c of r.issues.filter(i => i.severity === 'CRITICAL')) {
  console.log(c.id, '|', c.title);
  console.log('   ', c.location.filePath.split(/[\\/]/).slice(-4).join('/'), ':', c.location.startLine);
  console.log('   ', (c.codeSnippet || '').slice(0, 100));
  console.log('');
}

const src = r.issues.filter(i => {
  const p = i.location.filePath.replace(/\\/g, '/').toLowerCase();
  return !p.includes('/lib/') && !p.includes('/corpus/') && !p.includes('/node_modules/');
});

console.log('=== 10 evenly-spaced PROJECT-SOURCE samples ===');
const step = Math.floor(src.length / 10) || 1;
for (let i = 0; i < 10; i++) {
  const it = src[i * step];
  if (!it) continue;
  console.log('[' + it.severity.padEnd(8) + ']', it.id.padEnd(28), '|', it.title.slice(0, 70));
  console.log('   ', it.location.filePath.split(/[\\/]/).slice(-3).join('/'), ':', it.location.startLine);
  console.log('    snippet:', (it.codeSnippet || '').slice(0, 80));
  console.log('');
}

console.log('=== MAJOR-severity sample (first 5) ===');
const majors = r.issues.filter(i => i.severity === 'MAJOR' && !i.location.filePath.replace(/\\/g, '/').toLowerCase().includes('/lib/'));
for (const it of majors.slice(0, 5)) {
  console.log('[MAJOR]', it.id, '|', it.title);
  console.log('   ', it.location.filePath.split(/[\\/]/).slice(-3).join('/'), ':', it.location.startLine);
  console.log('    snippet:', (it.codeSnippet || '').slice(0, 80));
  console.log('');
}
