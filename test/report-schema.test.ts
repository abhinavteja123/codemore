/**
 * Report schema validation — "the report is the product" gap.
 *
 * Every previous test (parity.test.ts included) checks cross-surface
 * EQUALITY after stripping volatile fields, but never VALIDITY: nothing
 * asserted that a real, end-to-end `scanProject()` report actually
 * satisfies `shared/report/schema.json` (draft-07, strict
 * `additionalProperties:false`) — the contract AI agents parse this
 * report against. This suite closes that gap with `ajv` in strict mode.
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import { scanProject } from '../daemon/cli/projectScanner';
import { registerAllPacks } from '../daemon/cli/registerPacks';
import schema from '../shared/report/schema.json';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function buildValidator(): ValidateFunction {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe('report schema validation (shared/report/schema.json, ajv strict)', () => {
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

  before(() => {
    registerAllPacks();
  });

  it('a real report with at least one finding validates against the schema', async function () {
    this.timeout(20000);
    const dir = fixture('report-schema-findings-');
    // sk_live_ + 16+ alnum chars matches core-security-hardcoded-secret-pattern;
    // mixed-character tail avoids the placeholder heuristic.
    writeFile(dir, 'src/config.ts', "export const key = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';\n");

    const report = await scanProject({ root: dir });
    assert.ok(report.issues.length > 0, 'fixture must actually produce at least one finding');

    const validate = buildValidator();
    const valid = validate(report);
    if (!valid) {
      throw new Error(
        'report FAILED schema validation:\n' + JSON.stringify(validate.errors, null, 2) +
        '\n\nreport:\n' + JSON.stringify(report, null, 2),
      );
    }
    assert.equal(valid, true);
  });

  it('a real report with zero findings (empty project) also validates', async function () {
    this.timeout(20000);
    const dir = fixture('report-schema-empty-');
    writeFile(dir, 'README.md', '# empty project, nothing to scan here\n');

    const report = await scanProject({ root: dir });
    assert.equal(report.issues.length, 0, 'fixture must produce zero findings');

    const validate = buildValidator();
    const valid = validate(report);
    if (!valid) {
      throw new Error(
        'empty-project report FAILED schema validation:\n' + JSON.stringify(validate.errors, null, 2) +
        '\n\nreport:\n' + JSON.stringify(report, null, 2),
      );
    }
    assert.equal(valid, true);
  });

  it('rejects a report missing a required field (proves the validator has teeth)', async function () {
    this.timeout(20000);
    const dir = fixture('report-schema-mutated-');
    writeFile(dir, 'README.md', '# empty project\n');

    const report = await scanProject({ root: dir });
    const mutated = { ...report } as Partial<typeof report>;
    delete mutated.schemaVersion;

    const validate = buildValidator();
    const valid = validate(mutated);
    assert.equal(valid, false, 'a report missing schemaVersion must fail validation');
    assert.ok(
      validate.errors?.some(e => e.params && (e.params as { missingProperty?: string }).missingProperty === 'schemaVersion'),
      'the specific validation error must name schemaVersion as the missing required property',
    );
  });
});
