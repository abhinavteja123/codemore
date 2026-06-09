/**
 * `codemore baseline …` — manage the per-project baseline file.
 *
 * Subcommands:
 *   create [--out file] [--enable-experimental] [--packs a,b]
 *     Scan the project and write a baseline file (default:
 *     ./.codemore-baseline.json). Refuses to overwrite by default.
 *
 *   update [--out file] [--enable-experimental] [--packs a,b]
 *     Same as `create`, but allows overwriting an existing file. Use
 *     this after a known-good cleanup to "ratchet" the baseline forward.
 *
 *   drop [--file file]
 *     Delete the baseline file. Confirms in human mode; no confirmation
 *     when --yes is given.
 *
 *   show [--file file]
 *     Print baseline summary to stderr (counts by rule + total keys).
 *
 * The baseline file format is defined by `baselineDiff.BaselineFileV1`.
 */

import * as fs from 'fs';
import * as path from 'path';

import { registerAllPacks } from '../registerPacks';
import { scanProject } from '../projectScanner';
import { buildBaseline, isBaselineFile, type BaselineFileV1 } from '../baselineDiff';

const DEFAULT_BASELINE_FILE = '.codemore-baseline.json';

interface BaselineCreateArgs {
  path: string;
  out: string;
  enableExperimental: boolean;
  packs?: string[];
  frameworks: string[];
  /** Allow overwriting an existing baseline (true for `update`). */
  allowOverwrite: boolean;
}

interface BaselineDropArgs {
  file: string;
  yes: boolean;
}

interface BaselineShowArgs {
  file: string;
}

function consume<T>(arr: string[], i: { v: number }, name: string, fallback?: T): string {
  const v = arr[i.v + 1];
  if (v === undefined || v.startsWith('--')) {
    if (fallback !== undefined) return String(fallback);
    throw new Error(`${name} expects a value`);
  }
  i.v++;
  return v;
}

function parseCreateUpdateArgs(argv: string[], allowOverwrite: boolean): BaselineCreateArgs {
  let positional: string | undefined;
  let out: string | undefined;
  let enableExperimental = false;
  let packs: string[] | undefined;
  const frameworks: string[] = [];

  const i = { v: 0 };
  for (; i.v < argv.length; i.v++) {
    const arg = argv[i.v];
    switch (arg) {
      case '--out': out = consume(argv, i, '--out'); break;
      case '--enable-experimental': enableExperimental = true; break;
      case '--packs': packs = consume(argv, i, '--packs').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--framework': {
        const v = consume(argv, i, '--framework');
        for (const f of v.split(',').map(s => s.trim())) if (f) frameworks.push(f);
        break;
      }
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
        if (positional) throw new Error(`Unexpected positional: ${arg}`);
        positional = arg;
    }
  }

  const projectPath = positional ?? '.';
  return {
    path: projectPath,
    out: out ?? path.join(projectPath, DEFAULT_BASELINE_FILE),
    enableExperimental,
    packs,
    frameworks,
    allowOverwrite,
  };
}

function parseDropArgs(argv: string[]): BaselineDropArgs {
  let file = DEFAULT_BASELINE_FILE;
  let yes = false;
  const i = { v: 0 };
  for (; i.v < argv.length; i.v++) {
    const arg = argv[i.v];
    switch (arg) {
      case '--file': file = consume(argv, i, '--file'); break;
      case '--yes': case '-y': yes = true; break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
        file = arg;
    }
  }
  return { file: path.resolve(file), yes };
}

function parseShowArgs(argv: string[]): BaselineShowArgs {
  let file = DEFAULT_BASELINE_FILE;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') { file = argv[++i] ?? file; continue; }
    if (!arg.startsWith('--')) file = arg;
  }
  return { file: path.resolve(file) };
}

