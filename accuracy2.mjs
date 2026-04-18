import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('C:/Users/ABHINAV TEJA/Downloads/codemore/codemore-issues-2026-04-18 updated.json', 'utf8'));
const issues = data.issues;

// Python false positives (should be 0 now)
const pyIssues = issues.filter(i => i.location?.filePath?.endsWith('.py'));
console.log('Python file issues (should be 0):', pyIssues.length);

// Equality/inequality hits
const eqIssues = issues.filter(i => i.title === 'Use strict equality' || i.title === 'Use strict inequality');
console.log('\nEquality rule issues:', eqIssues.length);
eqIssues.forEach(i => console.log(' -', i.location?.filePath?.split(/[\/]/).pop(), 'line', i.location?.startLine, '|', (i.codeSnippet||'').substring(0,80)));

// analyze.mjs false positives (temp script)
const analyzeIssues = issues.filter(i => i.location?.filePath?.includes('analyze'));
console.log('\nanalyze.mjs issues (temp script - should be excluded):', analyzeIssues.length);

// Line length issues breakdown
const lineLengthIssues = issues.filter(i => i.title === 'Line exceeds maximum length');
console.log('\nLine length issues total:', lineLengthIssues.length);
const llByFile = {};
for (const i of lineLengthIssues) {
  const fp = (i.location?.filePath || '').split(/[\/]/).pop();
  llByFile[fp] = (llByFile[fp] || 0) + 1;
}
const sorted = Object.entries(llByFile).sort((a,b)=>b[1]-a[1]).slice(0,10);
sorted.forEach(([f,c]) => console.log(' ', f, ':', c));

// Check inline JSX (real vs noisy?)
const jsxIssues = issues.filter(i => i.title === 'Inline function in JSX prop');
console.log('\nInline JSX function issues:', jsxIssues.length);

// Await in loop - real performance bugs
const awaitLoop = issues.filter(i => i.title === 'Await inside loop');
console.log('\nAwait inside loop (real perf bugs):', awaitLoop.length);
awaitLoop.slice(0,5).forEach(i => console.log(' -', i.location?.filePath?.split(/[\/]/).pop(), 'line', i.location?.startLine));

// Non-null assertion
const nna = issues.filter(i => i.title === 'Non-null assertion operator');
console.log('\nNon-null assertion (!):', nna.length);

// Summary by file type
const byExt = {};
for (const i of issues) {
  const ext = (i.location?.filePath || '').split('.').pop()?.toLowerCase() || 'unknown';
  byExt[ext] = (byExt[ext] || 0) + 1;
}
console.log('\nAll extensions found:', byExt);

// Accuracy estimate
const fpAnalyze = analyzeIssues.length;
const fpLineLength = Math.round(lineLengthIssues.length * 0.3);
const fpInlineJSX = Math.round(jsxIssues.length * 0.4);
const totalFP = fpAnalyze + fpLineLength + fpInlineJSX;
const totalTP = issues.length - totalFP;
console.log('\n--- ACCURACY ESTIMATE ---');
console.log('Total issues:', issues.length);
console.log('Estimated FP breakdown: analyze.mjs=' + fpAnalyze + ' line-length-noise=' + fpLineLength + ' inline-jsx-noise=' + fpInlineJSX);
console.log('Estimated true positives:', totalTP, '/', issues.length);
console.log('Estimated accuracy:', Math.round(totalTP / issues.length * 100) + '%');
