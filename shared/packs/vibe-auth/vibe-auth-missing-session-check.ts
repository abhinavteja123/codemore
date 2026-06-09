/**
 * Rule: vibe-auth-missing-session-check
 *
 * Flags API route handlers that handle a state-changing method
 * (POST / PUT / PATCH / DELETE) WITHOUT referencing any session/auth
 * helper. This is the canonical Lovable bug: the UI gates the action
 * behind a sign-in screen, but the backend endpoint is wide open.
 *
 * Severity: MAJOR (not BLOCKER).
 *   The reasoning matches vibe-no-rate-limit: many tutorial/example
 *   Next.js apps ship POST handlers without auth on purpose (webhook
 *   receivers, public form submissions, demo routes). At BLOCKER we'd
 *   light up reference apps and lose trust. At MAJOR the signal stays
 *   visible; teams can promote via .codemorerc.json when they ship.
 *
 * Detection (single-file with ProjectIndex assist):
 *   1. The file is in projectIndex.routeFiles.
 *   2. The file declares a handler for POST / PUT / PATCH / DELETE
 *      (Next.js App Router named export) OR the file is a Pages API /
 *      Express route AND the body references one of those verbs.
 *   3. NEITHER the file's own AST NOR its imports reference any of:
 *        getServerSession, auth, currentUser, getAuth, clerkClient,
 *        getUser, getSession, requireUser, requireAuth, verifySession,
 *        next-auth, @clerk/*, @supabase/ssr, @auth/*
 *      — the union of "names a vibe-coded app would actually use".
 *
 * Coverage gap (intentional):
 *   - Middleware-level auth (`middleware.ts` short-circuits requests
 *     before they hit the handler) is NOT detected as a session check.
 *     False positives in that case are acceptable for now; suppress with
 *     a Reason comment. (A future pass will read `middleware.ts` and
 *     subtract matched routes from the candidate list.)
 *   - Webhook receivers (Stripe, GitHub) often verify a signature instead
 *     of a session. Suppress with: "Reason: verifies webhook signature".
 *   - tRPC and GraphQL routers are not detected as routes in v1.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const AUTH_REFERENCE_NAMES = new Set([
  'getServerSession',
  'auth',
  'currentUser',
  'getAuth',
  'clerkClient',
  'getUser',
  'getSession',
  'requireUser',
  'requireAuth',
  'verifySession',
  'authMiddleware',
]);

const AUTH_MODULE_PREFIXES: ReadonlyArray<string> = [
  'next-auth',
  '@auth/',
  '@clerk/',
  '@supabase/ssr',
  '@supabase/auth-helpers-nextjs',
  '@supabase/auth-helpers-react',
  '@workos-inc/',
];

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function fileReferencesAuthHelper(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && AUTH_REFERENCE_NAMES.has(n.text)) {
      // Don't count the declaration site of a same-named symbol.
      const p = n.parent;
      if (p && ts.isFunctionDeclaration(p) && p.name === n) return;
      if (p && ts.isVariableDeclaration(p) && p.name === n) return;
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function fileImportsAuthLib(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteralLike(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (AUTH_MODULE_PREFIXES.some(p => spec === p || spec.startsWith(p))) return true;
    }
  }
  return false;
}

/**
 * For Next.js App Router files, the methods come from ProjectIndex.
 * For Pages API / Express the methods list is `['UNKNOWN']` — we then
 * fall back to scanning the file content for `req.method === 'POST'`
 * etc. or `app.post(...)`.
 */
