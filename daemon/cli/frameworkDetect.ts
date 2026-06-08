/**
 * Framework Detector — infers project-type signals from the scan root.
 *
 * Output is a list of normalised framework labels (e.g. 'supabase',
 * 'nextjs', 'react', 'vue', 'sveltekit', 'astro', 'expo', 'clerk',
 * 'nextauth'). Rules with `targetFrameworks` declared run only when
 * `ctx.frameworks` contains at least one matching label.
 *
 * Detection sources, in priority order:
 *   1. `package.json` `dependencies` + `devDependencies` (most reliable)
 *   2. Structural signals on the filesystem — presence of well-known
 *      directories or config files. Lets us classify projects that
 *      don't have a package.json (raw migrations checkouts, etc.)
 *      OR augment a partial package.json (e.g. a project that hasn't
 *      installed @supabase/supabase-js yet but already has
 *      supabase/migrations/).
 *
 * The detector is intentionally tolerant: if package.json is missing
 * or invalid, we fall back to structural signals. Returns [] only when
 * nothing matches.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FrameworkDetectOptions {
  /** Disable package.json read (tests). */
  readPackageJson?: boolean;
  /** Disable filesystem signals (tests). */
  readFilesystem?: boolean;
}

/** Map dep-name patterns to framework labels. Order = preference. */
const DEP_PATTERNS: ReadonlyArray<{ test: RegExp; framework: string }> = [
  // Backends / infra
  { test: /^@supabase\/(supabase-js|auth-helpers-|ssr$)/, framework: 'supabase' },
  { test: /^supabase$/,                                   framework: 'supabase' },
  { test: /^drizzle-orm$/,                                framework: 'drizzle' },
  { test: /^@prisma\/client$/,                            framework: 'prisma' },

  // Frontend frameworks
  { test: /^next$/,                                       framework: 'nextjs' },
  { test: /^@sveltejs\/kit$/,                             framework: 'sveltekit' },
  { test: /^astro$/,                                      framework: 'astro' },
  { test: /^nuxt$/,                                       framework: 'nuxt' },
  { test: /^remix$/,                                      framework: 'remix' },
  { test: /^@remix-run\//,                                framework: 'remix' },
  { test: /^expo$/,                                       framework: 'expo' },
  { test: /^react-native$/,                               framework: 'react-native' },
  { test: /^vite$/,                                       framework: 'vite' },

  // UI libs (these can also imply a framework)
  { test: /^react$/,                                      framework: 'react' },
  { test: /^vue$/,                                        framework: 'vue' },
  { test: /^@vue\//,                                      framework: 'vue' },
  { test: /^svelte$/,                                     framework: 'svelte' },
  { test: /^solid-js$/,                                   framework: 'solid' },

  // Auth / agent configs
  { test: /^@clerk\/(nextjs|sdk-node)$/,                  framework: 'clerk' },
  { test: /^next-auth$/,                                  framework: 'nextauth' },
  { test: /^@auth\//,                                     framework: 'nextauth' },
  { test: /^@modelcontextprotocol\/sdk$/,                 framework: 'mcp' },
];

function readPackageJsonFromRoot(rootAbs: string): Record<string, unknown> | null {
  const p = path.join(rootAbs, 'package.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function dirExists(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function fileExists(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function frameworksFromDeps(deps: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  for (const name of Object.keys(deps)) {
    for (const { test, framework } of DEP_PATTERNS) {
      if (test.test(name)) found.add(framework);
    }
  }
  // Heuristic: a project with `next` is `nextjs` (not also `react` — we
  // emit only `nextjs` to avoid `vibe-xss-dangerously-set` firing twice
  // via two matching framework gates). Same for `nuxt` → not `vue`.
  // If `nextjs` is present, drop the bare `react` label.
  if (found.has('nextjs')) found.delete('react');
  if (found.has('nuxt'))   found.delete('vue');
  if (found.has('sveltekit')) found.delete('svelte');
  return found;
}

function frameworksFromFilesystem(rootAbs: string): Set<string> {
  const found = new Set<string>();
  // Supabase: a `supabase/` dir with migrations is a strong signal even
  // without @supabase/supabase-js installed yet.
  if (dirExists(path.join(rootAbs, 'supabase', 'migrations'))) {
    found.add('supabase');
  }
  // Next.js by config file
  if (fileExists(path.join(rootAbs, 'next.config.js')) ||
      fileExists(path.join(rootAbs, 'next.config.mjs')) ||
      fileExists(path.join(rootAbs, 'next.config.ts'))) {
    found.add('nextjs');
  }
  // Vite by config
  if (fileExists(path.join(rootAbs, 'vite.config.js')) ||
      fileExists(path.join(rootAbs, 'vite.config.ts')) ||
      fileExists(path.join(rootAbs, 'vite.config.mjs'))) {
    found.add('vite');
  }
  // Astro by config
  if (fileExists(path.join(rootAbs, 'astro.config.mjs')) ||
      fileExists(path.join(rootAbs, 'astro.config.js')) ||
      fileExists(path.join(rootAbs, 'astro.config.ts'))) {
    found.add('astro');
  }
  // Expo
  if (fileExists(path.join(rootAbs, 'app.json')) && fileExists(path.join(rootAbs, 'expo'))) {
    found.add('expo');
  }
  // SvelteKit by svelte.config + sveltekit-specific files
  if (fileExists(path.join(rootAbs, 'svelte.config.js')) || fileExists(path.join(rootAbs, 'svelte.config.ts'))) {
    found.add('sveltekit');
  }
  // MCP agent integration
  if (fileExists(path.join(rootAbs, '.cursor', 'mcp.json')) ||
      fileExists(path.join(rootAbs, '.claude', 'mcp.json')) ||
      fileExists(path.join(rootAbs, 'claude_desktop_config.json'))) {
    found.add('mcp');
  }
  return found;
}

export function detectFrameworks(root: string, opts: FrameworkDetectOptions = {}): string[] {
  const rootAbs = path.resolve(root);
  const combined = new Set<string>();

  if (opts.readPackageJson !== false) {
    const pkg = readPackageJsonFromRoot(rootAbs);
    if (pkg) {
      const deps: Record<string, unknown> = {
        ...(pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies as Record<string, unknown> : {}),
        ...(pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies as Record<string, unknown> : {}),
        ...(pkg.peerDependencies && typeof pkg.peerDependencies === 'object' ? pkg.peerDependencies as Record<string, unknown> : {}),
      };
      for (const f of frameworksFromDeps(deps)) combined.add(f);
    }
  }

  if (opts.readFilesystem !== false) {
    for (const f of frameworksFromFilesystem(rootAbs)) combined.add(f);
  }

  return Array.from(combined).sort();
}
