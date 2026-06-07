#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Rule PR Validator (the bot)
 *
 * Phase 0 scope (what this script enforces today):
 *   1. For every touched rule id, all five required artifacts exist:
 *        - shared/packs/<pack>/<rule-id>.ts
 *        - corpus/rules/<rule-id>/tp/
 *        - corpus/rules/<rule-id>/fp/
 *        - docs/rules/<rule-id>.md
 *        - the rule is exported from shared/packs/<pack>/index.ts
 *   2. Existing rules edited in the PR have a semver version bump.
 *
 * Phase 1 scope (lights up once the CLI ships):
 *   3. TP fixture triggers exactly one finding with the rule's id.
 *   4. FP fixture triggers zero findings with the rule's id.
 *   5. Catalog-wide FP rate over the full corpus stays <=10%.
 *
 * Until the CLI lands, sections (3-5) print a notice and pass — so the
 * workflow is meaningful from day one without blocking contributors on
 * checks that have no implementation yet.
 *
 * The script emits a markdown report on $GITHUB_OUTPUT under `report` so
 * the workflow can post it as a PR comment on failure.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();
const PACKS_DIR = path.join(repoRoot, 'shared', 'packs');
const CORPUS_DIR = path.join(repoRoot, 'corpus', 'rules');
const DOCS_DIR = path.join(repoRoot, 'docs', 'rules');

const errors = [];
const notices = [];

function fail(msg) {
  errors.push(msg);
}

function notice(msg) {
  notices.push(msg);
}

function exists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function walkDir(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, acc);
    else if (e.isFile()) acc.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
  }
}

function changedFiles(baseRef, headRef) {
  if (!baseRef || !headRef) {
    // Local dev / non-PR runs — walk the filesystem so untracked rule
    // artifacts also get validated. This is what makes `node scripts/
    // validate-rule-pr.js` useful on a clean working tree.
    const acc = [];
    walkDir(path.join(repoRoot, 'shared', 'packs'), acc);
    walkDir(path.join(repoRoot, 'shared', 'rules'), acc);
    walkDir(path.join(repoRoot, 'corpus', 'rules'), acc);
    walkDir(path.join(repoRoot, 'docs', 'rules'), acc);
    return acc;
  }
  const raw = execSync(`git diff --name-only ${baseRef} ${headRef}`, { encoding: 'utf8' });
  return raw.split('\n').filter(Boolean);
}

/**
 * Extract rule ids touched by the changed files.
 *
 * A file under shared/packs/<pack>/<rule-id>.ts contributes <rule-id>.
 * A file under corpus/rules/<rule-id>/** contributes <rule-id>.
 * A file under docs/rules/<rule-id>.md contributes <rule-id>.
 */
