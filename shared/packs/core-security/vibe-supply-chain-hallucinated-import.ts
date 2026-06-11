/**
 * Rule: vibe-supply-chain-hallucinated-import
 *
 * Detects `import`/`require` statements referencing a package that is
 * NOT declared in the project's package.json dependencies. Slopsquatting
 * defence: ~20% of AI-generated code references packages that don't
 * exist on npm, and attackers register the hallucinated names to deliver
 * malware on the next `npm install`.
 *

 * Severity: MAJOR (downgraded from BLOCKER for v1).
 *   The cost of a successful slopsquatting attack is "running attacker
 *   code on every developer machine that ran `npm install`." But v1
 *   doesn't read monorepo workspace package.json files and Vercel-style
 *   examples report 80+ false positives at BLOCKER. MAJOR keeps the
 *   signal visible without gating CI on tutorials. Apps can promote via
 *   .codemorerc.json once they've calibrated against their codebase.
 *   v1.1 will union workspace `package.json` files and re-promote.
 *
 * Detection (no network):
 *   - Reads `package.json` from the project root. Collects the union of
 *     dependencies, devDependencies, peerDependencies, optionalDependencies.
 *   - For each TS/JS file's imports (already collected by ProjectIndex):
 *     - Skip relative paths (`./x`, `../x`, `/abs/x`).
 *     - Skip Node built-ins and the `node:` protocol.
 *     - Resolve the package root: `@scope/pkg/sub/path` -> `@scope/pkg`,
 *       `pkg/sub/path` -> `pkg`.
 *     - If the package root is NOT in the declared dependency set, emit
 *       a finding on the importing file's `import` line.
 *
 * Coverage gap (intentional):
 *   - No npm-registry check. We don't know whether the missing entry is
 *     a hallucination, a forgotten install, or a slopsquatting target
 *     that simply hasn't been registered yet. Either way: the import
 *     will fail at runtime, and any of the three failure modes deserves
 *     a BLOCKER.
 *   - Monorepo workspaces (yarn / pnpm workspaces, npm workspaces) are
 *     resolved by scanning every nested package.json on disk and unioning
 *     their dependency sets — a v1.1 improvement; v1 looks at the scan
 *     root's package.json only.
 *   - TypeScript path aliases (`@/components/...`) appearing in a tsconfig
 *     `paths` map are treated as undeclared by default. Suppress with a
 *     Reason comment in projects that rely on path aliases.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
  'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Runtime-provided modules that are NOT npm packages and aren't node
 * builtins either — they're injected by the hosting environment:
 *
 *   - `vscode`            — VS Code extension API, peer at runtime.
 *   - `bun:*`             — Bun built-ins.
 *   - `deno`, `Deno`, `npm:*`, `jsr:*` — Deno runtime + its package
 *                           protocol shapes.
 *   - `electron`          — Electron API, also runtime-provided.
 *   - `chrome`, `cypress` — test-runner runtime globals (rare but real).
 *
 * Treating them like Node builtins removes a class of false positives
 * specific to editor-extension and Bun/Deno codebases.
 */
const RUNTIME_PROVIDED = new Set([
  'vscode',
  'electron',
  'deno', 'Deno',
  'chrome', 'cypress',
]);

function isRuntimeProvided(spec: string): boolean {
  if (RUNTIME_PROVIDED.has(spec)) return true;
  if (spec.startsWith('bun:')) return true;
  if (spec.startsWith('npm:')) return true;  // Deno
  if (spec.startsWith('jsr:')) return true;  // Deno
  return false;
}

function isRelativeOrAbsolute(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../')
      || spec.startsWith('/') || spec.startsWith('.');
}

/**
 * `@/components`, `@/lib`, `@/utils` etc. — TS path-alias convention used
 * by Next.js / Vite scaffolds. These are NOT npm packages and our v1
 * tsconfig-blind check can't tell them apart from `@scope/pkg`, so we
 * pattern-match: `@/` followed by anything is treated as a path alias.
 *
 * (Real npm scopes are `@<owner>/<pkg>` — the owner is non-empty between
 * the `@` and the `/`.)
 */
function isTsPathAlias(spec: string): boolean {
  return spec.startsWith('@/');
}

function isNodeBuiltin(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  return NODE_BUILTINS.has(spec);
}

function packageRoot(spec: string): string {
  if (spec.startsWith('@')) {
    // `@scope/pkg/sub` -> `@scope/pkg`
    const parts = spec.split('/');
    return parts.slice(0, 2).join('/');
  }
  // `pkg/sub` -> `pkg`
  return spec.split('/')[0];
}

/**
 * Cache the declared-dependency union per project root. The rule's
 * detector runs once per file but the package.json doesn't change
 * during a scan; reading + parsing it once amortises the cost.
 */
const declaredDepsCache = new Map<string, Set<string> | null>();

function collectDepsFromManifest(manifestPath: string, into: Set<string>): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const obj = parsed[key];
    if (obj && typeof obj === 'object') {
      for (const dep of Object.keys(obj as Record<string, unknown>)) into.add(dep);
    }
  }
  return true;
}

/**
 * Discover every `package.json` reachable from the root (skipping
 * `node_modules` / `.git` / build-output dirs) and union their declared
 * dependency sets. This is the v1.1-promised workspace expansion —
 * shipped early because the rule was producing FPs on this repo's own
 * `web/` Next.js subfolder, and the same shape (Next.js / Vite app
 * inside a tooling repo) is common in vibe-coded projects.
 */
