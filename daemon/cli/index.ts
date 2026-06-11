#!/usr/bin/env node
/**
 * CodeMore CLI entry point.
 *
 * Usage:
 *   codemore scan <path> [--json] [--out file] [--fail-on SEVERITY] [--packs a,b]
 *                         [--enable-experimental] [--framework supabase]
 *   codemore --help
 *   codemore --version
 *
 * Future subcommands (Phase 2+): report, serve-mcp, init, validate-fix.
 */

import { runScan, parseScanArgs } from './commands/scan';
import { runServeMcp } from './commands/serve-mcp';
import { runBaseline } from './commands/baseline';
import { toolVersion } from '../../shared/toolVersion';

const VERSION = toolVersion();

function printUsage(): void {
  process.stdout.write(
    `codemore ${VERSION}\n\n` +
    `Usage:\n` +
    `  codemore scan <path> [flags]\n` +
    `  codemore baseline <create|update|drop|show> [path]\n` +
    `  codemore serve-mcp\n\n` +
    `Flags (scan):\n` +
    `  --json                       Emit the full report as JSON on stdout.\n` +
    `  --out <file>                 Also write the JSON report to <file>.\n` +
    `  --fail-on <severity>         Exit non-zero if any issue >= severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO).\n` +
    `  --baseline <file>            Compare against a baseline; only NEW issues count toward --fail-on.\n` +
    `  --packs <a,b,...>            Run only these packs (default: all).\n` +
    `  --enable-experimental        Include rules with lifecycle: experimental.\n` +
    `  --framework <name>           Hint a framework (repeatable; comma-separated).\n` +
    `  --external-tools <list|all>  Run external linters and merge their findings (e.g. ruff,biome,golangci,clippy).\n` +
    `  --telemetry / --no-telemetry Opt in/out of sending an anonymous, hashed scan ping to codemore.dev.\n` +
    `  --verbose                    Print external-tool diagnostics (skipped tools, parse errors) to stderr.\n\n` +
    `  --help, -h                   Show this help.\n` +
    `  --version, -v                Show CLI version.\n`,
  );
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return 0;
  }
  if (args[0] === '--version' || args[0] === '-v') {
    process.stdout.write(VERSION + '\n');
    return 0;
  }

  const cmd = args[0];
  const rest = args.slice(1);

  try {
    switch (cmd) {
      case 'scan':
        return await runScan(parseScanArgs(rest));
      case 'baseline':
        return await runBaseline(rest);
      case 'serve-mcp':
        return await runServeMcp(rest);
      default:
        process.stderr.write(`codemore: unknown command "${cmd}". See --help.\n`);
        return 2;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`codemore: ${msg}\n`);
    return 2;
  }
}

// Run when executed directly. Imported usages must call main() explicitly.
if (require.main === module) {
  main(process.argv).then(code => process.exit(code));
}

export { main };
