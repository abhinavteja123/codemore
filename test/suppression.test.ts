/**
 * White-box tests for the suppress-comment parser
 * (shared/rules/suppression.ts) — the single source of suppression
 * semantics shared by every rule engine (registry.ts:121,139).
 *
 * Contract tested (input source text -> output), via the module's two
 * exported entry points:
 *   - `extractSuppressComments(content)` — parses directives out of a file.
 *   - `isLocationSuppressed(ruleId, line, suppressed)` — the lookup a rule
 *     finding is checked against.
 */

import { strict as assert } from 'assert';
import {
  extractSuppressComments,
  isLocationSuppressed,
} from '../shared/rules/suppression';

describe('suppression parser (shared/rules/suppression.ts)', () => {
  describe('inline same-line suppression', () => {
    it('suppresses its rule on the exact line the directive is on', () => {
      const content = [
        'const x = 1;',
        'eval(userInput); // codemore-ignore: no-eval',
        'const y = 2;',
      ].join('\n');

      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('no-eval', 2, suppressed), true);
    });

    it('does not suppress the same rule on a different line', () => {
      const content = 'eval(userInput); // codemore-ignore: no-eval\nconst y = 2;';
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('no-eval', 1, suppressed), true,
        'the directive is on line 1, so line 1 must be suppressed');
      assert.equal(isLocationSuppressed('no-eval', 2, suppressed), false,
        'same-line suppression must not leak to other lines');
    });

    it('supports comma-separated rule lists on one directive', () => {
      const content = 'dangerous(); // codemore-ignore: no-eval, vibe-supabase-rls-disabled';
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('no-eval', 1, suppressed), true);
      assert.equal(isLocationSuppressed('vibe-supabase-rls-disabled', 1, suppressed), true);
      assert.equal(isLocationSuppressed('some-other-rule', 1, suppressed), false);
    });

    it('wildcard "*" suppresses any rule at that location', () => {
      const content = 'dangerous(); // codemore-ignore: *';
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('literally-anything', 1, suppressed), true);
    });
  });

  describe('malformed directives are ignored gracefully', () => {
    it('does not crash and parses nothing for a directive with no colon/rule list', () => {
      const content = 'eval(userInput); // codemore-ignore';
      let suppressed: ReturnType<typeof extractSuppressComments> = [];
      assert.doesNotThrow(() => { suppressed = extractSuppressComments(content); });
      assert.deepEqual(suppressed, []);
      assert.equal(isLocationSuppressed('no-eval', 1, suppressed), false,
        'a malformed directive must not accidentally suppress anything');
    });

    it('does not crash on an empty file or a file with no directives at all', () => {
      assert.doesNotThrow(() => extractSuppressComments(''));
      assert.deepEqual(extractSuppressComments(''), []);
      assert.deepEqual(extractSuppressComments('const a = 1;\nconst b = 2;\n'), []);
    });

    it('a directive naming only whitespace/garbage does not produce a phantom rule id', () => {
      const content = 'x(); // codemore-ignore: ,,,';
      const suppressed = extractSuppressComments(content);
      // parseRuleList filters out empty tokens after trimming/stripping.
      assert.deepEqual(suppressed, []);
    });
  });

  describe('codemore-ignore-file (file-level directive)', () => {
    it('suppresses the named rule at every line in the file', () => {
      const content = [
        '/* codemore-ignore-file: no-eval */',
        'eval(a);',
        'function f() { eval(b); }',
      ].join('\n');

      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('no-eval', 2, suppressed), true);
      assert.equal(isLocationSuppressed('no-eval', 3, suppressed), true);
      assert.equal(isLocationSuppressed('no-eval', 999, suppressed), true,
        'file-level suppression applies regardless of line number');
    });

    it('HTML-comment form also works (for .md/.vue/.html files)', () => {
      const content = '<!-- codemore-ignore-file: no-eval -->\n<script>eval(a)</script>';
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('no-eval', 2, suppressed), true);
    });

    it('does not suppress a rule not named in the file-level directive', () => {
      const content = '/* codemore-ignore-file: no-eval */\neval(a);';
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('vibe-no-rate-limit', 2, suppressed), false);
    });
  });

  describe('unknown rule id in a directive does not suppress others', () => {
    it('a directive for rule A leaves rule B findings on the same line unsuppressed', () => {
      const content = 'riskyCall(); // codemore-ignore: totally-unknown-rule-id';
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('totally-unknown-rule-id', 1, suppressed), true);
      assert.equal(isLocationSuppressed('core-security-shell-injection', 1, suppressed), false,
        'suppressing an unrelated/unknown rule id must not blanket-suppress every rule on the line');
    });
  });

  describe('codemore-ignore-next-line', () => {
    it('applies to the line AFTER the directive, not the directive line itself', () => {
      const content = [
        '// codemore-ignore-next-line: no-eval',
        'eval(a);',
      ].join('\n');
      const suppressed = extractSuppressComments(content);
      assert.equal(isLocationSuppressed('no-eval', 1, suppressed), false);
      assert.equal(isLocationSuppressed('no-eval', 2, suppressed), true);
    });
  });
});
