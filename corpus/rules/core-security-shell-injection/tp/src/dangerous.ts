// True-positive fixture for core-security-shell-injection.
// All five should fire.

import { exec, execSync, spawn } from 'node:child_process';

export function runUserCommand(cmd: string): void {
  // Template literal with ${} interpolation — BLOCKER
  exec(`git log ${cmd}`, (err, stdout) => { void err; void stdout; });
}

export function checkoutRef(ref: string): string {
  // String concatenation — BLOCKER
  return execSync('git checkout ' + ref).toString();
}

export function lsTarget(target: string): void {
  // Bare identifier first arg — BLOCKER (we can't prove `target` is a constant)
  spawn(target);
}

export function delegateToHelper(command: string): void {
  // exec with bare identifier — BLOCKER
  exec(command);
}

export function shellOptIn(cmd: string, args: string[]): void {
  // Array-args spawn is normally safe, but `shell: true` re-enables the
  // shell parser — variable command/args become injectable again. BLOCKER
  spawn(cmd, args, { shell: true });
}