function fallbackDetectStateChange(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name)) {
      const method = n.name.text.toUpperCase();
      if (STATE_CHANGING_METHODS.has(method)) {
        // `app.post(...)`, `router.delete(...)` etc.
        if (ts.isCallExpression(n.parent) && (n.parent as ts.CallExpression).expression === n) {
          found = true;
          return;
        }
      }
    }
    if (ts.isStringLiteralLike(n) && STATE_CHANGING_METHODS.has(n.text.toUpperCase())) {
      // `req.method === 'POST'` style.
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

export const vibeAuthMissingSessionCheck: Rule = {
  id: 'vibe-auth-missing-session-check',
  version: '1.0.0',
  pack: 'vibe-auth',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.8,
  title: 'State-changing API route with no session/auth check',
  whyItMatters:
    'A POST / PUT / PATCH / DELETE route handler that never references any session helper ' +
    '(getServerSession / auth / currentUser / clerkClient / supabase.auth.getUser / etc.) is ' +
    'the canonical Lovable bug: the UI gates the action behind sign-in, but the API endpoint ' +
    'happily accepts requests from anyone. Anonymous callers can mutate other users\' data, ' +
    'enumerate IDs, or run up your costs. This rule fires when the file IS a route handler, ' +
    'IS state-changing, and neither references nor imports any common auth helper.',
  citation: 'https://codemore.dev/rules/vibe-auth-missing-session-check',

  detect(ctx: RuleContext): RuleFinding[] {
    const idx = ctx.projectIndex;
    if (!idx) return [];
    if (!ctx.sourceFile) return [];

    const me = idx.routeFiles.find(r => r.relPath === ctx.filePath);
    if (!me) return [];

    // Determine whether this file is state-changing.
    let stateChanging = false;
    if (me.style === 'next-app-router') {
      stateChanging = me.methods.some(m => STATE_CHANGING_METHODS.has(m));
    } else {
      // Pages API / Express / unknown — fall back to AST scan.
      stateChanging = fallbackDetectStateChange(ctx.sourceFile);
    }
    if (!stateChanging) return [];

    if (fileReferencesAuthHelper(ctx.sourceFile)) return [];
    if (fileImportsAuthLib(ctx.sourceFile)) return [];

    const verbList = me.methods.filter(m => STATE_CHANGING_METHODS.has(m));
    const verbsLabel = verbList.length > 0 ? verbList.join(', ') : 'a state-changing method';

    return [{
      evidence: {
        file: ctx.filePath,
        line: 1,
        column: 1,
        snippet: (ctx.lines[0] ?? '').trim(),
        matchedPattern: `missing-auth-${me.style}`,
      },
      whyItMatters:
        `This route handles ${verbsLabel} but the file references no auth helper ` +
        `(getServerSession / auth / currentUser / clerkClient / supabase.auth.getUser / etc.) ` +
        `and imports no auth library (next-auth / @auth/* / @clerk/* / @supabase/ssr). ` +
        `Anonymous callers can hit this endpoint and mutate data.`,
      suggestedFix: {
        type: 'code-patch',
        instructions:
          `Wire a session check at the top of the handler. Examples:\n\n` +
          `  // Auth.js / NextAuth v5\n` +
          `  import { auth } from '@/auth';\n` +
          `  export async function POST(req: Request) {\n` +
          `    const session = await auth();\n` +
          `    if (!session?.user) return new Response('Unauthorized', { status: 401 });\n` +
          `    ...\n` +
          `  }\n\n` +
          `  // Clerk\n` +
          `  import { auth } from '@clerk/nextjs/server';\n` +
          `  export async function POST() {\n` +
          `    const { userId } = await auth();\n` +
          `    if (!userId) return new Response('Unauthorized', { status: 401 });\n` +
          `    ...\n` +
          `  }\n\n` +
          `  // Supabase\n` +
          `  import { createClient } from '@/utils/supabase/server';\n` +
          `  export async function POST() {\n` +
          `    const supabase = createClient();\n` +
          `    const { data: { user } } = await supabase.auth.getUser();\n` +
          `    if (!user) return new Response('Unauthorized', { status: 401 });\n` +
          `    ...\n` +
          `  }\n\n` +
          `If this route is a webhook that verifies a signature instead of a session ` +
          `(Stripe, GitHub, etc.), suppress with a Reason comment.`,
        verificationCriteria: [
          'The handler short-circuits unauthenticated requests with a 401 / 403',
          'Re-scan reports vibe-auth-missing-session-check resolved for this file',
        ],
      },
    }];
  },
};