async function runCreateOrUpdate(args: BaselineCreateArgs, label: 'create' | 'update'): Promise<number> {
  registerAllPacks();
  const rootAbs = path.resolve(args.path);
  if (!fs.existsSync(rootAbs)) {
    process.stderr.write(`codemore: path not found: ${rootAbs}\n`);
    return 2;
  }
  const outAbs = path.resolve(args.out);
  if (fs.existsSync(outAbs) && !args.allowOverwrite) {
    process.stderr.write(
      `codemore: baseline already exists at ${outAbs}.\n` +
      `Use \`codemore baseline update\` (or pass --out to a different file) to overwrite.\n`,
    );
    return 1;
  }

  process.stderr.write(`Scanning ${rootAbs} to build baseline...\n`);
  const report = await scanProject({
    root: rootAbs,
    enabledPacks: args.packs,
    enableExperimental: args.enableExperimental,
    frameworks: args.frameworks,
  });
  const baseline = buildBaseline(report);
  fs.writeFileSync(outAbs, JSON.stringify(baseline, null, 2));

  process.stderr.write(
    `Baseline ${label === 'update' ? 'updated' : 'created'}: ${outAbs}\n` +
    `  total keys: ${baseline.summary.totalKeys}\n` +
    `  rules:      ${Object.keys(baseline.summary.byRule).length}\n\n` +
    `Next steps:\n` +
    `  - Commit this file to git so CI uses the same gate.\n` +
    `  - Run \`codemore scan ${args.path} --baseline ${path.relative(process.cwd(), outAbs) || outAbs} --fail-on BLOCKER\`\n`,
  );
  return 0;
}

function runDrop(args: BaselineDropArgs): number {
  if (!fs.existsSync(args.file)) {
    process.stderr.write(`codemore: no baseline file at ${args.file}\n`);
    return 1;
  }
  fs.unlinkSync(args.file);
  process.stderr.write(`Baseline removed: ${args.file}\n`);
  return 0;
}

function runShow(args: BaselineShowArgs): number {
  if (!fs.existsSync(args.file)) {
    process.stderr.write(`codemore: no baseline file at ${args.file}\n`);
    return 1;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(args.file, 'utf8')); }
  catch (err) { process.stderr.write(`codemore: ${args.file} is not valid JSON\n`); return 2; }
  if (!isBaselineFile(parsed)) {
    process.stderr.write(`codemore: ${args.file} is not a valid CodeMore baseline file\n`);
    return 2;
  }
  const b = parsed as BaselineFileV1;
  process.stderr.write(
    `Baseline: ${args.file}\n` +
    `  created:    ${b.createdAt}\n` +
    `  schema:     ${b.schemaVersion}\n` +
    `  total keys: ${b.summary.totalKeys}\n` +
    `  by rule:\n`,
  );
  const rules = Object.entries(b.summary.byRule).sort((a, b) => b[1] - a[1]);
  for (const [rule, n] of rules) {
    process.stderr.write(`    ${String(n).padStart(4)}  ${rule}\n`);
  }
  return 0;
}

// Reason: CLI dispatcher signature. All `run<Cmd>` siblings return Promise<number>;
// some branches genuinely await scans, the trivial subcommands (drop/show) don't.
// codemore-ignore-next-line: core-quality-async-without-await
export async function runBaseline(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case 'create': return runCreateOrUpdate(parseCreateUpdateArgs(rest, /* allowOverwrite */ false), 'create');
    case 'update': return runCreateOrUpdate(parseCreateUpdateArgs(rest, /* allowOverwrite */ true), 'update');
    case 'drop':   return runDrop(parseDropArgs(rest));
    case 'show':   return runShow(parseShowArgs(rest));
    case undefined:
    case '--help':
    case '-h':
      process.stdout.write(
        `codemore baseline <subcommand>\n\n` +
        `Subcommands:\n` +
        `  create [path]   Scan and write a new baseline (.codemore-baseline.json)\n` +
        `  update [path]   Re-scan and overwrite an existing baseline (ratchet)\n` +
        `  drop            Delete the baseline file\n` +
        `  show            Show baseline summary (counts by rule)\n\n` +
        `Flags (create/update):\n` +
        `  --out <file>                 Write to a custom path (default ./.codemore-baseline.json)\n` +
        `  --packs <a,b,...>            Limit to these packs\n` +
        `  --enable-experimental        Include experimental rules in the baseline\n` +
        `  --framework <name>           Hint a framework (repeatable)\n`,
      );
      return 0;
    default:
      process.stderr.write(`codemore baseline: unknown subcommand "${sub}". See \`codemore baseline --help\`.\n`);
      return 2;
  }
}