function discoverWorkspaceManifests(rootAbs: string): string[] {
  const out: string[] = [];
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.vscode-test', '.samples-cache']);
  const MAX_DEPTH = 4;          // monorepos rarely nest deeper than this
  const MAX_MANIFESTS = 64;     // safety cap
  const recur = (dir: string, depth: number) => {
    if (out.length >= MAX_MANIFESTS) return;
    if (depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name === 'package.json') out.push(path.join(dir, e.name));
      else if (e.isDirectory() && !SKIP.has(e.name)) recur(path.join(dir, e.name), depth + 1);
    }
  };
  recur(rootAbs, 0);
  return out;
}

function getDeclaredDeps(rootAbs: string): Set<string> | null {
  if (declaredDepsCache.has(rootAbs)) return declaredDepsCache.get(rootAbs)!;
  const manifests = discoverWorkspaceManifests(rootAbs);
  if (manifests.length === 0) {
    declaredDepsCache.set(rootAbs, null);
    return null;
  }
  const set = new Set<string>();
  for (const m of manifests) collectDepsFromManifest(m, set);
  declaredDepsCache.set(rootAbs, set);
  return set;
}

interface ImportHit {
  line: number;
  column: number;
  spec: string;
  pkg: string;
}

function findImports(sf: ts.SourceFile): ImportHit[] {
  const out: ImportHit[] = [];
  const pushSpec = (lit: ts.StringLiteralLike, parentForLocation: ts.Node) => {
    const text = lit.text;
    if (!text || isRelativeOrAbsolute(text) || isNodeBuiltin(text)
        || isTsPathAlias(text) || isRuntimeProvided(text)) return;
    const pkg = packageRoot(text);
    const start = parentForLocation.getStart(sf);
    const lc = sf.getLineAndCharacterOfPosition(start);
    out.push({ line: lc.line + 1, column: lc.character + 1, spec: text, pkg });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteralLike(n.moduleSpecifier)) {
      pushSpec(n.moduleSpecifier, n);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) {
      pushSpec(n.moduleSpecifier, n);
    } else if (ts.isImportEqualsDeclaration(n)
            && n.moduleReference
            && ts.isExternalModuleReference(n.moduleReference)
            && n.moduleReference.expression
            && ts.isStringLiteralLike(n.moduleReference.expression)) {
      pushSpec(n.moduleReference.expression, n);
    } else if (ts.isCallExpression(n)
            && ts.isIdentifier(n.expression)
            && n.expression.text === 'require'
            && n.arguments.length === 1
            && ts.isStringLiteralLike(n.arguments[0])) {
      pushSpec(n.arguments[0] as ts.StringLiteralLike, n);
    } else if (ts.isCallExpression(n)
            && n.expression.kind === ts.SyntaxKind.ImportKeyword
            && n.arguments.length === 1
            && ts.isStringLiteralLike(n.arguments[0])) {
      pushSpec(n.arguments[0] as ts.StringLiteralLike, n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export const vibeSupplyChainHallucinatedImport: Rule = {
  id: 'vibe-supply-chain-hallucinated-import',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.85,
  title: 'Imports a package not declared in package.json (slopsquatting risk)',
  whyItMatters:
    'About 20% of AI-generated code references packages that do not exist on npm. Attackers ' +
    'register the hallucinated names so the next `npm install` pulls down their malware. An ' +
    '`import` of a package not declared in your package.json is the canonical pre-install ' +
    'signal — it will either fail at runtime (forgotten install) OR succeed in delivering ' +
    'attacker code (slopsquatting). Either case deserves a BLOCKER before merge.',
  citation: 'https://codemore.dev/rules/vibe-supply-chain-hallucinated-import',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    if (!ctx.projectIndex) return [];

    const declared = getDeclaredDeps(ctx.projectIndex.root);
    if (!declared) return []; // no package.json → can't reason

    const findings: RuleFinding[] = [];
    for (const hit of findImports(ctx.sourceFile)) {
      if (declared.has(hit.pkg)) continue;
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `undeclared-import-${hit.pkg}`,
        },
        whyItMatters:
          `\`${hit.spec}\` is imported here but the package root \`${hit.pkg}\` is not declared in ` +
          `the project's package.json (dependencies / devDependencies / peer / optional). One of: ` +
          `(a) the AI hallucinated the name and an attacker may register it on npm → slopsquatting; ` +
          `(b) a real package needs to be added to dependencies; (c) the name was renamed but the ` +
          `import wasn't updated.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Decide which case applies BEFORE running \`npm install\`:\n\n` +
            `  (a) HALLUCINATION — delete the import. Replace the usage with the standard library ` +
            `or a package that actually exists. Do NOT \`npm install ${hit.pkg}\` to "make the ` +
            `error go away" — that's exactly the slopsquatting trap.\n\n` +
            `  (b) FORGOTTEN INSTALL — add \`${hit.pkg}\` to dependencies, install, and verify the ` +
            `npm metadata: publisher matches a known maintainer, weekly downloads > 1k, the repo ` +
            `URL resolves to an active project.\n\n` +
            `  (c) RENAME — update the import to the correct package name.\n\n` +
            `If your project uses path aliases (tsconfig \`paths\`, vite \`resolve.alias\`) and ` +
            `\`${hit.pkg}\` is one of them, suppress with a Reason comment — v1 doesn't read ` +
            `path-alias config.`,
          verificationCriteria: [
            `\`${hit.pkg}\` is either removed from the import OR added to package.json (with ` +
            `verified npm metadata)`,
            'Re-scan reports vibe-supply-chain-hallucinated-import resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
