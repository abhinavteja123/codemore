// False-positive fixture for core-security-shell-injection.
// Array-args spawn/execFile with a VARIABLE command — none must fire.
// Without `shell: true` these never invoke a shell: each args element is a
// separate argv entry, so there is no shell parsing to inject into.

import { execFile, spawn, spawnSync } from 'node:child_process';

const velaBin = process.env.VELA_BIN || 'vela';

// Good: variable binary + literal args array, no shell.
export function runAgent(runtime: string): void {
  const child = spawn(velaBin, ['agent', 'run', '--runtime', runtime]);
  void child;
}

interface Invocation { command: string; args: string[]; }

// Good: fully variable command, args, AND options — still no shell unless
// the options literally say `shell: true`, which we can't see here.
export function runInvocation(invocation: Invocation, invocationOpts: object): void {
  const child = spawn(invocation.command, invocation.args, invocationOpts);
  void child;
}

// Good: execFile with variable command + args and a plain options object.
export function runTool(command: string, args: string[]): void {
  execFile(command, args, { timeout: 120_000 }, () => {});
}

// Good: explicit shell: false.
export function runNoShell(cmd: string, args: string[]): void {
  spawnSync(cmd, args, { shell: false });
}
