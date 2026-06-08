/* codemore-ignore-file: core-quality-empty-catch */
/**
 * Resolve the CodeMore tool version from package.json at runtime.
 *
 * Used by the report's `tool.version` field, the MCP server's
 * `McpServer({version})` constructor, and `codemore --version`.
 * Walks up from the calling module's directory looking for a
 * `package.json` whose name is `codemore`. Returns '0.0.0' if not
 * found (a sentinel that surfaces in reports if the lookup fails).
 *
 * Single source of truth: bumping the version in package.json
 * automatically propagates everywhere.
 */

import * as fs from 'fs';
import * as path from 'path';

let cached: string | null = null;

export function toolVersion(): string {
  if (cached !== null) return cached;
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === 'codemore' && typeof pkg.version === 'string') {
          cached = pkg.version;
          return cached;
        }
      } catch { /* keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cached = '0.0.0';
  return cached;
}
