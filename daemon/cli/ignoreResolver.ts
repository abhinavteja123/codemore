/* codemore-ignore-file: core-quality-empty-catch */
/**
 * Ignore Resolver — single source of truth for "should this path be scanned?".
 *
 * Layered sources (later layers override earlier when they re-include):
 *   1. Universal defaults — node_modules, .git, .next, dist, build, …
 *   2. The scan-root's `.gitignore` (recursively — gitignore semantics)
 *   3. Every `tsconfig*.json` at the root: compilerOptions.outDir / outFile
 *   4. `.codemorerc.json` `ignore` field (project-local user overrides)
 *
 * Returns an `IgnoreResolver` that tests paths via the `ignore` npm package,
 * which implements full gitignore syntax (negation, glob, etc.).
 *
 * This module is intentionally I/O-only at construction time: walk-time
 * calls go through the pre-built `ignore` instance, which is O(1) per path
 * after setup. No re-reading of .gitignore mid-scan.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ignore = require('ignore');

/** Hardcoded patterns that apply to every project regardless of .gitignore. */
const UNIVERSAL_PATTERNS: ReadonlyArray<string> = [
  'node_modules/',
  '.git/',
  '.next/',
  '.svelte-kit/',
  '.turbo/',
  '.cache/',
  '.vscode/',
  '.idea/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  'target/',
  // CodeMore-internal — corpus dir + samples cache must always be skipped
  // even when not in .gitignore (e.g. a downstream consumer copies our repo).
  // The validator script passes the corpus subdir as an explicit root which
  // bypasses these ignores.
  'corpus/',
  '.samples-cache/',
];

export interface IgnoreResolverOptions {
  /** Extra patterns to add (e.g. from .codemorerc.json's ignore field). */
  extraPatterns?: ReadonlyArray<string>;
  /** If false, skip reading .gitignore. Useful for tests. Default true. */
  readGitignore?: boolean;
  /** If false, skip reading tsconfig outDir. Default true. */
  readTsconfig?: boolean;
}

export interface IgnoreResolver {
  /** True iff the given workspace-relative path should be SKIPPED. */
  shouldIgnore(relPath: string, kind: 'file' | 'dir'): boolean;
  /** Debug: list every pattern source that contributed. */
  describe(): string;
}

function readFileOrEmpty(p: string): string {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function findTsconfigOutputs(root: string): string[] {
  const found: string[] = [];
  let entries: string[] = [];
  try { entries = fs.readdirSync(root); } catch { return found; }
  for (const name of entries) {
    if (!/^tsconfig(?:[.-][\w.-]+)?\.json$/.test(name)) continue;
    const full = path.join(root, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      // tsconfig allows comments — try a tolerant parser. Fallback: strip
      // common comment forms and re-try.
      let raw = fs.readFileSync(full, 'utf8');
      let parsed: { compilerOptions?: { outDir?: string; outFile?: string } } | null = null;
      try { parsed = JSON.parse(raw); } catch {
        const stripped = raw
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1')   // line comments (not inside URLs)
          .replace(/,(\s*[}\]])/g, '$1');         // trailing commas
        try { parsed = JSON.parse(stripped); } catch { parsed = null; }
      }
      const co = parsed?.compilerOptions;
      if (co?.outDir) {
        // Normalise the outDir to be relative to root with trailing slash —
        // matches gitignore directory semantics.
        const norm = co.outDir.replace(/^\.\//, '').replace(/\/$/, '');
        if (norm && norm !== '.') found.push(norm + '/');
      }
      if (co?.outFile) {
        const norm = co.outFile.replace(/^\.\//, '');
        if (norm) found.push(norm);
      }
    } catch { /* skip */ }
  }
  return found;
}

export function createIgnoreResolver(root: string, opts: IgnoreResolverOptions = {}): IgnoreResolver {
  const rootAbs = path.resolve(root);
  const ig = ignore();
  const sources: string[] = [];

  ig.add(UNIVERSAL_PATTERNS as string[]);
  sources.push(`universal defaults (${UNIVERSAL_PATTERNS.length} patterns)`);

  if (opts.readGitignore !== false) {
    const gitignore = readFileOrEmpty(path.join(rootAbs, '.gitignore'));
    if (gitignore) {
      ig.add(gitignore);
      sources.push(`${rootAbs}/.gitignore`);
    }
  }

  if (opts.readTsconfig !== false) {
    const tsouts = findTsconfigOutputs(rootAbs);
    if (tsouts.length > 0) {
      ig.add(tsouts);
      sources.push(`tsconfig outDir/outFile (${tsouts.length} entries): ${tsouts.join(', ')}`);
    }
  }

  if (opts.extraPatterns && opts.extraPatterns.length > 0) {
    ig.add(opts.extraPatterns as string[]);
    sources.push(`.codemorerc.json ignore (${opts.extraPatterns.length} patterns)`);
  }

  return {
    shouldIgnore(relPath, kind): boolean {
      // `ignore` package uses POSIX paths.
      const normalised = relPath.replace(/\\/g, '/');
      // The `ignores()` API doesn't take a kind hint directly, but a trailing
      // slash on dirs lets it match `name/` patterns correctly.
      const probe = kind === 'dir' && !normalised.endsWith('/') ? normalised + '/' : normalised;
      return ig.ignores(probe);
    },
    describe(): string {
      return sources.join('\n  + ');
    },
  };
}
