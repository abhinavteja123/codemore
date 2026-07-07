/**
 * White-box tests for ProjectIndex (daemon/cli/projectIndex.ts) —
 * the cross-file snapshot rules like `vibe-no-rate-limit` rely on.
 *
 * Contract tested (temp project on disk -> output), via the public entry
 * points:
 *   - `buildProjectIndex(root)` directly.
 *   - `scanProject({ root })` (daemon/cli/projectScanner.ts) end to end,
 *     to prove a real cross-file rule sees every route file in the
 *     project AND that two sequential scans of different temp projects
 *     don't leak state into each other (buildProjectIndex is rebuilt
 *     fresh per scan — this test locks that contract).
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildProjectIndex } from '../daemon/cli/projectIndex';
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

describe('ProjectIndex isolation (daemon/cli/projectIndex.ts)', () => {
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

  describe('buildProjectIndex: cross-file route discovery', () => {
    it('sees every API route file in the project, not just one', () => {
      const dir = fixture('project-index-routes-');
      writeFile(dir, 'pages/api/users.ts', 'export default function handler() {}\n');
      writeFile(dir, 'pages/api/orders/create.ts', 'export default function handler() {}\n');
      writeFile(dir, 'app/api/health/route.ts', 'export async function GET() { return new Response("ok"); }\n');
      writeFile(dir, 'src/util.ts', 'export const noop = () => {};\n');

      const index = buildProjectIndex(dir);
      const relPaths = index.routeFiles.map(r => r.relPath).sort();

      assert.deepEqual(relPaths, [
        'app/api/health/route.ts',
        'pages/api/orders/create.ts',
        'pages/api/users.ts',
      ]);
    });

    it('hasRateLimitLib is true when any file anywhere imports a rate-limit library', () => {
      const dir = fixture('project-index-ratelimit-');
      writeFile(dir, 'pages/api/users.ts', 'export default function handler() {}\n');
      writeFile(dir, 'lib/limiter.ts', "import { Ratelimit } from '@upstash/ratelimit';\nexport const rl = new Ratelimit();\n");

      const index = buildProjectIndex(dir);
      assert.equal(index.hasRateLimitLib, true);
    });
  });

  describe('scanProject: vibe-no-rate-limit sees all route files in the project', () => {
    it('fires once per route file when the project has zero rate-limit libraries', async function () {
      this.timeout(20000);
      registerAllPacks();

      const dir = fixture('project-index-scan-noratelimit-');
      writeFile(dir, 'pages/api/users.ts', 'export default function handler(req, res) { res.json({}); }\n');
      writeFile(dir, 'pages/api/orders.ts', 'export default function handler(req, res) { res.json({}); }\n');

      const report = await scanProject({ root: dir });
      const rateLimitFindings = report.issues.filter(i => i.id === 'vibe-no-rate-limit');
      const flaggedFiles = rateLimitFindings.map(i => i.evidence.file.replace(/\\/g, '/')).sort();

      assert.deepEqual(flaggedFiles, ['pages/api/orders.ts', 'pages/api/users.ts'],
        'vibe-no-rate-limit must fire for every route file when no rate-limit lib is imported anywhere');
    });

    it('does not fire when a rate-limit library is imported anywhere in the project', async function () {
      this.timeout(20000);
      registerAllPacks();

      const dir = fixture('project-index-scan-withratelimit-');
      writeFile(dir, 'pages/api/users.ts', 'export default function handler(req, res) { res.json({}); }\n');
      writeFile(dir, 'lib/limiter.ts', "import { Ratelimit } from '@upstash/ratelimit';\nexport const rl = new Ratelimit();\n");

      const report = await scanProject({ root: dir });
      const rateLimitFindings = report.issues.filter(i => i.id === 'vibe-no-rate-limit');
      assert.equal(rateLimitFindings.length, 0);
    });
  });

  describe('two sequential scanProject runs on different temp projects do not leak state', () => {
    it('project A (no rate-limit lib, fires) does not pollute project B (has rate-limit lib, silent)', async function () {
      this.timeout(20000);
      registerAllPacks();

      const dirA = fixture('project-index-leak-a-');
      writeFile(dirA, 'pages/api/users.ts', 'export default function handler(req, res) { res.json({}); }\n');

      const dirB = fixture('project-index-leak-b-');
      writeFile(dirB, 'pages/api/orders.ts', 'export default function handler(req, res) { res.json({}); }\n');
      writeFile(dirB, 'lib/limiter.ts', "import { Ratelimit } from '@upstash/ratelimit';\nexport const rl = new Ratelimit();\n");

      const reportA = await scanProject({ root: dirA });
      const reportB = await scanProject({ root: dirB });

      const aHasFinding = reportA.issues.some(i => i.id === 'vibe-no-rate-limit');
      const bHasFinding = reportB.issues.some(i => i.id === 'vibe-no-rate-limit');

      assert.equal(aHasFinding, true, 'project A has no rate-limit lib — must fire');
      assert.equal(bHasFinding, false,
        'project B has a rate-limit lib — a leaked ProjectIndex from project A ' +
        '(e.g. a stale hasRateLimitLib:false, or A\'s route files bleeding into B) would wrongly fire here');

      // Cross-check: neither report references the other project's files.
      const bFiles = reportB.issues.map(i => i.evidence.file.replace(/\\/g, '/'));
      assert.equal(bFiles.includes('pages/api/users.ts'), false,
        'project B report must never reference project A files');
    });

    it('running project B first then A still isolates correctly (order-independence)', async function () {
      this.timeout(20000);
      registerAllPacks();

      const dirWithLib = fixture('project-index-leak-order-with-');
      writeFile(dirWithLib, 'pages/api/a.ts', 'export default function handler(req, res) { res.json({}); }\n');
      writeFile(dirWithLib, 'lib/limiter.ts', "import { Ratelimit } from '@upstash/ratelimit';\nexport const rl = new Ratelimit();\n");

      const dirNoLib = fixture('project-index-leak-order-without-');
      writeFile(dirNoLib, 'pages/api/b.ts', 'export default function handler(req, res) { res.json({}); }\n');

      const reportWithLib = await scanProject({ root: dirWithLib });
      const reportNoLib = await scanProject({ root: dirNoLib });

      assert.equal(reportWithLib.issues.some(i => i.id === 'vibe-no-rate-limit'), false);
      assert.equal(reportNoLib.issues.some(i => i.id === 'vibe-no-rate-limit'), true);
    });
  });

  describe('allImportedNames: consumption forms the unused-export rule depends on', () => {
    it('collects names consumed via renamed re-export, require destructuring, and namespace member access', () => {
      const dir = fixture('project-index-imported-names-');
      // Renamed re-export: X consumed from lib without any ImportDeclaration.
      writeFile(dir, 'barrel.ts', "export { X as Y } from './lib';\n");
      // CommonJS destructuring: runScan + orig (via alias) consumed.
      writeFile(dir, 'consume.js', "const { runScan, orig: alias } = require('./lib');\nrunScan(alias);\n");
      // Namespace member access: parseOutput consumed through ns.*.
      writeFile(dir, 'ns.ts', "import * as ns from './lib';\nexport const v = ns.parseOutput('');\n");

      const idx = buildProjectIndex(dir);

      for (const name of ['X', 'Y', 'runScan', 'orig', 'parseOutput']) {
        assert.equal(idx.allImportedNames.has(name), true, `${name} should be collected as imported`);
      }
    });
  });
});
