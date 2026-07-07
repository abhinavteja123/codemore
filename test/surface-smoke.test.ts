/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console */
/*
 * Surface smoke tests — prove the two headless distribution surfaces work
 * as REAL processes, not just as in-process imports (which parity.test.ts
 * already covers):
 *
 *   1. `node cli.js scan <dir> --json` — the actual bin entry from
 *      package.json, spawned as a child process, on a fixture with a known
 *      finding. Asserts the emitted report parses and carries issues.
 *   2. `node cli.js serve-mcp` — real JSON-RPC over stdio: initialize +
 *      tools/list must return exactly the 6 public tools documented in
 *      daemon/mcp/server.ts.
 *
 * Everything runs offline against the repo checkout; no build step beyond
 * what `npm ci` provides (cli.js bootstraps its own loader).
 */

import { strict as assert } from 'assert';
import { spawn, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// mocha runs from the repo root (npm run test:unit); __dirname is
// unavailable here because ts-node parses this file as an ES module.
const REPO_ROOT = process.cwd();
const CLI = path.join(REPO_ROOT, 'cli.js');

describe('surface smoke: real CLI binary + MCP server process', function () {
  // Process spawns + a full scan are slower than unit work.
  this.timeout(60000);

  const tempDirs: string[] = [];

  function fixture(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  after(() => {
    for (const dir of tempDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  it('cli.js scan --json emits a parseable schema-shaped report with findings', () => {
    const dir = fixture('surface-smoke-cli-');
    // A .env with a live-shaped key: the one fixture shape the catalog is
    // guaranteed to flag (core-security-hardcoded-secret-pattern, beta).
    fs.writeFileSync(path.join(dir, '.env'), 'STRIPE_KEY=sk_live_abcdefghij1234567890XYZZ\n');

    const stdout = execFileSync(process.execPath, [CLI, 'scan', dir, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });

    const report = JSON.parse(stdout);
    assert.equal(report.schemaVersion, '1.0.0', 'report schemaVersion must be 1.0.0');
    assert.ok(Array.isArray(report.issues), 'report.issues must be an array');
    assert.ok(report.issues.length >= 1, 'the planted live-shaped key must produce a finding');
  });

  it('cli.js serve-mcp answers initialize + tools/list with the 6 public tools', async () => {
    const EXPECTED_TOOLS = [
      'scan_project', 'scan_file', 'explain_issue',
      'suggest_fix', 'validate_fix', 'apply_fix',
    ];

    const child = spawn(process.execPath, [CLI, 'serve-mcp'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      const tools = await new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('MCP handshake timed out after 30s')), 30000);
        let buf = '';
        child.stdout.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
          // stdio transport: one JSON-RPC message per line.
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let msg: { id?: number; result?: { tools?: Array<{ name: string }> } };
            try { msg = JSON.parse(line); } catch { continue; }
            if (msg.id === 1) {
              child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
            } else if (msg.id === 2) {
              clearTimeout(timer);
              resolve((msg.result?.tools ?? []).map(t => t.name));
            }
          }
        });
        child.on('error', reject);
        child.stdin.write(JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'surface-smoke', version: '0.0.0' },
          },
        }) + '\n');
      });

      assert.deepEqual([...tools].sort(), [...EXPECTED_TOOLS].sort(),
        'serve-mcp must expose exactly the 6 public tools (run_agentic_fix stays env-gated)');
    } finally {
      child.kill();
    }
  });

  it('serve-mcp: scan_file runs AST rules, scan_project errors on a missing root', async () => {
    // Regression for two 2026-07-07 tester findings:
    //  - scan_file built its RuleContext with sourceFile:null, so every
    //    AST rule silently skipped — 0 findings for content scan_project
    //    flagged (daemon/mcp/server.ts buildSingleFileContext).
    //  - scan_project on a nonexistent rootPath returned a valid EMPTY
    //    report; an agent reads that as "project is clean".
    const UNREACHABLE = 'export function f(): string {\n  return "x";\n  helper();\n}\nfunction helper(): void {}\n';

    const child = spawn(process.execPath, [CLI, 'serve-mcp'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    interface RpcMsg {
      id?: number;
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    }
    try {
      const results = await new Promise<Map<number, RpcMsg['result']>>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('MCP tools/call flow timed out after 45s')), 45000);
        const got = new Map<number, RpcMsg['result']>();
        let buf = '';
        child.stdout.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let msg: RpcMsg;
            try { msg = JSON.parse(line); } catch { continue; }
            if (msg.id === 1) {
              child.stdin.write(JSON.stringify({
                jsonrpc: '2.0', id: 2, method: 'tools/call',
                params: { name: 'scan_file', arguments: { filePath: 'src/pivot.ts', content: UNREACHABLE } },
              }) + '\n');
            } else if (msg.id === 2) {
              got.set(2, msg.result);
              child.stdin.write(JSON.stringify({
                jsonrpc: '2.0', id: 3, method: 'tools/call',
                params: { name: 'scan_project', arguments: { rootPath: path.join(os.tmpdir(), 'codemore-definitely-missing-dir-xyz') } },
              }) + '\n');
            } else if (msg.id === 3) {
              got.set(3, msg.result);
              clearTimeout(timer);
              resolve(got);
            }
          }
        });
        child.on('error', reject);
        child.stdin.write(JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'surface-smoke', version: '0.0.0' },
          },
        }) + '\n');
      });

      const scanFile = results.get(2);
      const payload = JSON.parse(scanFile?.content?.[0]?.text ?? '{}') as { issues?: Array<{ id: string }> };
      assert.ok(
        (payload.issues ?? []).some(i => i.id === 'core-quality-unreachable-code'),
        'scan_file must run AST rules on inline TS content (sourceFile parsed, not null)');

      const badRoot = results.get(3);
      assert.equal(badRoot?.isError, true,
        'scan_project on a nonexistent rootPath must be an isError result, not an empty clean report');
    } finally {
      child.kill();
    }
  });
});
