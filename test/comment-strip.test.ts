/**
 * White-box tests for the comment/string-stripping helper
 * (shared/rules/stripContent.ts) added in Part 7 to stop regex-based
 * security rules from self-detecting inside their own JSDoc examples /
 * doc-strings / string literals.
 *
 * Contract tested (input source text -> output), via:
 *   - `stripJsCommentsAndStrings` / `stripPyCommentsAndStrings` directly
 *     (byte-offset-preserving contract).
 *   - Two real regex-based rules that depend on the helper —
 *     `core-security-shell-injection` and `core-security-path-traversal`
 *     (shared/packs/core-security/*) — called through their public
 *     `detect(ctx)` entry point: does NOT fire on its own pattern inside a
 *     comment/string, DOES fire on live code.
 */

import { strict as assert } from 'assert';
import { stripJsCommentsAndStrings, stripPyCommentsAndStrings } from '../shared/rules/stripContent';
import { coreSecurityShellInjection } from '../shared/packs/core-security/core-security-shell-injection';
import { coreSecurityPathTraversal } from '../shared/packs/core-security/core-security-path-traversal';
import type { RuleContext } from '../shared/rules/Rule';

function makeCtx(content: string, language: string, filePath: string): RuleContext {
  return {
    filePath,
    extension: '.' + filePath.split('.').pop(),
    language,
    content,
    lines: content.split('\n'),
    sourceFile: null,
    frameworks: [],
  };
}

describe('comment/string-stripping helper (shared/rules/stripContent.ts)', () => {
  describe('stripJsCommentsAndStrings: byte-offset-preserving contract', () => {
    it('preserves total length', () => {
      const src = 'const x = "hello"; // a comment\n/* block */ const y = 1;';
      const out = stripJsCommentsAndStrings(src);
      assert.equal(out.length, src.length);
    });

    it('blanks line comments but keeps the newline', () => {
      const src = 'const x = 1; // eval(cmd)\nconst y = 2;';
      const out = stripJsCommentsAndStrings(src);
      assert.equal(out.includes('eval'), false);
      assert.equal(out.split('\n').length, 2, 'newline structure must be preserved');
    });

    it('blanks double- and single-quoted string literals', () => {
      const out = stripJsCommentsAndStrings('const a = "exec(cmd)"; const b = \'spawn(x)\';');
      assert.equal(out.includes('exec'), false);
      assert.equal(out.includes('spawn'), false);
    });

    it('blanks a multi-line block comment fully, preserving internal newlines', () => {
      const src = '/**\n * fs.readFile(req.params.name, cb)\n */\nconst z = 1;';
      const out = stripJsCommentsAndStrings(src);
      assert.equal(out.includes('readFile'), false);
      assert.equal(out.split('\n').length, src.split('\n').length);
    });

    it('keeps template-literal interpolation expressions visible', () => {
      const out = stripJsCommentsAndStrings('const cmd = `rm ${userInput}`;');
      assert.equal(out.includes('userInput'), true,
        '${...} expressions can carry real user input and must stay visible to dataflow-style rules');
    });
  });

  describe('stripPyCommentsAndStrings: byte-offset-preserving contract', () => {
    it('blanks a triple-quoted docstring', () => {
      const src = '"""\nExample: eval(payload)\n"""\nx = 1';
      const out = stripPyCommentsAndStrings(src);
      assert.equal(out.includes('eval'), false);
      assert.equal(out.length, src.length);
    });

    it('blanks # comments and string literals', () => {
      const out = stripPyCommentsAndStrings("x = 1  # open(name)\ny = 'open(z)'");
      assert.equal(out.includes('open'), false);
    });
  });

  describe('core-security-shell-injection: does not self-match in comments/strings, fires on live code', () => {
    it('does NOT fire when the exec pattern only appears in a JSDoc comment', () => {
      const content = [
        '/**',
        ' * Example of what NOT to do: exec(userCmd)',
        ' */',
        'function safe() { return 1; }',
      ].join('\n');
      const findings = coreSecurityShellInjection.detect(makeCtx(content, 'typescript', 'lib.ts'));
      assert.deepEqual(findings, []);
    });

    it('does NOT fire when the exec pattern only appears inside a string literal', () => {
      const content = 'const docs = "call exec(userCmd) to run a command";';
      const findings = coreSecurityShellInjection.detect(makeCtx(content, 'typescript', 'lib.ts'));
      assert.deepEqual(findings, []);
    });

    it('DOES fire on the same pattern in live, executable code', () => {
      const content = "import { exec } from 'child_process';\nexec(userCmd);";
      const findings = coreSecurityShellInjection.detect(makeCtx(content, 'typescript', 'lib.ts'));
      assert.equal(findings.length, 1);
      assert.equal(findings[0].evidence.line, 2);
    });
  });

  describe('core-security-path-traversal: does not self-match in comments/strings, fires on live code', () => {
    it('does NOT fire when the pattern only appears in a JSDoc comment (TS)', () => {
      const content = [
        '/**',
        ' * Example: fs.readFile(req.params.name, cb)',
        ' */',
        'function safe() { return 1; }',
      ].join('\n');
      const findings = coreSecurityPathTraversal.detect(makeCtx(content, 'typescript', 'lib.ts'));
      assert.deepEqual(findings, []);
    });

    it('does NOT fire when the pattern only appears inside a docstring (Python)', () => {
      const content = [
        '"""',
        'Example: open(BASE + request.args.get("name"))',
        '"""',
        'def safe():',
        '    return 1',
      ].join('\n');
      const findings = coreSecurityPathTraversal.detect(makeCtx(content, 'python', 'lib.py'));
      assert.deepEqual(findings, []);
    });

    it('DOES fire on the same pattern in live TS code', () => {
      const content = "import * as fs from 'fs';\nfs.readFile(req.params.name, cb);";
      const findings = coreSecurityPathTraversal.detect(makeCtx(content, 'typescript', 'lib.ts'));
      assert.equal(findings.length, 1);
      assert.equal(findings[0].evidence.line, 2);
    });

    it('DOES fire on the same pattern in live Python code', () => {
      const content = "def handler(request):\n    return open(BASE + request.args.get('name'))";
      const findings = coreSecurityPathTraversal.detect(makeCtx(content, 'python', 'lib.py'));
      assert.equal(findings.length, 1);
      assert.equal(findings[0].evidence.line, 2);
    });
  });
});
