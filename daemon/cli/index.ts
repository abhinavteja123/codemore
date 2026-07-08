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
import { runMcp } from './commands/mcp';
import { runBaseline } from './commands/baseline';
import { runFix } from './commands/fix';
import { toolVersion } from '../../shared/toolVersion';
import { color } from './colors';
import { runInteractiveMenu, isInteractiveTty } from './interactiveMenu';

const VERSION = toolVersion();

function printQuickstart(): void {
  process.stdout.write(
    `${color.bold('CodeMore')} ${VERSION} — the static analyzer your AI agent reads\n\n` +
    `  ${color.bold('npx codemore scan .')}         Scan the current project\n` +
    `  ${color.bold('codemore mcp')}                 Wire CodeMore into Cursor / Claude / Codex\n` +
    `  ${color.bold('codemore scan . --json')}       Full report as JSON (for agents/CI)\n\n` +
    `  ${color.gray('codemore --help')}              Full command & flag reference\n`,
  );
}

function printUsage(): void {
  process.stdout.write(
    `codemore ${VERSION}\n\n` +
    `Usage:\n` +
    `  codemore scan <path> [flags]\n` +
    `  codemore baseline <create|update|drop|show> [path]\n` +
    `  codemore fix [path] [--rule <id>] [--all] [--write] [--max-attempts N]\n` +
    `  codemore mcp [install --client <cursor|claude-desktop|claude-code|codex>]\n` +
    `  codemore serve-mcp\n\n` +
    `Flags (fix):\n` +
    `  --rule <id>                  Only fix findings of this rule.\n` +
    `  --all                        Fix every finding (default: just the most severe one).\n` +
    `  --write                      Patch files in place (backs up to .bak). Default: write .codemore-fix sidecars.\n` +
    `  --max-attempts <n>           Generator/validator retries per finding (default 3).\n` +
    `  Requires ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.\n\n` +
    `Flags (scan):\n` +
    `  --json                       Emit the full report as JSON on stdout.\n` +
    `  --format <json|sarif>        Machine-output format for --json/--out. SARIF uploads to GitHub code scanning.\n` +
    `  --out <file>                 Also write the report to <file> (in --format).\n` +
    `  --fail-on <severity>         Exit non-zero if any issue >= severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO).\n` +
    `  --baseline <file>            Compare against a baseline; only NEW issues count toward --fail-on.\n` +
    `  --packs <a,b,...>            Run only these packs (default: all).\n` +
    `  --enable-experimental        Include rules with lifecycle: experimental.\n` +
    `  --framework <name>           Hint a framework (repeatable; comma-separated).\n` +
    `  --external-tools <list|all>  Run external linters and merge their findings (e.g. ruff,biome,golangci,clippy).\n` +
    `  --telemetry / --no-telemetry Opt in/out of sending an anonymous, hashed scan ping to codemore.tech.\n` +
    `  --verbose                    Print external-tool diagnostics (skipped tools, parse errors) to stderr.\n` +
    `  --respect-gitignore-fully    Honor .gitignore even for secret-shaped files (.env*, *.pem,\n` +
    `                                firebase-adminsdk*.json, …). Default: those files are scanned\n` +
    `                                even when gitignored, since devs often hide leaked secrets there.\n\n` +
    `  --help, -h                   Show this help.\n` +
    `  --version, -v                Show CLI version.\n`,
  );
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0) {
    if (!isInteractiveTty()) {
      printQuickstart();
      return 0;
    }
    const result = await runInteractiveMenu();
    if (result === -1) {
      printUsage();
      return 0;
    }
    return result;
  }
  if (args[0] === '--help' || args[0] === '-h') {
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
      case 'fix':
        return await runFix(rest);
      case 'mcp':
        return await runMcp(rest);
      case 'serve-mcp':
        return await runServeMcp(rest);
      default:
        process.stderr.write(color.red(`codemore: unknown command "${cmd}". See --help.\n`));
        return 2;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(color.red(`codemore: ${msg}\n`));
    return 2;
  }
}

// Run when executed directly. Imported usages must call main() explicitly.
if (require.main === module) {
  main(process.argv).then(code => process.exit(code));
}

export { main };
