/**
 * White-box regression tests for the file walker's ignore + secret-bypass
 * logic, and for tsconfig outDir / package.json workspaces handling.
 *
 * Background: the Part-7 incident — a Firebase Admin SDK key on disk was
 * gitignored by the developer (to "hide" it from git) but was still shipped
 * via tarball/Docker/npm pack. The scanner never looked at it because the
 * walker unconditionally honored `.gitignore`. The fix (see
 * `daemon/cli/ignoreResolver.ts`, SECRET_SHAPED_FILENAMES) is: for a small
 * allowlist of well-known secret-carrier filename shapes, the walker
 * BYPASSES `.gitignore` and scans the file anyway, unless the caller opts
 * out with `--respect-gitignore-fully` / `respectGitignoreForSecretFiles`.
 *
 * We test through the two public entry points that implement this contract:
 *   - `createIgnoreResolver()` / `IgnoreResolver.shouldIgnore()` in
 *     daemon/cli/ignoreResolver.ts — the single source of truth for
 *     "should this path be skipped?"
 *   - `discoverFiles()` in daemon/cli/projectScanner.ts — "Helper for
 *     tests: a quick file count without running the registry" (exported
 *     for exactly this purpose). It composes the resolver with the actual
 *     directory walk AND the language/extension filter, which matters: see
 *     the CONTRACT GAP below.
 *
 * No network, no git binary — .gitignore is read as a plain file
 * (ignoreResolver.ts:172-178 uses fs.readFileSync), so plain temp dirs
 * suffice.
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { discoverFiles, scanProject } from '../daemon/cli/projectScanner';
import { createIgnoreResolver } from '../daemon/cli/ignoreResolver';
import { registerAllPacks } from '../daemon/cli/registerPacks';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('walker: ignore + secret-bypass logic (Part-7 regression)', () => {
  const tempDirs: string[] = [];

  function fixture(prefix: string): string {
    const dir = mkTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  }

  after(() => {
    for (const dir of tempDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  });

  describe('case 1: a normal gitignored file is not scanned', () => {
    it('excludes build/generated.ts when .gitignore lists "build/"', () => {
      const dir = fixture('walker-normal-ignore-');
      writeFile(dir, '.gitignore', 'build/\n');
      writeFile(dir, 'build/generated.ts', 'export const x = 1;\n');
      writeFile(dir, 'src/index.ts', 'export const y = 2;\n');

      const files = discoverFiles(dir);

      assert.equal(files.includes('build/generated.ts'), false,
        'gitignored build/generated.ts should not be scanned');
      assert.equal(files.includes('src/index.ts'), true,
        'non-ignored src/index.ts should be scanned');
    });
  });

  describe('case 2: secret-shaped filenames bypass .gitignore', () => {
    // Pattern source: daemon/cli/ignoreResolver.ts SECRET_SHAPED_FILENAMES
    // (lines 94-106) + isSecretShaped() (lines 108-114), wired into
    // shouldIgnore() at lines 206-211.
    //
    // IMPORTANT: the bypass only has an effect for extensions the walker's
    // detectLanguage() (projectScanner.ts:73-91) recognises. A file is
    // dropped from `discovered` BEFORE resolver.shouldIgnore() is even
    // consulted for secret-bypass purposes if it has no `language`
    // (projectScanner.ts:169-173: `if (!language) continue;` runs before
    // the ignore check). `.env`/`.env.*` (filename-based) and `*.json`
    // (extension-based) have a language; `*.pem`, `*.key`, `.npmrc`,
    // `.pypirc` do NOT (no case for them in the detectLanguage() switch,
    // and SCANNABLE_EXTENSIONS omits them) — see CONTRACT GAP below.

    const workingCases: ReadonlyArray<{ label: string; filename: string }> = [
      { label: '.env', filename: '.env' },
      { label: '.env.local', filename: '.env.local' },
      { label: 'credentials.json', filename: 'credentials.json' },
      { label: 'firebase-adminsdk-*.json (Part-7 case)', filename: 'firebase-adminsdk-abc123.json' },
      { label: 'serviceAccountKey.json', filename: 'serviceAccountKey.json' },
    ];

    for (const { label, filename } of workingCases) {
      it(`scans ${label} even when .gitignore excludes everything`, () => {
        const dir = fixture('walker-secret-bypass-');
        // Blanket-ignore everything so we know any inclusion is due to the
        // secret-shaped bypass, not an accident of a narrower pattern.
        writeFile(dir, '.gitignore', '*\n');
        writeFile(dir, filename, 'SECRET_VALUE=should-still-be-scanned\n');

        const files = discoverFiles(dir);

        assert.equal(files.includes(filename), true,
          `${filename} is secret-shaped and must bypass .gitignore (Part-7 fix)`);
      });
    }

    // Fixed contract: detectLanguage() now maps *.pem / *.key / .npmrc /
    // .pypirc to the 'env' language (they're secret-carrying config/key
    // files), so they reach resolver.shouldIgnore() like every other
    // secret-shaped filename and the bypass applies.
    it('scans server.pem even when gitignored', () => {
      const dir = fixture('walker-secret-bypass-pem-');
      writeFile(dir, '.gitignore', '*\n');
      writeFile(dir, 'server.pem', '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n');

      const files = discoverFiles(dir);

      assert.equal(files.includes('server.pem'), true,
        'server.pem is documented as secret-shaped and should bypass .gitignore');
    });

    it('scans app.key / .npmrc / .pypirc even when gitignored', () => {
      const dir = fixture('walker-secret-bypass-misc-');
      writeFile(dir, '.gitignore', '*\n');
      writeFile(dir, 'app.key', 'fake-key-material\n');
      writeFile(dir, '.npmrc', '//registry.npmjs.org/:_authToken=fake\n');
      writeFile(dir, '.pypirc', '[pypi]\npassword=fake\n');

      const files = discoverFiles(dir);

      assert.equal(files.includes('app.key'), true, 'app.key should bypass .gitignore');
      assert.equal(files.includes('.npmrc'), true, '.npmrc should bypass .gitignore');
      assert.equal(files.includes('.pypirc'), true, '.pypirc should bypass .gitignore');
    });

    it('hides server.pem under --respect-gitignore-fully', () => {
      const dir = fixture('walker-secret-bypass-pem-strict-');
      writeFile(dir, '.gitignore', '*\n');
      writeFile(dir, 'server.pem', '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n');

      // discoverFiles() doesn't accept the strict flag (same limitation
      // noted in case 3 below), so we assert at the resolver level directly.
      const strictResolver = createIgnoreResolver(dir, { respectGitignoreForSecretFiles: true });
      assert.equal(strictResolver.shouldIgnore('server.pem', 'file'), true,
        '--respect-gitignore-fully must fully honor .gitignore for server.pem');
    });

    it('scanProject: a gitignored server.pem with real PEM content is found by default, and hidden under --respect-gitignore-fully', async function () {
      this.timeout(20000);
      registerAllPacks();

      const dir = fixture('walker-secret-bypass-pem-scan-');
      writeFile(dir, '.gitignore', 'server.pem\n');
      writeFile(dir, 'server.pem',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIfakefakefakefakefakefakefakefakefakefakefakefakefakeAAAA\n-----END RSA PRIVATE KEY-----\n');

      const defaultReport = await scanProject({ root: dir });
      const defaultHasFinding = defaultReport.issues.some(
        iss => iss.id === 'core-security-hardcoded-secret-pattern' && iss.evidence.file.replace(/\\/g, '/') === 'server.pem',
      );
      assert.equal(defaultHasFinding, true,
        'gitignored server.pem with real PEM key material must be scanned and flagged by default');

      const strictReport = await scanProject({ root: dir, respectGitignoreFully: true });
      const strictHasFinding = strictReport.issues.some(
        iss => iss.id === 'core-security-hardcoded-secret-pattern' && iss.evidence.file.replace(/\\/g, '/') === 'server.pem',
      );
      assert.equal(strictHasFinding, false,
        '--respect-gitignore-fully must fully honor .gitignore, hiding server.pem from the scan');
    });
  });

  describe('case 3: --respect-gitignore-fully disables the secret bypass', () => {
    it('IgnoreResolver: shouldIgnore(".env") is false by default, true with respectGitignoreForSecretFiles', () => {
      const dir = fixture('walker-respect-gitignore-');
      writeFile(dir, '.gitignore', '.env\n');
      writeFile(dir, '.env', 'SECRET=1\n');

      const defaultResolver = createIgnoreResolver(dir);
      assert.equal(defaultResolver.shouldIgnore('.env', 'file'), false,
        'default behaviour bypasses .gitignore for secret-shaped files');

      const strictResolver = createIgnoreResolver(dir, { respectGitignoreForSecretFiles: true });
      assert.equal(strictResolver.shouldIgnore('.env', 'file'), true,
        '--respect-gitignore-fully / respectGitignoreForSecretFiles:true must honor .gitignore');
    });

    it('discoverFiles-level: gitignored .env is scanned by default', () => {
      const dir = fixture('walker-respect-gitignore-walk-');
      writeFile(dir, '.gitignore', '.env\n');
      writeFile(dir, '.env', 'SECRET=1\n');

      const defaultFiles = discoverFiles(dir);
      assert.equal(defaultFiles.includes('.env'), true);

      // discoverFiles() (projectScanner.ts:406-408) doesn't accept
      // respectGitignoreFully directly — it always builds the resolver
      // with default options. The flag is only threaded through
      // scanProject() (projectScanner.ts:310-313). So we verify the
      // strict-mode contract at the resolver level (above) and again via
      // a full scanProject() integration run (below) to prove the CLI
      // flag actually changes what gets scanned end to end.
    });

    it('scanProject: a Stripe key in a gitignored .env is found by default, and hidden under --respect-gitignore-fully', async function () {
      this.timeout(20000);
      registerAllPacks();

      const dir = fixture('walker-respect-gitignore-scan-');
      writeFile(dir, '.gitignore', '.env\n');
      // sk_live_ + 16+ alnum chars matches core-security-hardcoded-secret-pattern
      // (shared/packs/core-security/core-security-hardcoded-secret-pattern.ts:55).
      // Mixed-character tail (not looksLikePlaceholder()-shaped — see
      // core-security-hardcoded-secret-pattern.ts:102-108, which treats a
      // run of 7+ identical trailing chars as a placeholder and skips it).
      writeFile(dir, '.env', 'STRIPE_SECRET_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\n');

      const defaultReport = await scanProject({ root: dir });
      const defaultHasStripeFinding = defaultReport.issues.some(
        iss => iss.id === 'core-security-hardcoded-secret-pattern' && iss.evidence.file.replace(/\\/g, '/') === '.env',
      );
      assert.equal(defaultHasStripeFinding, true,
        'gitignored .env with a live Stripe key must be scanned and flagged by default');

      const strictReport = await scanProject({ root: dir, respectGitignoreFully: true });
      const strictHasStripeFinding = strictReport.issues.some(
        iss => iss.id === 'core-security-hardcoded-secret-pattern' && iss.evidence.file.replace(/\\/g, '/') === '.env',
      );
      assert.equal(strictHasStripeFinding, false,
        '--respect-gitignore-fully must fully honor .gitignore, hiding the secret file from the scan');
    });
  });

  describe('case 4a: tsconfig.json outDir contents are skipped', () => {
    it('excludes files under the outDir declared in tsconfig.json', () => {
      const dir = fixture('walker-tsconfig-outdir-');
      writeFile(dir, 'tsconfig.json', JSON.stringify({ compilerOptions: { outDir: 'build' } }));
      writeFile(dir, 'build/output.ts', 'export const compiled = true;\n');
      writeFile(dir, 'src/index.ts', 'export const source = true;\n');

      const files = discoverFiles(dir);

      assert.equal(files.includes('build/output.ts'), false,
        'tsconfig.json compilerOptions.outDir contents must be skipped');
      assert.equal(files.includes('src/index.ts'), true);
    });
  });

  describe('case 4b: package.json "workspaces" field is not given special treatment', () => {
    // A repo-wide grep (`grep -rn "workspaces" daemon/ shared/`) found no
    // code that reads package.json's `workspaces` field for walking
    // purposes (the one unrelated hit is
    // shared/packs/core-security/vibe-supply-chain-hallucinated-import.ts,
    // which checks import specifiers, not directory structure). The
    // walker's contract is therefore: `workspaces` has NO effect — files
    // under workspace-declared package dirs are walked exactly like any
    // other directory (still subject to node_modules/.git universal
    // ignores, .gitignore, and tsconfig outDir, nothing more).
    it('scans files inside a workspace package exactly like any other directory', () => {
      const dir = fixture('walker-workspaces-');
      writeFile(dir, 'package.json', JSON.stringify({
        name: 'monorepo-root',
        private: true,
        workspaces: ['packages/*'],
      }));
      writeFile(dir, 'packages/pkg-a/index.ts', 'export const a = 1;\n');
      writeFile(dir, 'packages/pkg-a/package.json', JSON.stringify({ name: 'pkg-a' }));

      const files = discoverFiles(dir);

      assert.equal(files.includes('packages/pkg-a/index.ts'), true,
        'workspaces declaration must not cause workspace package files to be skipped');
      assert.equal(files.includes('packages/pkg-a/package.json'), true);
    });

    it('does not skip node_modules inside a workspace package (still caught by the universal ignore)', () => {
      const dir = fixture('walker-workspaces-nm-');
      writeFile(dir, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
      writeFile(dir, 'packages/pkg-a/node_modules/dep/index.js', 'module.exports = {};\n');
      writeFile(dir, 'packages/pkg-a/index.ts', 'export const a = 1;\n');

      const files = discoverFiles(dir);

      assert.equal(files.some(f => f.includes('node_modules')), false,
        'universal node_modules ignore applies uniformly, workspaces or not');
      assert.equal(files.includes('packages/pkg-a/index.ts'), true);
    });
  });
});
