/**
 * `codemore` with no args, run from a real terminal — an interactive menu
 * instead of a static quickstart dump. Delegates to the exact same
 * argv-parsing command functions the flag-based CLI uses (runScan/runMcp/
 * runBaseline), so there is exactly one implementation of each command's
 * behavior; this file only turns menu choices into argv arrays.
 *
 * Gated on BOTH stdin and stdout being a TTY (see runInteractive below) —
 * `prompts` reads raw keystrokes from stdin, and a piped/CI/agent-spawned
 * process must never block waiting on input. `codemore` is "the analyzer
 * your AI agent reads"; a hang here would break that invariant. Any
 * non-interactive context falls back to the static printQuickstart().
 */

import prompts from 'prompts';

import { runScan, parseScanArgs } from './commands/scan';
import { runMcp } from './commands/mcp';
import { runBaseline } from './commands/baseline';
import { color } from './colors';

export function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}

const CANCELLED = Symbol('cancelled');

/** prompts() resolves to {} (not undefined) on Ctrl-C/ESC; onCancel raises CANCELLED so callers short-circuit instead of reading properties off an empty answer. */
async function ask<T extends Record<string, unknown>>(questions: prompts.PromptObject | prompts.PromptObject[]): Promise<T | typeof CANCELLED> {
  let cancelled = false;
  const answers = await prompts(questions, { onCancel: () => { cancelled = true; return false; } });
  return cancelled ? CANCELLED : (answers as T);
}

async function menuScan(): Promise<number> {
  const answers = await ask<{ path: string; failOn: string }>([
    { type: 'text', name: 'path', message: 'Path to scan', initial: '.' },
    {
      type: 'select',
      name: 'failOn',
      message: 'Fail on severity (for CI use; pick "none" for a plain look)',
      choices: [
        { title: 'none', value: '' },
        { title: 'BLOCKER', value: 'BLOCKER' },
        { title: 'CRITICAL', value: 'CRITICAL' },
        { title: 'MAJOR', value: 'MAJOR' },
      ],
      initial: 0,
    },
  ]);
  if (answers === CANCELLED) return 0;

  const argv = [answers.path];
  if (answers.failOn) argv.push('--fail-on', answers.failOn);
  return runScan(parseScanArgs(argv));
}

async function menuMcp(): Promise<number> {
  const answers = await ask<{ client: string }>({
    type: 'select',
    name: 'client',
    message: 'Wire CodeMore into which client?',
    choices: [
      { title: 'Just show me the config snippet', value: '' },
      { title: 'Cursor (auto-install)', value: 'cursor' },
      { title: 'Claude Desktop (auto-install)', value: 'claude-desktop' },
      { title: 'Claude Code (prints setup command)', value: 'claude-code' },
      { title: 'Codex CLI (prints setup command)', value: 'codex' },
    ],
  });
  if (answers === CANCELLED) return 0;

  return runMcp(answers.client ? ['install', '--client', answers.client] : []);
}

async function menuBaseline(): Promise<number> {
  const answers = await ask<{ action: string }>({
    type: 'select',
    name: 'action',
    message: 'Baseline action',
    choices: [
      { title: 'create — first baseline for this project', value: 'create' },
      { title: 'update — ratchet forward after a cleanup', value: 'update' },
      { title: 'show — print current baseline summary', value: 'show' },
      { title: 'drop — delete the baseline file', value: 'drop' },
    ],
  });
  if (answers === CANCELLED) return 0;

  return runBaseline([answers.action]);
}

export async function runInteractiveMenu(): Promise<number> {
  process.stdout.write(`${color.bold('CodeMore')} — pick an action (↑/↓, enter; Ctrl-C to quit)\n\n`);

  const answers = await ask<{ action: string }>({
    type: 'select',
    name: 'action',
    message: 'What do you want to do?',
    choices: [
      { title: 'Scan a project', value: 'scan' },
      { title: 'Set up MCP (Cursor / Claude / Codex)', value: 'mcp' },
      { title: 'Manage a baseline', value: 'baseline' },
      { title: 'Show full --help reference', value: 'help' },
      { title: 'Exit', value: 'exit' },
    ],
  });
  if (answers === CANCELLED || answers.action === 'exit') return 0;

  switch (answers.action) {
    case 'scan': return menuScan();
    case 'mcp': return menuMcp();
    case 'baseline': return menuBaseline();
    case 'help': return -1; // sentinel: caller prints full usage
    default: return 0;
  }
}
