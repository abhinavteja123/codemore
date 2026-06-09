/**
 * Tests for the agentic fixer loop.
 *
 * The orchestrator is provider-agnostic by design: it takes a `FixGenerator`
 * function as input. That makes it cheap to test the loop deterministically
 * without an LLM by passing a stub generator with a scripted set of
 * responses.
 *
 * What we exercise:
 *   1. Happy path — generator returns a clean patch on attempt 1, validator
 *      reports PASS, loop returns 'applied' after 1 attempt.
 *   2. Retry path — generator returns a broken patch on attempt 1, the
 *      validator returns FAIL, the loop calls the generator again with the
 *      diagnostic in the prompt, the 2nd attempt passes.
 *   3. Exhaustion — generator never produces a valid patch; the loop
 *      returns 'failed' after maxAttempts.
 *   4. Generator error — generator throws; loop short-circuits with 'failed'.
 *   5. Code-fence stripping — `stripCodeFences` only strips when the whole
 *      output is one fenced block (so markdown fixtures aren't mangled).
 *
 * Fixture: a temp file the orchestrator reads from disk. We use
 * `core-quality-unreachable-code` because its TP fixture is tiny and the
 * rule is deterministic.
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { registerAllPacks } from '../daemon/cli/registerPacks';
import { globalRegistry } from '../shared/rules/registry';
import {
  buildFixPrompt,
  runAgenticFix,
  stripCodeFences,
  type FixGenerator,
} from '../daemon/services/agenticFixer';
import type { ReportIssue } from '../shared/report/types';
import type { RuleContext } from '../shared/rules/Rule';

const FIXTURE_DIR_PREFIX = path.join(os.tmpdir(), 'codemore-agentic-fixer-');

const BUGGY_CONTENT = [
  'export function pickFirst(): string {',
  '  return "first";',
  '  cleanup();',          // ← unreachable-code fires here
  '}',
  '',
  'function cleanup(): void {}',
  '',
].join('\n');

const CLEAN_CONTENT = [
  'export function pickFirst(): string {',
  '  return "first";',
  '}',
  '',
  'function cleanup(): void {}',
  '',
].join('\n');

let tempDir: string;
let tempFile: string;
let issue: ReportIssue;

before(() => {
  registerAllPacks();
  tempDir = fs.mkdtempSync(FIXTURE_DIR_PREFIX);
  tempFile = path.join(tempDir, 'src', 'pivot.ts');
  fs.mkdirSync(path.dirname(tempFile), { recursive: true });
  fs.writeFileSync(tempFile, BUGGY_CONTENT);

  // Build a real ReportIssue by scanning the file once. This way we
  // exercise the same code path the MCP tool uses.
  const relPath = path.relative(tempDir, tempFile).replace(/\\/g, '/');
  const ctx: RuleContext = {
    filePath: relPath,
    extension: '.ts',
    language: 'typescript',
    content: BUGGY_CONTENT,
    lines: BUGGY_CONTENT.split('\n'),
    sourceFile: null,
    frameworks: [],
  };
  // Parse for AST-based rules
  const ts = require('typescript') as typeof import('typescript');
  (ctx as { sourceFile: unknown }).sourceFile = ts.createSourceFile(
    relPath, BUGGY_CONTENT, ts.ScriptTarget.Latest, true,
  );
  const scan = globalRegistry.scanFile(ctx, { enableExperimental: true });
  const found = scan.issues.find(i => i.id === 'core-quality-unreachable-code');
  if (!found) {
    throw new Error('Test setup failed: core-quality-unreachable-code did not fire on fixture');
  }
  issue = found;
});

after(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* noop */ }
});

describe('agentic fixer', () => {
  it('happy path: generator returns clean patch on attempt 1 → applied', async () => {
    const generate: FixGenerator = async () => CLEAN_CONTENT;
    const result = await runAgenticFix({
      workspaceRoot: tempDir,
      issue,
      generate,
    });
    assert.equal(result.status, 'applied');
    assert.equal(result.attempts, 1);
    assert.equal(result.finalContent, CLEAN_CONTENT);
    assert.equal(result.history.length, 1);
    assert.ok(result.history[0].validation.passed, 'validation should pass');
  });

  it('retry path: broken patch then clean patch → applied on attempt 2', async () => {
    let call = 0;
    const generate: FixGenerator = async () => {
      call++;
      // Attempt 1: a patch that does NOT remove the unreachable line.
      if (call === 1) return BUGGY_CONTENT;
      // Attempt 2: clean.
      return CLEAN_CONTENT;
    };
    const result = await runAgenticFix({
      workspaceRoot: tempDir,
      issue,
      generate,
    });
    assert.equal(result.status, 'applied');
    assert.equal(result.attempts, 2);
    assert.equal(result.history.length, 2);
    assert.equal(result.history[0].validation.passed, false);
    assert.equal(result.history[1].validation.passed, true);
    // The 2nd prompt MUST include the previous attempt's diagnostic.
    assert.ok(
      result.history[1].prompt.includes('Previous attempt diagnostic'),
      'retry prompt should include previous-attempt diagnostic',
    );
  });

  it('exhaustion: generator never produces a valid patch → failed after maxAttempts', async () => {
    const generate: FixGenerator = async () => BUGGY_CONTENT; // never fixes
    const result = await runAgenticFix({
      workspaceRoot: tempDir,
      issue,
      generate,
      options: { maxAttempts: 3 },
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.attempts, 3);
    assert.equal(result.history.length, 3);
    assert.match(result.reason, /Exhausted/);
  });

  it('respects maxAttempts: maxAttempts=1 → 1 attempt then fail', async () => {
    const generate: FixGenerator = async () => BUGGY_CONTENT;
    const result = await runAgenticFix({
      workspaceRoot: tempDir,
      issue,
      generate,
      options: { maxAttempts: 1 },
    });
    assert.equal(result.attempts, 1);
    assert.equal(result.status, 'failed');
  });

  it('generator error: short-circuits with failed', async () => {
    const generate: FixGenerator = async () => { throw new Error('LLM rate-limited'); };
    const result = await runAgenticFix({
      workspaceRoot: tempDir,
      issue,
      generate,
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.attempts, 1);
    assert.match(result.reason, /rate-limited/);
  });

  it('strips a whole-output code fence', () => {
    const fenced = '```ts\nconst x = 1;\n```';
    assert.equal(stripCodeFences(fenced), 'const x = 1;');
  });

  it('preserves inline code fences (markdown fixture safety)', () => {
    const markdown = '# Heading\n\nSome text\n\n```ts\ninner\n```\n\nMore text';
    assert.equal(stripCodeFences(markdown), markdown);
  });

  it('buildFixPrompt includes the line-numbered file content', () => {
    const prompt = buildFixPrompt({
      issue,
      currentContent: BUGGY_CONTENT,
      attempt: 1,
    });
    assert.match(prompt, /Rule:\s+core-quality-unreachable-code/);
    assert.match(prompt, /Verification criteria/);
    assert.match(prompt, /Current file content/);
    // Should NOT contain a retry block on attempt 1.
    assert.equal(prompt.includes('Previous attempt diagnostic'), false);
  });
});
