/**
 * Regression tests for three 2026-07-07 senior-tester findings around
 * .codemorerc.json handling and the secret-file gitignore bypass:
 *
 *  1. SEVERITY REMAP IGNORED: registry.ts resolved severity as
 *     `finding.severity ?? override` — any rule that emits a per-finding
 *     severity silently defeated the user's rc remap. User override must
 *     outrank both the rule default AND per-finding severity.
 *  2. MALFORMED RC SILENT: the loader produced warnings but nothing
 *     printed them; a broken .codemorerc.json meant the user's config
 *     wasn't applied with zero feedback. scanProject now writes each
 *     warning to stderr.
 *  3. SUFFIX .env INVISIBLE: the secret-bypass list covered `.env*`
 *     (prefix) but not `*.env` (suffix — docker-compose env_file
 *     convention), so a gitignored `secrets.env` with a live key was
 *     skipped by a default scan.
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { scanProject } from '../daemon/cli/projectScanner';
import { registerAllPacks } from '../daemon/cli/registerPacks';
import { loadCodemorerc } from '../daemon/cli/codemorercLoader';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('.codemorerc.json effects + secret-bypass suffix (2026-07-07 regressions)', function () {
  this.timeout(30000);
  const tempDirs: string[] = [];
  function fixture(prefix: string): string {
    const dir = mkTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  }
  before(() => { registerAllPacks(); });
  after(() => {
    for (const dir of tempDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  it('rc severity remap outranks a per-finding severity (leftover-console -> BLOCKER)', async () => {
    const dir = fixture('rc-remap-');
    writeFile(dir, 'src/a.ts', "console.log('x');\n");
    writeFile(dir, '.codemorerc.json', JSON.stringify({
      rules: { 'core-quality-leftover-console': 'BLOCKER' },
    }));

    const report = await scanProject({ root: dir });
    const finding = report.issues.find(i => i.id === 'core-quality-leftover-console');

    assert.ok(finding, 'console finding must exist');
    assert.equal(finding!.severity, 'BLOCKER',
      'user rc remap must win over the per-finding severity the detector sets');
  });

  it('lowercase severity in rc rules is accepted and normalized to uppercase', () => {
    const dir = fixture('rc-lowercase-');
    writeFile(dir, '.codemorerc.json', JSON.stringify({
      rules: { 'ts-non-null': 'minor' },
    }));

    const loaded = loadCodemorerc(dir);

    assert.deepEqual(loaded.ruleOverrides['ts-non-null'], { state: 'MINOR' },
      'lowercase severities (as used by this repo\'s own .codemorerc.json) must be accepted and stored uppercase');
    assert.equal(loaded.warnings.length, 0, `expected no warnings, got: ${loaded.warnings.join('; ')}`);
  });

  it('malformed .codemorerc.json produces a visible stderr warning', async () => {
    const dir = fixture('rc-malformed-');
    writeFile(dir, 'src/a.ts', "console.log('x');\n");
    writeFile(dir, '.codemorerc.json', '{not json!!');

    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (s: string | Uint8Array) => boolean }).write =
      (s: string | Uint8Array) => { chunks.push(String(s)); return true; };
    try {
      await scanProject({ root: dir });
    } finally {
      process.stderr.write = orig;
    }

    assert.ok(chunks.join('').includes('.codemorerc.json'),
      'a malformed rc must be surfaced on stderr, not silently ignored');
  });

  it('gitignored suffix-style secrets.env is still scanned by default (secret bypass)', async () => {
    const dir = fixture('rc-suffixenv-');
    writeFile(dir, '.gitignore', 'secrets.env\n');
    writeFile(dir, 'secrets.env', 'STRIPE_KEY=sk_live_abcdefghij1234567890XYZZ\n');

    const report = await scanProject({ root: dir });

    assert.ok(report.issues.some(i => i.evidence.file === 'secrets.env'),
      '*.env suffix files are secret carriers and must bypass .gitignore by default');
  });
});