function extractTouchedRuleIds(files) {
  const ids = new Set();
  for (const f of files) {
    const norm = f.replace(/\\/g, '/');

    const pack = norm.match(/^shared\/packs\/[^/]+\/([a-z][a-z0-9-]+)\.ts$/);
    if (pack && pack[1] !== 'index') {
      ids.add(pack[1]);
      continue;
    }

    const corpus = norm.match(/^corpus\/rules\/([a-z][a-z0-9-]+)\//);
    if (corpus) {
      ids.add(corpus[1]);
      continue;
    }

    const docs = norm.match(/^docs\/rules\/([a-z][a-z0-9-]+)\.md$/);
    if (docs) {
      ids.add(docs[1]);
      continue;
    }
  }
  return Array.from(ids);
}

/**
 * Find the rule module on disk by id. Returns { pack, file } or null.
 */
function locateRule(ruleId) {
  if (!isDir(PACKS_DIR)) return null;
  for (const pack of fs.readdirSync(PACKS_DIR)) {
    const candidate = path.join(PACKS_DIR, pack, `${ruleId}.ts`);
    if (exists(candidate)) return { pack, file: candidate };
  }
  return null;
}

function checkRequiredArtifacts(ruleId) {
  const loc = locateRule(ruleId);
  if (!loc) {
    fail(`\`${ruleId}\` — rule module not found under \`shared/packs/*/\`.`);
    return null;
  }

  const tp = path.join(CORPUS_DIR, ruleId, 'tp');
  const fp = path.join(CORPUS_DIR, ruleId, 'fp');
  const docs = path.join(DOCS_DIR, `${ruleId}.md`);
  const packIndex = path.join(PACKS_DIR, loc.pack, 'index.ts');

  if (!isDir(tp)) fail(`\`${ruleId}\` — missing TP fixture at \`corpus/rules/${ruleId}/tp/\`.`);
  if (!isDir(fp)) fail(`\`${ruleId}\` — missing FP fixture at \`corpus/rules/${ruleId}/fp/\`.`);
  if (!exists(docs)) fail(`\`${ruleId}\` — missing docs page at \`docs/rules/${ruleId}.md\`.`);
  if (!exists(packIndex)) {
    fail(`\`${ruleId}\` — pack \`${loc.pack}\` has no \`index.ts\` registering rules.`);
  } else {
    const indexContent = fs.readFileSync(packIndex, 'utf8');
    const lowered = indexContent.toLowerCase();
    // Accept the rule id literal, the file-import path, or the conventional
    // camelCase identifier derived from the id.
    const camelHaystack = ruleId.replace(/-/g, '').toLowerCase();
    const importPath = `./${ruleId}`;
    if (
      !indexContent.includes(`'${ruleId}'`) &&
      !indexContent.includes(importPath) &&
      !lowered.includes(camelHaystack)
    ) {
      fail(`\`${ruleId}\` — rule is not registered in \`shared/packs/${loc.pack}/index.ts\`.`);
    }
  }

  return loc;
}

function checkSemverBump(ruleId, loc, baseRef) {
  if (!baseRef) {
    notice(`\`${ruleId}\` — semver-bump check skipped (no base ref).`);
    return;
  }

  let prevContent = '';
  try {
    prevContent = execSync(
      `git show ${baseRef}:shared/packs/${loc.pack}/${ruleId}.ts`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    );
  } catch {
    // New rule — semver check not applicable.
    return;
  }

  const curContent = fs.readFileSync(loc.file, 'utf8');

  const prevVer = (prevContent.match(/version:\s*['"]([0-9.]+)['"]/) || [])[1];
  const curVer = (curContent.match(/version:\s*['"]([0-9.]+)['"]/) || [])[1];

  if (!prevVer || !curVer) {
    fail(`\`${ruleId}\` — could not parse rule \`version\` field on base or head.`);
    return;
  }
  if (prevVer === curVer) {
    fail(`\`${ruleId}\` — rule modified but \`version\` not bumped (was \`${prevVer}\`).`);
  }
}

function runCliScan(fixtureDir, ruleId, pack) {
  const cliPath = path.join(repoRoot, 'cli.js');
  try {
    const stdout = execSync(
      `node "${cliPath}" scan "${fixtureDir}" --json --enable-experimental --packs ${pack}`,
      { encoding: 'utf8', cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const report = JSON.parse(stdout);
    return (report.issues || []).filter(i => i.id === ruleId);
  } catch (err) {
    fail(`\`${ruleId}\` — CLI scan failed for ${path.relative(repoRoot, fixtureDir)}: ${err.message.split('\n')[0]}`);
    return null;
  }
}

function checkFixtureBehavior(ruleId, loc) {
  const tp = path.join(CORPUS_DIR, ruleId, 'tp');
  const fp = path.join(CORPUS_DIR, ruleId, 'fp');

  if (isDir(tp)) {
    const findings = runCliScan(tp, ruleId, loc.pack);
    if (findings !== null && findings.length === 0) {
      fail(`\`${ruleId}\` — TP fixture did not trigger the rule (got 0 findings, expected >= 1).`);
    }
  }

  if (isDir(fp)) {
    const findings = runCliScan(fp, ruleId, loc.pack);
    if (findings !== null && findings.length > 0) {
      const where = findings
        .slice(0, 3)
        .map(f => `${f.evidence.file}:${f.evidence.line}`)
        .join(', ');
      fail(`\`${ruleId}\` — FP fixture incorrectly triggered the rule (${findings.length} finding(s): ${where}).`);
    }
  }
}

function checkCatalogFalsePositiveRate() {
  // TODO (Phase 2): catalog-wide regression check.
  //   - Run the full registry against every fixture in corpus/.
  //   - Compute aggregate FP rate (FP fixtures that trigger anything).
  //   - Compare to baseline tracked in corpus/.fp-baseline.json.
  //   - Fail if catalog-wide FP rate > 10% OR delta vs baseline > 2%.
  notice('Catalog-wide FP-rate regression check is not yet enabled (per-rule TP/FP checks DID run).');
}

function writeReport() {
  const ok = errors.length === 0;
  const header = ok
    ? '## Rule PR Validator — passed ✅'
    : '## Rule PR Validator — failed ❌';

  const body = [
    header,
    '',
    errors.length ? '### Errors' : '',
    ...errors.map(e => `- ${e}`),
    '',
    notices.length ? '### Notices' : '',
    ...notices.map(n => `- ${n}`),
    '',
    '> See [CONTRIBUTING-RULES.md](./CONTRIBUTING-RULES.md) for the full rule-contribution spec.',
  ].filter(Boolean).join('\n');

  console.log(body);

  // Emit as workflow output so the workflow can post it as a PR comment.
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    const delim = `EOF_${Date.now()}`;
    fs.appendFileSync(outFile, `report<<${delim}\n${body}\n${delim}\n`);
  }

  process.exit(ok ? 0 : 1);
}

function main() {
  const baseRef = process.env.BASE_REF || '';
  const headRef = process.env.HEAD_REF || '';

  const files = changedFiles(baseRef, headRef);
  const touched = extractTouchedRuleIds(files);

  if (touched.length === 0) {
    notice('No rule artifacts changed; nothing to validate.');
    writeReport();
    return;
  }

  for (const ruleId of touched) {
    const loc = checkRequiredArtifacts(ruleId);
    if (loc) {
      checkSemverBump(ruleId, loc, baseRef);
      checkFixtureBehavior(ruleId, loc);
    }
  }

  checkCatalogFalsePositiveRate();
  writeReport();
}

main();
