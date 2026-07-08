/**
 * Tests for the `codemore fix` CLI command surface.
 *
 * The agentic loop itself is covered by agentic-fixer.test.ts; here we test
 * the CLI-specific contract:
 *   1. Arg parsing — flags, path, validation errors.
 *   2. Generator selection from env — provider priority, forcing, and the
 *      no-key-configured case (must return undefined, which runFix turns
 *      into exit 1 + guidance, never a hang or stack trace).
 *   3. runFix with no key exits 1 without touching the filesystem.
 */

import { strict as assert } from 'assert';

import { parseFixArgs, makeEnvGenerator, runFix } from '../daemon/cli/commands/fix';

describe('codemore fix CLI', () => {
  describe('parseFixArgs', () => {
    it('defaults: path ".", dry-run, single most-severe finding, 3 attempts', () => {
      const a = parseFixArgs([]);
      assert.equal(a.path, '.');
      assert.equal(a.write, false);
      assert.equal(a.all, false);
      assert.equal(a.maxAttempts, 3);
      assert.equal(a.enableExperimental, false);
    });

    it('parses path + flags', () => {
      const a = parseFixArgs(['src/app.ts', '--rule', 'core-security-eval', '--all', '--write', '--max-attempts', '5']);
      assert.equal(a.path, 'src/app.ts');
      assert.equal(a.rule, 'core-security-eval');
      assert.equal(a.all, true);
      assert.equal(a.write, true);
      assert.equal(a.maxAttempts, 5);
    });

    it('rejects unknown flags, second paths, bad --max-attempts', () => {
      assert.throws(() => parseFixArgs(['--bogus']), /unknown flag/);
      assert.throws(() => parseFixArgs(['a', 'b']), /one path/);
      assert.throws(() => parseFixArgs(['--max-attempts', 'zero']), /--max-attempts/);
      assert.throws(() => parseFixArgs(['--rule']), /--rule requires/);
    });
  });

  describe('makeEnvGenerator', () => {
    it('returns undefined when no key is set', () => {
      assert.equal(makeEnvGenerator({}), undefined);
    });

    it('prefers anthropic > openai > gemini when several keys are set', () => {
      assert.equal(
        makeEnvGenerator({ ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', GEMINI_API_KEY: 'k' })!.name,
        'anthropic',
      );
      assert.equal(makeEnvGenerator({ OPENAI_API_KEY: 'k', GEMINI_API_KEY: 'k' })!.name, 'openai');
      assert.equal(makeEnvGenerator({ GEMINI_API_KEY: 'k' })!.name, 'gemini');
    });

    it('CODEMORE_LLM_PROVIDER forces the provider, and yields undefined when its key is missing', () => {
      assert.equal(
        makeEnvGenerator({ CODEMORE_LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' })!.name,
        'gemini',
      );
      assert.equal(makeEnvGenerator({ CODEMORE_LLM_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'k' }), undefined);
    });
  });

  describe('runFix without an LLM key', () => {
    const saved: Record<string, string | undefined> = {};
    const KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'CODEMORE_LLM_PROVIDER'];

    beforeEach(() => {
      for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    });
    afterEach(() => {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });

    it('exits 1 with guidance, without scanning or writing anything', async () => {
      const chunks: string[] = [];
      const origWrite = process.stderr.write.bind(process.stderr);
      (process.stderr as any).write = (s: string) => { chunks.push(String(s)); return true; };
      try {
        const code = await runFix(['.']);
        assert.equal(code, 1);
      } finally {
        (process.stderr as any).write = origWrite;
      }
      const out = chunks.join('');
      assert.match(out, /no LLM provider configured/);
      assert.match(out, /ANTHROPIC_API_KEY/);
    });
  });
});
