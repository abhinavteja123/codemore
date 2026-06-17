#!/usr/bin/env node
/**
 * scripts/triage.js — per-rule triage sampler for the Part 7 accuracy audit.
 *
 * For each project scan JSON we already have, this:
 *   1. Groups findings by rule id
 *   2. Samples up to N findings per rule (deterministic random with seed)
 *   3. For each sample, loads ±3 lines of source context
 *   4. Emits a markdown table to triage-results/<project>.md
 *
 * I then read that markdown and score each sample TP/FP based on the snippet
 * + context + file path. Per-rule precision = TPs / sampled.
 *
 * Usage:
 *   node scripts/triage.js --scan <path-to-scan.json> --root <project-root> --out <output.md> [--seed 1] [--n 10]
 *
 * Example:
 *   node scripts/triage.js \
 *     --scan C:/tmp/aim.json \
 *     --root "C:/Users/ABHINAV TEJA/Downloads/AImentor" \
 *     --out triage-results/aimentor.md
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { seed: 1, n: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan') out.scan = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--n') out.n = parseInt(argv[++i], 10);
    else if (a === '--seed') out.seed = parseInt(argv[++i], 10);
  }
  if (!out.scan || !out.root || !out.out) {
    console.error('Usage: node scripts/triage.js --scan <scan.json> --root <project-root> --out <output.md> [--n 10] [--seed 1]');
    process.exit(2);
  }
  return out;
}

// Mulberry32 — small deterministic PRNG so triage is reproducible per seed.
function rngFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(arr, n, rng) {
  if (arr.length <= n) return arr.slice();
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function readLines(rootAbs, relPath) {
  // Findings have OS-style paths. Normalise to absolute under the project root.
  let p = relPath.replace(/\\/g, '/');
  if (!path.isAbsolute(p)) p = path.join(rootAbs, p);
  // If finding stores absolute paths, leave them. Else resolve.
  if (!fs.existsSync(p)) {
    // Try interpreting the path as already-absolute on Windows (c:\…).
    const winAbs = relPath.replace(/^[a-zA-Z]:/, m => m.toLowerCase());
    if (fs.existsSync(winAbs)) p = winAbs;
    else return null;
  }
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/);
  } catch {
    return null;
  }
}

function contextSnippet(lines, line, before = 2, after = 2) {
  if (!lines) return '(file not found on disk)';
  const start = Math.max(1, line - before);
  const end = Math.min(lines.length, line + after);
  const out = [];
  const pad = String(end).length;
  for (let i = start; i <= end; i++) {
    const marker = i === line ? '→' : ' ';
    out.push(`${marker} ${String(i).padStart(pad)}: ${lines[i - 1]}`);
  }
  return out.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scan = JSON.parse(fs.readFileSync(args.scan, 'utf8'));
  const issues = Array.isArray(scan.issues) ? scan.issues : scan;

  const byRule = new Map();
  for (const i of issues) {
    const id = i.id || i.ruleId || '(unknown)';
    if (!byRule.has(id)) byRule.set(id, []);
    byRule.get(id).push(i);
  }

  const rng = rngFactory(args.seed);

  const projectName = path.basename(args.root);
  const totals = { rules: byRule.size, issues: issues.length };
  let md = '';
  md += `# Triage — ${projectName}\n\n`;
  md += `- Scan source: \`${args.scan}\`\n`;
  md += `- Project root: \`${args.root}\`\n`;
  md += `- Sample seed: ${args.seed}  ·  Sample size per rule: ${args.n}\n`;
  md += `- Catalog activity: **${totals.rules} distinct rules**, **${totals.issues} findings**\n\n`;

  // Per-rule summary table at the top.
  md += '## Rule activity\n\n| rule | findings | sampled |\n|---|---:|---:|\n';
  const sorted = [...byRule].sort((a, b) => b[1].length - a[1].length);
  for (const [id, list] of sorted) {
    md += `| \`${id}\` | ${list.length} | ${Math.min(list.length, args.n)} |\n`;
  }
  md += '\n';

  // Detailed per-rule sample listing.
  md += '## Samples (10 per rule, deterministic random)\n\n';
  md += '> Score each sample as **TP** or **FP**. Per-rule precision = TPs / sampled.\n\n';

  for (const [id, list] of sorted) {
    const samples = sample(list, args.n, rng);
    md += `### \`${id}\` — ${list.length} findings, ${samples.length} sampled\n\n`;
    samples.forEach((iss, idx) => {
      const ev = iss.evidence || iss.location || {};
      const file = ev.file || ev.filePath || '';
      const line = ev.line || ev.startLine || 1;
      const lines = readLines(args.root, file);
      md += `**${idx + 1}.** \`${file}:${line}\`\n\n`;
      md += '```\n' + contextSnippet(lines, line) + '\n```\n\n';
      md += `_score:_ TP / FP  ←  fill in\n\n`;
    });
    md += '---\n\n';
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, md);
  console.log(`wrote ${args.out} (${md.length.toLocaleString()} bytes, ${totals.rules} rules, ${totals.issues} issues)`);
}

main();
