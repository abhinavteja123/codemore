/**
 * `codemore mcp` — the discoverable, user-friendly entry point for wiring
 * CodeMore into an MCP client. `codemore serve-mcp` (see ./serve-mcp.ts) is
 * the actual stdio transport command these configs point at; this command
 * never talks MCP itself, it only prints or writes config.
 *
 * `codemore mcp`                          Print a copy-paste snippet + every
 *                                          known client's config path.
 * `codemore mcp install --client <name>`  For clients we can safely automate
 *                                          (cursor, claude-desktop): read the
 *                                          existing config (if any), merge in
 *                                          a "codemore" entry under
 *                                          mcpServers, back up the original,
 *                                          and write. For clients whose config
 *                                          format/location we don't have a
 *                                          confident source for, print the
 *                                          documented setup command instead
 *                                          of guessing at a file path.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { color } from '../colors';

const MCP_ENTRY = { command: 'npx', args: ['-y', 'codemore@latest', 'serve-mcp'] } as const;

interface McpArgs {
  install: boolean;
  client?: string;
  dryRun: boolean;
}

export function parseMcpArgs(argv: string[]): McpArgs {
  let install = false;
  let client: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'install') install = true;
    else if (arg === '--client') client = argv[++i];
    else if (arg === '--dry-run') dryRun = true;
    else throw new Error(`codemore mcp: unknown argument "${arg}"`);
  }
  return { install, client, dryRun };
}

function claudeDesktopConfigPath(): string | null {
  const plat = process.platform;
  if (plat === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (plat === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return null; // No official Linux build as of this writing.
}

function cursorConfigPath(): string {
  return path.join(os.homedir(), '.cursor', 'mcp.json');
}

/** Clients we're confident enough about to write files for directly. */
const AUTOMATABLE: Record<string, () => string | null> = {
  cursor: cursorConfigPath,
  'claude-desktop': claudeDesktopConfigPath,
};

/** Clients with a documented setup command instead — safer than guessing a config path/schema. */
const MANUAL_COMMAND: Record<string, string> = {
  'claude-code': 'claude mcp add codemore -- npx -y codemore@latest serve-mcp',
  codex: 'codex mcp add codemore -- npx -y codemore@latest serve-mcp',
};

function printSnippet(): void {
  const snippet = JSON.stringify({ mcpServers: { codemore: MCP_ENTRY } }, null, 2);
  process.stdout.write(
    `${color.bold('CodeMore MCP server')}\n\n` +
    `Paste this into your client's MCP config:\n\n${snippet}\n\n` +
    `Config file locations:\n` +
    `  Cursor          ${cursorConfigPath()}\n` +
    `  Claude Desktop  ${claudeDesktopConfigPath() ?? '(no official Linux build yet)'}\n` +
    `  Claude Code     run: ${MANUAL_COMMAND['claude-code']}\n` +
    `  Codex CLI       run: ${MANUAL_COMMAND['codex']}\n\n` +
    `Or let CodeMore do it for you (Cursor / Claude Desktop only):\n` +
    `  codemore mcp install --client cursor\n` +
    `  codemore mcp install --client claude-desktop\n`,
  );
}

function readJsonIfExists(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`existing config at ${file} is not valid JSON: ${(err as Error).message}`);
  }
}

function installFor(client: string, dryRun: boolean): number {
  const manual = MANUAL_COMMAND[client];
  if (manual) {
    process.stderr.write(
      `codemore mcp: no safe auto-install for "${client}" (config format/location isn't one we're confident about).\n` +
      `Run this instead:\n\n  ${manual}\n\n`,
    );
    return 0;
  }

  const pathFn = AUTOMATABLE[client];
  if (!pathFn) {
    process.stderr.write(
      `codemore mcp: unknown --client "${client}". Known: ${[...Object.keys(AUTOMATABLE), ...Object.keys(MANUAL_COMMAND)].join(', ')}\n`,
    );
    return 2;
  }
  const configPath = pathFn();
  if (!configPath) {
    process.stderr.write(`codemore mcp: no known config path for "${client}" on ${process.platform}.\n`);
    return 2;
  }

  const config = readJsonIfExists(configPath);
  const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
  mcpServers.codemore = MCP_ENTRY;
  config.mcpServers = mcpServers;
  const out = JSON.stringify(config, null, 2) + '\n';

  if (dryRun) {
    process.stdout.write(`Would write ${configPath}:\n\n${out}`);
    return 0;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, `${configPath}.bak`);
    process.stderr.write(`codemore mcp: backed up existing config to ${configPath}.bak\n`);
  }
  fs.writeFileSync(configPath, out);
  process.stderr.write(`${color.bold('codemore mcp:')} wrote ${configPath}\n`);
  return 0;
}

export async function runMcp(argv: string[]): Promise<number> {
  const args = parseMcpArgs(argv);
  if (!args.install) {
    printSnippet();
    return 0;
  }
  if (!args.client) {
    process.stderr.write('codemore mcp install: --client <name> is required. See `codemore mcp` for the list.\n');
    return 2;
  }
  return installFor(args.client, args.dryRun);
}
