/**
 * `codemore serve-mcp` — launch the MCP server over stdio.
 *
 * Agents (Claude Code, Cursor, Codex, …) register CodeMore as an MCP
 * server by pointing at this command. The server runs until stdin closes.
 *
 * Example .cursor/mcp.json entry:
 *   {
 *     "mcpServers": {
 *       "codemore": { "command": "npx", "args": ["codemore", "serve-mcp"] }
 *     }
 *   }
 */

import { runMcpServer } from '../../mcp/server';

export async function runServeMcp(_argv: string[]): Promise<number> {
  // Important: NEVER write to stdout in this command. Stdout is the MCP
  // transport channel and any non-protocol bytes corrupt the framing.
  // Log to stderr only.
  process.stderr.write('codemore: MCP server listening on stdio\n');
  try {
    await runMcpServer();
    return 0;
  } catch (err) {
    process.stderr.write(`codemore: MCP server error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
