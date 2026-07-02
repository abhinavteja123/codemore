/**
 * White-box regression tests for framework detection
 * (daemon/cli/frameworkDetect.ts) and its downstream effect on
 * `targetFrameworks`-gated rules (shared/rules/registry.ts:106-108).
 *
 * Contract under test (from reading frameworkDetect.ts):
 *   - `detectFrameworks(root)` unions two signal sources:
 *       1. package.json dependencies/devDependencies/peerDependencies,
 *          matched against DEP_PATTERNS (frameworkDetect.ts:34-64). The
 *          Supabase signal is `@supabase/(supabase-js|auth-helpers-|ssr$)`
 *          or the bare `supabase` package (lines 36-37).
 *       2. Structural filesystem signals (frameworksFromFilesystem,
 *          lines 101-141) — e.g. a `supabase/migrations/` directory
 *          implies 'supabase' even with no package.json dependency yet
 *          (lines 104-107).
 *   - A project with neither signal does not get 'supabase' in the
 *     result.
 *   - Rules with `targetFrameworks` declared (e.g.
 *     vibe-supabase-anon-key-bundled, shared/packs/vibe-supabase/
 *     vibe-supabase-anon-key-bundled.ts:129) only run when
 *     `ctx.frameworks` contains a matching label — enforced in
 *     shared/rules/registry.ts:106-108. We verify this end to end via
 *     `scanProject()`, since that's the cheapest public entry point that
 *     exercises the real detect-then-gate pipeline.
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { detectFrameworks } from '../daemon/cli/frameworkDetect';
import { scanProject } from '../daemon/cli/projectScanner';
import { registerAllPacks } from '../daemon/cli/registerPacks';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// A createClient() call with a JWT-shaped literal key in a client-reachable
// path (src/app/**), importing @supabase/supabase-js — the exact shape
// vibe-supabase-anon-key-bundled.ts looks for (lines 62-70, 72-80, 91-121).
const CLIENT_REACHABLE_SUPABASE_FILE = [
  "import { createClient } from '@supabase/supabase-js';",
  'export const supabase = createClient(',
  "  'https://example.supabase.co',",
  "  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',",
  ');',
  '',
].join('\n');

describe('frameworkDetect: detection contract', () => {
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

  it('detects "supabase" from a @supabase/supabase-js dependency', () => {
    const dir = fixture('fwdetect-dep-');
    writeFile(dir, 'package.json', JSON.stringify({
      name: 'app',
      dependencies: { '@supabase/supabase-js': '^2.0.0' },
    }));

    const frameworks = detectFrameworks(dir);

    assert.equal(frameworks.includes('supabase'), true);
  });

  it('detects "supabase" from @supabase/supabase-js in devDependencies too', () => {
    const dir = fixture('fwdetect-devdep-');
    writeFile(dir, 'package.json', JSON.stringify({
      name: 'app',
      devDependencies: { '@supabase/supabase-js': '^2.0.0' },
    }));

    const frameworks = detectFrameworks(dir);

    assert.equal(frameworks.includes('supabase'), true);
  });

  it('does not detect "supabase" when there is no dependency or structural signal', () => {
    const dir = fixture('fwdetect-none-');
    writeFile(dir, 'package.json', JSON.stringify({
      name: 'app',
      dependencies: { express: '^4.0.0' },
    }));

    const frameworks = detectFrameworks(dir);

    assert.equal(frameworks.includes('supabase'), false);
  });

  it('returns [] for a project with no package.json and no structural signals', () => {
    const dir = fixture('fwdetect-empty-');
    writeFile(dir, 'README.md', '# empty project\n');

    const frameworks = detectFrameworks(dir);

    assert.deepEqual(frameworks, []);
  });

  it('detects "supabase" from a supabase/migrations/ directory with no package.json dependency', () => {
    const dir = fixture('fwdetect-structural-');
    writeFile(dir, 'supabase/migrations/0001_init.sql', 'create table t (id uuid);\n');

    const frameworks = detectFrameworks(dir);

    assert.equal(frameworks.includes('supabase'), true);
  });

  it('drops the bare "react" label when "nextjs" is also present (frameworkDetect.ts:94-97)', () => {
    const dir = fixture('fwdetect-next-dedupe-');
    writeFile(dir, 'package.json', JSON.stringify({
      name: 'app',
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
    }));

    const frameworks = detectFrameworks(dir);

    assert.equal(frameworks.includes('nextjs'), true);
    assert.equal(frameworks.includes('react'), false);
  });
});

describe('frameworkDetect: gates targetFrameworks rules via scanProject (integration)', () => {
  const tempDirs: string[] = [];
  function fixture(prefix: string): string {
    const dir = mkTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  }
  before(() => {
    registerAllPacks();
  });
  after(() => {
    for (const dir of tempDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  });

  it('flags vibe-supabase-anon-key-bundled when @supabase/supabase-js is a declared dependency', async function () {
    this.timeout(20000);
    const dir = fixture('fwgate-supabase-yes-');
    writeFile(dir, 'package.json', JSON.stringify({
      name: 'app',
      dependencies: { '@supabase/supabase-js': '^2.0.0' },
    }));
    writeFile(dir, 'src/app/client.ts', CLIENT_REACHABLE_SUPABASE_FILE);

    const report = await scanProject({ root: dir });

    const found = report.issues.some(iss => iss.id === 'vibe-supabase-anon-key-bundled');
    assert.equal(found, true,
      'vibe-supabase-anon-key-bundled should fire once the project is detected as a Supabase project');
  });

  it('does NOT flag vibe-supabase-anon-key-bundled when no Supabase signal is present, even though the file imports @supabase/supabase-js', async function () {
    this.timeout(20000);
    const dir = fixture('fwgate-supabase-no-');
    // No package.json at all -> detectFrameworks() returns [] (no dep
    // signal, no structural signal). The file itself still imports
    // '@supabase/supabase-js' and has the exact hardcoded-JWT shape the
    // rule's AST detector looks for — isolating that the gate is
    // `ctx.frameworks`, not the file-level import check.
    writeFile(dir, 'src/app/client.ts', CLIENT_REACHABLE_SUPABASE_FILE);

    const report = await scanProject({ root: dir });

    const found = report.issues.some(iss => iss.id === 'vibe-supabase-anon-key-bundled');
    assert.equal(found, false,
      'rule must not fire when the project has no detected Supabase framework signal (targetFrameworks gate, registry.ts:106-108)');
  });
});
