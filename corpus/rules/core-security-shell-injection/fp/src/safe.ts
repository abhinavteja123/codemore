// False-positive fixture for core-security-shell-injection.
// None must fire.

import { execFile, spawn, exec } from 'node:child_process';

// Good: pure string literal — no dynamic content.
export function gitVersion(): string {
  return require('node:child_process').execSync('git --version').toString();
}

// Good: another pure literal.
export function diskUsage(): void {
  exec('df -h', () => {});
}

// Good: execFile with arg array — no shell at all.
export function listRef(ref: string): void {
  execFile('git', ['log', '--format=%H', ref], () => {});
}

// Good: spawn with arg array.
export function ls(target: string): void {
  spawn('ls', ['-la', target]);
}

// A comment mentioning exec(`${...}`) must not trigger.
// Note: never call exec(`${userInput}`) — see SECURITY.md.
export function safe(): void { /* no-op */ }
