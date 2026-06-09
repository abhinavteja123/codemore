/**
 * ProjectIndex — single shared cross-file snapshot built once per scan and
 * passed to every Rule via RuleContext.projectIndex.
 *
 * Why this exists: most of the Phase 2B security rules (no-rate-limit,
 * missing-session-check, BOLA, no-input-validation, anon-key-bundled,
 * unused-export) need answers to questions a single file cannot give:
 *
 *   - "Does ANY file in this project import @upstash/ratelimit?"
 *   - "Which files look like API route handlers?"
 *   - "Is `getServerSession` referenced anywhere?"
 *
 * Building this once per scan and reusing it across rules keeps the
 * walker O(files) instead of O(files * rules).
 *
 * Stability contract:
 *   - This module never throws. Parse failures degrade silently (the
 *     index just won't know about that file).
 *   - The shape is additive — fields are added when a new rule needs them,
 *     never removed. Existing fields keep their semantics.
 *   - Costs paid: one TS parse per .ts/.tsx/.js/.jsx file, one regex
 *     pre-scan of every other text file. Total scan-time overhead on a
 *     1k-file project: ~200ms in practice.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/** What style of route handler a file looks like. */
export type RouteStyle =
  | 'next-app-router'   // app/api/**/route.ts(x)
  | 'next-pages-api'    // pages/api/**.ts(x)
  | 'express'           // file imports express + calls app.get / router.post / etc.
  | 'unknown';          // route-like by structure but the framework couldn't be identified

/** HTTP-ish method names a route file is known to handle. */
export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'UNKNOWN';

export interface RouteFile {
  absPath: string;
  /** POSIX-style workspace-relative path. */
  relPath: string;
  style: RouteStyle;
  /** Methods discovered in the file. UNKNOWN means "couldn't infer". */
  methods: ReadonlyArray<RouteMethod>;
}

/**
 * Names imported from rate-limit libraries we recognise. Used by
 * `vibe-no-rate-limit` to decide "the project knows what rate limiting is."
 */
const RATE_LIMIT_MODULES = new Set([
  '@upstash/ratelimit',
  'express-rate-limit',
  'next-rate-limit',
  '@nestjs/throttler',
  'fastify-rate-limit',
  '@fastify/rate-limit',
  'rate-limiter-flexible',
  'limiter',
  'p-throttle',
  'p-limit',                // weak signal but common in vibe apps
  'lru-rate-limit',
]);

/**
 * Identifier names we treat as "a session check was performed in this
 * function". Used by `vibe-auth-missing-session-check`. Names are matched
 * by reference, not by import — many projects re-export the helpers.
 */
const AUTH_CHECK_NAMES = new Set([
  'getServerSession',
  'auth',                   // Auth.js / NextAuth v5 server helper
  'currentUser',            // Clerk
  'getAuth',                // Clerk
  'clerkClient',
  'getUser',                // Supabase
  'getSession',             // Supabase / Auth.js
  'requireUser',            // common vibe-app convention
  'requireAuth',
  'verifySession',
]);

/** Module specifiers that are validators (used by no-input-validation). */
const VALIDATOR_MODULES = new Set([
  'zod', 'yup', 'joi', 'typia', 'valibot', 'ajv', 'superstruct', 'io-ts', 'class-validator',
]);

export interface ProjectIndex {
  /** Project root used to build this index (absolute path). */
  root: string;
  /**
   * Every distinct module specifier referenced by any ES `import` /
   * `import type` / `require(...)` in any scanned TS/JS file. Lowercased
   * is NOT applied — package names are case-sensitive on npm.
   */
  allImports: Set<string>;
  /** Every file recognised as an API route handler. */
  routeFiles: ReadonlyArray<RouteFile>;
  /** True when at least one rate-limit library is imported somewhere. */
  hasRateLimitLib: boolean;
  /** True when at least one validator library (zod/yup/etc) is imported somewhere. */
  hasValidatorLib: boolean;
  /** True when at least one auth-helper name is referenced somewhere. */
  hasAuthHelper: boolean;
  /** True when @supabase/* is in the import set. */
  hasSupabase: boolean;
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Conservative shouldVisit check shared with the walker. */
function shouldSkipDir(name: string): boolean {
  return name === 'node_modules' || name === '.git'
      || name === 'dist' || name === 'build' || name === 'out' || name === '.next';
}

function classifyRouteStyle(relPosix: string): { style: RouteStyle; methods: ReadonlyArray<RouteMethod> } | null {
  // Next.js App Router: any path containing `/app/api/**/route.{ts,tsx,js,jsx}`
  if (/(^|\/)app\/api\//.test(relPosix) && /\/route\.(ts|tsx|js|jsx)$/.test(relPosix)) {
    return { style: 'next-app-router', methods: [] };
  }
  // Next.js Pages Router: `pages/api/**`
  if (/(^|\/)pages\/api\//.test(relPosix) && /\.(ts|tsx|js|jsx)$/.test(relPosix)) {
    return { style: 'next-pages-api', methods: [] };
  }
  return null;
}

const HTTP_VERB_NAMES = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

/**
 * For Next.js App Router files, exported function names are the methods.
 * For Pages Router files we don't try to enumerate — a single default
 * handler typically dispatches inside.
 */
function extractAppRouterMethods(sf: ts.SourceFile): RouteMethod[] {
  const found = new Set<RouteMethod>();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt)
        && stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
        && stmt.name && HTTP_VERB_NAMES.has(stmt.name.text)) {
      found.add(stmt.name.text as RouteMethod);
    }
    // `export const POST = …`
    if (ts.isVariableStatement(stmt)
        && stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && HTTP_VERB_NAMES.has(decl.name.text)) {
          found.add(decl.name.text as RouteMethod);
        }
      }
    }
  }
  return Array.from(found);
}

