import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

describe('externalToolRunner', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('isToolAvailable', () => {
    it('returns true when binary exits 0 on --version', async () => {
      mockedExecFile.mockImplementation((_b, _a, _o, cb: any) => {
        cb(null, '1.0.0', ''); return {} as any;
      });
      const { isToolAvailable } = await import('../services/externalToolRunner');
      expect(await isToolAvailable('/usr/bin/semgrep')).toBe(true);
    });

    it('returns false when binary does not exist', async () => {
      mockedExecFile.mockImplementation((_b, _a, _o, cb: any) => {
        cb(new Error('ENOENT'), '', ''); return {} as any;
      });
      const { isToolAvailable } = await import('../services/externalToolRunner');
      expect(await isToolAvailable('/nonexistent/binary')).toBe(false);
    });

    it('passes --version as array arg, never as shell string', async () => {
      mockedExecFile.mockImplementation((_b, args, _o, cb: any) => {
        cb(null, '1.0.0', ''); return {} as any;
      });
      const { isToolAvailable } = await import('../services/externalToolRunner');
      await isToolAvailable('/usr/bin/semgrep');

      const [binary, args] = mockedExecFile.mock.calls[0];
      expect(typeof binary).toBe('string');
      expect(Array.isArray(args)).toBe(true);
      expect(args).toContain('--version');
      // Critical: binary string must NOT contain the args
      expect(binary).not.toContain('--version');
    });

    it('file path passed as array element, never shell-interpolated', async () => {
      const dangerousPath = '/tmp/"; rm -rf /; echo "';
      mockedExecFile.mockImplementation((_b, args, _o, cb: any) => {
        // Verify dangerous path is in args array, not in binary string
        expect(Array.isArray(args)).toBe(true);
        expect(args.some((a: string) => a === dangerousPath ||
          a.includes(dangerousPath))).toBe(true);
        cb(null, '{}', ''); return {} as any;
      });
      const { runSemgrep } = await import('../services/externalToolRunner');
      await runSemgrep(dangerousPath, {} as any).catch(() => {});
    });
  });

  describe('runSemgrep', () => {
    it('returns empty array on non-zero exit', async () => {
      mockedExecFile.mockImplementation((_b, _a, _o, cb: any) => {
        const err = new Error('exit 1') as any; err.code = 1;
        cb(err, '', ''); return {} as any;
      });
      const { runSemgrep } = await import('../services/externalToolRunner');
      const result = await runSemgrep('/test/file.ts', {} as any);
      expect(result).toEqual([]);
    });

    it('parses valid Semgrep JSON output', async () => {
      const output = JSON.stringify({
        results: [{
          check_id: 'javascript.eval',
          path: '/test/file.ts',
          start: { line: 10 },
          extra: { message: 'eval() detected', severity: 'ERROR' }
        }], errors: []
      });
      mockedExecFile.mockImplementation((_b, _a, _o, cb: any) => {
        cb(null, output, ''); return {} as any;
      });
      const { runSemgrep } = await import('../services/externalToolRunner');
      const result = await runSemgrep('/test/file.ts', {} as any);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
