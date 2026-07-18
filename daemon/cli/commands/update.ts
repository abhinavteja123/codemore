/**
 * `codemore update` — check npm for a newer release and install it.
 *
 * Global installs (`npm install -g codemore`) pin whatever version was
 * current at install time; `npx codemore@latest` already always runs
 * latest, so this command exists for the global-install case. It shells
 * out to `npm install -g codemore@latest` — the same command a user would
 * type themselves, just discovered + run for them.
 */

import { spawnSync } from 'child_process';

import { toolVersion } from '../../../shared/toolVersion';
import { color } from '../colors';

interface UpdateArgs {
  checkOnly: boolean;
}

export function parseUpdateArgs(argv: string[]): UpdateArgs {
  return { checkOnly: argv.includes('--check') };
}

/** Compares dotted version strings numerically (semver-lite: no pre-release tags). */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://registry.npmjs.org/codemore/latest', { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

export async function runUpdate(argv: string[]): Promise<number> {
  const args = parseUpdateArgs(argv);
  const current = toolVersion();

  process.stderr.write(`codemore: current version ${color.bold(current)}, checking npm...\n`);
  const latest = await fetchLatestVersion();

  if (!latest) {
    process.stderr.write(color.red('codemore: could not reach npm registry. Check your network and try again.\n'));
    return 2;
  }

  if (!isNewer(latest, current)) {
    process.stderr.write(color.green(`codemore: already up to date (${current}).\n`));
    return 0;
  }

  process.stderr.write(`codemore: ${color.bold(latest)} is available (you have ${current}).\n`);

  if (args.checkOnly) {
    process.stderr.write(`Run ${color.bold('codemore update')} to install it.\n`);
    return 0;
  }

  process.stderr.write('Installing codemore@latest globally via npm...\n\n');
  const result = spawnSync('npm', ['install', '-g', 'codemore@latest'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error || result.status !== 0) {
    process.stderr.write(
      color.red('\ncodemore: npm install failed. If you installed with yarn/pnpm, update with that ') +
      color.red('tool instead (e.g. `yarn global add codemore@latest`), or run ') +
      color.red('`npm install -g codemore@latest` yourself.\n'),
    );
    return 1;
  }

  process.stderr.write(color.green(`\ncodemore: updated to ${latest}.\n`));
  return 0;
}
