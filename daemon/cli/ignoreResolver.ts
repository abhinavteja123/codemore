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
  // ── JS/TS dep + build dirs ───────────────────────────────────────
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
  // ── Python dep + build dirs ──────────────────────────────────────
  // (Part 7 follow-up: shopsec scanned 22K files inside venv/site-packages
  // and reported 22 088 noise findings. These dirs are ALWAYS vendored
  // third-party code — never the user's source — and must always be skipped.)
  'venv/',
  '.venv/',
  'env/',
  '.env-venv/',
  '__pycache__/',
  '.mypy_cache/',
  '.ruff_cache/',
  '.pytest_cache/',
  '.tox/',
  '.eggs/',
  '*.egg-info/',
  'site-packages/',
  // ── AI-assistant tooling dirs — vendored plugin/skill code ───────
  // (Scanning codemore's own repo produced 87 BLOCKER innerhtml findings,
  // ALL inside vendored plugin scripts under .agents/.claude/.github/skills
  // — third-party AI-tool plugin code, not the user's product source. The
  // walker must skip vendored AI-tooling dirs.)
  //
  // .cursor/ and .claude/ ignore only SUBDIRECTORIES ('.cursor/*/'), not
  // the dir itself: their top-level configs (.cursor/mcp.json,
  // .cursor/settings.json, .claude/mcp.json) are scanned by
  // vibe-mcp-config-secret and must keep flowing to the walker. A plain
  // '.cursor/' dir pattern would be pruned by walk() BEFORE the
  // secret-shaped file bypass below could ever see the files inside.
  // Vendored plugin code always lives in subdirs (.claude/skills/…).
  '.claude/*/',
  '.cursor/*/',
  '.agents/',
  '.codex/',
  '.windsurf/',
  '.aider/',
  // Specific on purpose — '.github/' would break vibe-cicd-secret-in-yaml,
  // which scans .github/workflows/.
  '.github/skills/',
  // ── CodeMore-internal — corpus + samples + audit outputs ─────────
  'corpus/',
  '.samples-cache/',
  // The accuracy audit (Part 7) writes per-project triage markdown into
  // this dir; those reports contain redacted-secret snippets that look like
  // BLOCKER findings to the secret-pattern rule. Always skip.
  'triage-results/',
];

export interface IgnoreResolverOptions {
  /** Extra patterns to add (e.g. from .codemorerc.json's ignore field). */
  extraPatterns?: ReadonlyArray<string>;
  /** If false, skip reading .gitignore. Useful for tests. Default true. */
  readGitignore?: boolean;
  /** If false, skip reading tsconfig outDir. Default true. */
  readTsconfig?: boolean;
  /**
   * If true, the secret-shaped filenames allowlist below STAYS HONORED by
   * .gitignore (i.e., users who really want gitignored secret files to be
   * skipped can pass this). Default false — we DO bypass gitignore for
   * known secret-carrier patterns. See Part 7 §11B Fix 1.
   */
  respectGitignoreForSecretFiles?: boolean;
}

/**
 * Filenames that are well-known secret carriers. Developers sometimes add
 * these to `.gitignore` to "hide" a leaked credential, but the file IS still
 * on their disk and STILL gets shipped via tarball / Docker / npm pack /
 * GitHub clone (the .gitignore prevents tracking, not transport). We treat
 * these as ALWAYS scanned so the user gets a BLOCKER finding they can act on.
 *
 * Pattern source: gitleaks default ruleset + GitGuardian's secret-file class.
 *
 * Behaviour: when one of these patterns matches a file the .gitignore would
 * have excluded, we still walk + scan the file. The user can override with
 * `--respect-gitignore-fully` (CLI) or `respectGitignoreForSecretFiles: true`.
 */
const SECRET_SHAPED_FILENAMES: ReadonlyArray<RegExp> = [
  /(?:^|\/)\.env(?:\..+)?$/i,                          // .env, .env.local, .env.production
  /(?:^|\/)[^/]+\.env$/i,                              // secrets.env, prod.env (docker-compose env_file convention)
  /(?:^|\/)[^/]+\.pem$/i,                              // *.pem
  /(?:^|\/)[^/]+\.key$/i,                              // *.key
  /(?:^|\/)[^/]*firebase-adminsdk[^/]*\.json$/i,       // Firebase Admin SDK (the Gen ai case)
  /(?:^|\/)[^/]*firebase-service-account[^/]*\.json$/i, // alt Firebase
  /(?:^|\/)[^/]*service-account[^/]*\.json$/i,         // generic service-account-*.json
  /(?:^|\/)credentials\.json$/i,                       // gcloud / npm / pip credentials
  /(?:^|\/)serviceAccountKey\.json$/i,                 // Firebase quickstart pattern
  /(?:^|\/)[^/]*gcp[-_]credentials[^/]*$/i,            // GCP credential files
  /(?:^|\/)\.npmrc$/i,                                 // npm auth tokens
  /(?:^|\/)\.pypirc$/i,                                // PyPI auth tokens
];

function isSecretShaped(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  for (const re of SECRET_SHAPED_FILENAMES) {
    if (re.test(norm)) {return true;}
  }
  return false;
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
    if (!/^tsconfig(?:[.-][\w.-]+)?\.json$/.test(name)) {continue;}
    const full = path.join(root, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) {continue;}
      // tsconfig allows comments — try a tolerant parser. Fallback: strip
      // common comment forms and re-try.
      const raw = fs.readFileSync(full, 'utf8');
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
        if (norm && norm !== '.') {found.push(norm + '/');}
      }
      if (co?.outFile) {
        const norm = co.outFile.replace(/^\.\//, '');
        if (norm) {found.push(norm);}
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

  const bypassSecretFiles = opts.respectGitignoreForSecretFiles !== true;
  if (bypassSecretFiles) {
    sources.push('secret-shaped filenames bypass .gitignore (.env*, *.pem, *.key, firebase-adminsdk*.json, service-account*.json, credentials.json, serviceAccountKey.json, .npmrc, .pypirc)');
  }

  return {
    shouldIgnore(relPath, kind): boolean {
      // `ignore` package uses POSIX paths.
      const normalised = relPath.replace(/\\/g, '/');
      // The `ignores()` API doesn't take a kind hint directly, but a trailing
      // slash on dirs lets it match `name/` patterns correctly.
      const probe = kind === 'dir' && !normalised.endsWith('/') ? normalised + '/' : normalised;
      const ignored = ig.ignores(probe);
      // Bypass: if it WOULD be ignored AND it's a known secret-shaped file,
      // DON'T ignore it. The user wanted to hide the file from git; we want
      // to surface the BLOCKER finding to them.
      if (ignored && bypassSecretFiles && kind === 'file' && isSecretShaped(normalised)) {
        return false;
      }
      return ignored;
    },
    describe(): string {
      return sources.join('\n  + ');
    },
  };
}
