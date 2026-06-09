/**
 * Rule: vibe-supabase-anon-key-bundled
 *
 * Detects `createClient(URL, KEY)` calls in client-reachable files where
 * the KEY argument is a hardcoded string literal (rather than coming from
 * `process.env.NEXT_PUBLIC_*` or similar). Moltbook-class incident: a
 * service-role JWT hardcoded in a Next.js client component leaked 1.5M
 * tokens.
 *
 * The anon key itself is DESIGNED to be public. What goes wrong in
 * vibe-coded apps:
 *   (a) The developer paste the SERVICE ROLE key into the `createClient`
 *       call by mistake. The string ships to the browser.
 *   (b) A literal anon key bypasses the env-var indirection, so future
 *       key rotations require code edits the team forgets to do.
 *
 * Severity: BLOCKER.
 *   When a literal key reaches the client bundle the blast radius is
 *   "any visitor of any page can use this credential." If it's the
 *   service-role key, the database is wide open.
 *
 * Detection (AST, file-only):
 *   - File path matches a client-reachable convention:
 *       src/app/**, src/pages/**, src/components/**, app/**, pages/**,
 *       components/**.
 *     (Server-only files like `app/api/.../route.ts` are NOT client-
 *     reachable; we exempt anything matching `/api/.../route.{ts,tsx,js,jsx}`.)
 *   - File imports `@supabase/supabase-js` (or any `@supabase/*` shape).
 *   - File contains a `createClient(<arg1>, <arg2>, …)` call where
 *     `<arg2>` is a StringLiteral / NoSubstitutionTemplateLiteral that
 *     LOOKS like a Supabase JWT (starts with `eyJ`) OR is a non-empty
 *     literal that's neither a process.env access nor a known-safe
 *     reference.
 *
 * Coverage gap (intentional):
 *   - Cross-file flow (key defined in one file, used in another) is NOT
 *     tracked in v1. The Moltbook class is single-file by construction.
 *   - createClient could be re-exported from a wrapper module; we still
 *     match the local call site as long as the import + path conditions
 *     hold.
 *   - The rule does NOT distinguish anon-key from service-role key — both
 *     are JWTs. The fix is the same either way: use env vars.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const JWT_PREFIX_RE = /^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

const CLIENT_PATH_RES: ReadonlyArray<RegExp> = [
  /(^|\/)src\/app\//,
  /(^|\/)src\/pages\//,
  /(^|\/)src\/components\//,
  /(^|\/)app\//,
  /(^|\/)pages\//,
  /(^|\/)components\//,
];

const SERVER_ROUTE_RE = /\/api\/.+\/route\.(ts|tsx|js|jsx)$/;
const SERVER_PAGES_API_RE = /(^|\/)(?:src\/)?pages\/api\//;

function isClientReachable(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (SERVER_ROUTE_RE.test(norm)) return false;
  if (SERVER_PAGES_API_RE.test(norm)) return false;
  for (const re of CLIENT_PATH_RES) {
    if (re.test(norm)) return true;
  }
  return false;
}

function fileImportsSupabase(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteralLike(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (spec === '@supabase/supabase-js' || spec.startsWith('@supabase/')) return true;
    }
  }
  return false;
}

interface Hit {
  line: number;
  column: number;
  start: number;
  end: number;
  shape: 'literal-jwt' | 'literal-other';
  preview: string;
}

function findHardcodedCreateClient(sf: ts.SourceFile): Hit[] {
  const hits: Hit[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)
        && (
          (ts.isIdentifier(n.expression) && n.expression.text === 'createClient')
          || (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'createClient')
        )
        && n.arguments.length >= 2) {
      const arg2 = n.arguments[1];
      if (ts.isStringLiteralLike(arg2)) {
        const value = arg2.text;
        if (value.length === 0) return;
        const start = arg2.getStart(sf);
        const lc = sf.getLineAndCharacterOfPosition(start);
        const shape: Hit['shape'] = JWT_PREFIX_RE.test(value) ? 'literal-jwt' : 'literal-other';
        hits.push({
          line: lc.line + 1,
          column: lc.character + 1,
          start,
          end: arg2.getEnd(),
          shape,
          preview: value.length > 24 ? value.slice(0, 24) + '…' : value,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

export const vibeSupabaseAnonKeyBundled: Rule = {
  id: 'vibe-supabase-anon-key-bundled',
  version: '1.0.0',
  pack: 'vibe-supabase',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  targetFrameworks: ['supabase'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'Supabase createClient called with a hardcoded key in a client-reachable file',
  whyItMatters:
    'A `createClient(URL, KEY)` call in a file under src/app, src/pages, or src/components ships ' +
    'whatever key was passed into the BROWSER bundle. The Moltbook incident (Feb 2026) leaked ' +
    '1.5M tokens via a service-role JWT hardcoded in a Next.js client component — the developer ' +
    'pasted the wrong key, the build silently shipped it. Even if it IS the anon key, hardcoding ' +
    'bypasses env-var indirection and locks future rotations behind code edits. Always read the ' +
    'key from `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` (or your framework\'s equivalent).',
  citation: 'https://codemore.dev/rules/vibe-supabase-anon-key-bundled',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    if (!isClientReachable(ctx.filePath)) return [];
    if (!fileImportsSupabase(ctx.sourceFile)) return [];

    const findings: RuleFinding[] = [];
    for (const hit of findHardcodedCreateClient(ctx.sourceFile)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: hit.shape,
        },
        whyItMatters:
          hit.shape === 'literal-jwt'
            ? `\`createClient(...)\` second argument is a literal JWT (\`${hit.preview}\`). This ` +
              `string is reachable from a client-side file (src/app, src/pages, src/components) ` +
              `and will land in the browser bundle. If it's the service-role key, the database is ` +
              `wide open to any visitor.`
            : `\`createClient(...)\` second argument is a hardcoded string in a client-reachable ` +
              `file. Even if it's the anon key, this bypasses env-var indirection and ships the ` +
              `literal value into the browser bundle. Future key rotations will silently break.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Move the key into an environment variable and reference it at the call site:\n\n` +
            `  // .env.local (Next.js)\n` +
            `  NEXT_PUBLIC_SUPABASE_URL=...\n` +
            `  NEXT_PUBLIC_SUPABASE_ANON_KEY=...\n\n` +
            `  // your client file\n` +
            `  import { createClient } from '@supabase/supabase-js';\n` +
            `  export const supabase = createClient(\n` +
            `    process.env.NEXT_PUBLIC_SUPABASE_URL!,\n` +
            `    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,\n` +
            `  );\n\n` +
            `Service-role keys MUST NEVER appear in client-reachable code — even via env vars ` +
            `prefixed NEXT_PUBLIC_ / VITE_ / REACT_APP_. They belong in server-only environment ` +
            `variables consumed by api routes / server actions.`,
          verificationCriteria: [
            'The createClient second argument is a process.env reference, not a literal',
            'No file under a client-reachable path declares the service-role key',
            'Re-scan reports vibe-supabase-anon-key-bundled resolved for this file',
          ],
        },
      });
    }
    return findings;
  },
};