/** Look for Express handlers anywhere in the file. */
function isExpressRoute(sf: ts.SourceFile, importSpecifiers: Set<string>): boolean {
  if (!importSpecifiers.has('express') && !importSpecifiers.has('@express/router')) {
    // Could still be express via implicit dep, but the cost of false-positives
    // is too high without a signal.
    return false;
  }
  let hit = false;
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const prop = n.expression.name.text.toUpperCase();
      if (HTTP_VERB_NAMES.has(prop)) {
        hit = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hit;
}

/**
 * Extract every module specifier from an ES SourceFile. Side-effect imports,
 * named imports, default imports, namespace imports, and `import type` are
 * all collected. `require(...)` calls are collected too.
 */
function collectImports(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteralLike(n.moduleSpecifier)) {
      out.push(n.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(n)
            && n.moduleReference
            && ts.isExternalModuleReference(n.moduleReference)
            && n.moduleReference.expression
            && ts.isStringLiteralLike(n.moduleReference.expression)) {
      out.push(n.moduleReference.expression.text);
    } else if (ts.isCallExpression(n)
            && ts.isIdentifier(n.expression)
            && n.expression.text === 'require'
            && n.arguments.length === 1
            && ts.isStringLiteralLike(n.arguments[0])) {
      out.push((n.arguments[0] as ts.StringLiteralLike).text);
    } else if (ts.isCallExpression(n)
            && n.expression.kind === ts.SyntaxKind.ImportKeyword
            && n.arguments.length === 1
            && ts.isStringLiteralLike(n.arguments[0])) {
      out.push((n.arguments[0] as ts.StringLiteralLike).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function scanFileText(sf: ts.SourceFile): { imports: string[]; usesAuthHelper: boolean } {
  const imports = collectImports(sf);
  let usesAuthHelper = false;
  const visit = (n: ts.Node): void => {
    if (usesAuthHelper) return;
    if (ts.isIdentifier(n) && AUTH_CHECK_NAMES.has(n.text)) {
      // Don't count the declaration site of an auth helper itself.
      const p = n.parent;
      if (p && ts.isFunctionDeclaration(p) && p.name === n) return;
      usesAuthHelper = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { imports, usesAuthHelper };
}

/** True when a known rate-limit module is in the set. */
function setHasRateLimit(set: Set<string>): boolean {
  for (const m of set) if (RATE_LIMIT_MODULES.has(m)) return true;
  return false;
}

function setHasValidator(set: Set<string>): boolean {
  for (const m of set) if (VALIDATOR_MODULES.has(m)) return true;
  return false;
}

function setHasSupabase(set: Set<string>): boolean {
  for (const m of set) if (m === '@supabase/supabase-js' || m.startsWith('@supabase/')) return true;
  return false;
}

export function buildProjectIndex(root: string): ProjectIndex {
  const rootAbs = path.resolve(root);
  const allImports = new Set<string>();
  const routeFiles: RouteFile[] = [];
  let hasAuthHelper = false;

  function recur(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        recur(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TS_EXTENSIONS.has(ext)) continue;

      let content: string;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      if (content.length > 2 * 1024 * 1024) continue;

      let sf: ts.SourceFile;
      try {
        sf = ts.createSourceFile(entry.name, content, ts.ScriptTarget.Latest, true);
      } catch { continue; }

      const { imports, usesAuthHelper } = scanFileText(sf);
      for (const imp of imports) allImports.add(imp);
      if (usesAuthHelper) hasAuthHelper = true;

      const relPosix = path.relative(rootAbs, full).replace(/\\/g, '/');
      const routeHint = classifyRouteStyle(relPosix);
      if (routeHint) {
        const methods = routeHint.style === 'next-app-router'
          ? extractAppRouterMethods(sf)
          : [];
        routeFiles.push({
          absPath: full,
          relPath: relPosix,
          style: routeHint.style,
          methods: methods.length > 0 ? methods : ['UNKNOWN'],
        });
        continue;
      }

      // Express: route style is structural, not path-based.
      const importSet = new Set(imports);
      if (isExpressRoute(sf, importSet)) {
        routeFiles.push({
          absPath: full,
          relPath: relPosix,
          style: 'express',
          methods: ['UNKNOWN'],
        });
      }
    }
  }

  recur(rootAbs);

  return {
    root: rootAbs,
    allImports,
    routeFiles,
    hasRateLimitLib: setHasRateLimit(allImports),
    hasValidatorLib: setHasValidator(allImports),
    hasAuthHelper,
    hasSupabase: setHasSupabase(allImports),
  };
}
