/**
 * Rule: vibe-auth-bola
 *
 * Detects Broken Object Level Authorization (BOLA) — the #1 most
 * prevalent access-control vuln in vibe-coded apps per 2026 data.
 *
 * The canonical pattern:
 *   The handler authenticates the request (so it knows session.user.id)
 *   BUT then queries the database by a route-supplied id without
 *   filtering by the authenticated user. Result: any authenticated user
 *   can read or mutate any other user's record by guessing IDs.
 *
 * Severity: MAJOR.
 *   The vuln itself is severe (full IDOR), but our static signal here is
 *   heuristic — false positives are possible. We keep it at MAJOR so it
 *   appears prominently without gating CI; teams can promote via
 *   .codemorerc.json once they've tuned the rule against their codebase.
 *
 * Detection (per handler function inside a routeFile):
 *   1. The function references at least one auth helper name OR a
 *      session.user.id-shaped expression (so we know the developer
 *      DID think about identity).
 *   2. The function uses a route param (Next.js App Router: a
 *      `params` argument or `params.X` access; Express: `req.params.X`)
 *      in a DB-shaped call: `.eq('id', X)` / `.where({ id: X })` /
 *      `.findUnique({ where: { id: X } })` / `.findById(X)`.
 *   3. The function body NEVER references a session-user id term
 *      (`session.user.id`, `userId`, `auth.uid()`, `user_id`, `ownerId`).
 *   -> Emit a finding pointing at the DB call site.
 *
 * Coverage gap (intentional):
 *   - The ownership filter could be enforced in middleware or via an
 *     RLS policy. We can't see those statically; suppress with a Reason
 *     comment when that's your setup.
 *   - The DB call shape is matched against a curated method-name set;
 *     non-standard ORMs may need their method added.
 *   - We don't yet trace whether the route param itself is the user-id
 *     equivalent (e.g. `GET /users/[userId]`); we treat all dynamic
 *     params as resource ids. Acceptable false positive rate for v1.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const AUTH_REFERENCE_NAMES = new Set([
  'getServerSession', 'auth', 'currentUser', 'getAuth', 'clerkClient',
  'getUser', 'getSession', 'requireUser', 'requireAuth', 'verifySession',
]);

const OWNERSHIP_TERMS = [
  'session.user.id',
  'session.user_id',
  'session?.user.id',
  'session?.user?.id',
  'userId',
  'user_id',
  'ownerId',
  'owner_id',
  'auth.uid',
  'currentUserId',
  'user.id',
];

const DB_BY_ID_METHODS = new Set([
  // Read shapes
  'findById', 'findUnique', 'findOne', 'getById', 'findFirst',
  // Write shapes — Prisma takes { where: { id } } here too.
  'update', 'delete', 'upsert', 'deleteOne', 'updateOne',
]);

const DB_CHAINED_METHODS = new Set([
  'eq', 'where', 'whereEquals', 'filter', 'match',
]);

interface RouteParamAccess {
  /** Name of the destructured / accessed route param, e.g. `id`. */
  name: string;
  /** Identifier reference text in source. */
  text: string;
}

/**
 * Walk a function body collecting:
 *   - whether any auth helper is referenced
 *   - whether any ownership term is referenced anywhere in the body
 *   - the set of identifiers that came from `req.params.X` / `params.X`
 *     (Next.js App Router second-arg shape OR Express)
 *   - DB calls that pass any of those identifiers
 */
function analyzeFunction(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): {
  hasAuthCheck: boolean;
  hasOwnershipTerm: boolean;
  taintedParamNames: Set<string>;
  bolaCalls: Array<{ line: number; column: number; method: string; argText: string }>;
} {
  const taintedParamNames = new Set<string>();
  const bolaCalls: Array<{ line: number; column: number; method: string; argText: string }> = [];
  let hasAuthCheck = false;
  let hasOwnershipTerm = false;

  // Collect destructured `params` from the function signature.
  // Next.js App Router: `(req, { params })`.
  for (const p of fn.parameters) {
    if (ts.isObjectBindingPattern(p.name)) {
      for (const elt of p.name.elements) {
        if (ts.isIdentifier(elt.name) && elt.name.text === 'params') {
          // `{ params }: { params: { id: string } }`
          // We'll later catch property reads on a local identifier `params`.
        }
      }
    }
  }

  // First pass: collect tainted-param names and ownership-term signals
  // from AST nodes only (skipping comments — a comment that mentions
  // `userId` MUST NOT count as ownership).
  const collectTainted = (n: ts.Node): void => {
    // const { id } = params; / const { slug } = await req.params;
    if (ts.isVariableDeclaration(n)
        && n.initializer
        && ts.isObjectBindingPattern(n.name)) {
      const init = n.initializer;
      const initText = init.getText(sf);
      if (/(?:^|[^.\w])(?:params|req\.params|request\.params|ctx\.params|context\.params)\b/.test(initText)) {
        for (const elt of n.name.elements) {
          if (ts.isIdentifier(elt.name)) taintedParamNames.add(elt.name.text);
        }
      }
    }
    // Direct `params.X` / `req.params.X` reads.
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name)) {
      const headText = n.expression.getText(sf);
      if (/^(?:params|req\.params|request\.params|ctx\.params|context\.params)$/.test(headText)) {
        taintedParamNames.add(n.name.text);
      }
    }
    // Ownership-term detection: only on PropertyAccessExpression /
    // Identifier text — never on comments.
    if (!hasOwnershipTerm && (ts.isPropertyAccessExpression(n) || ts.isIdentifier(n))) {
      const txt = n.getText(sf);
      for (const term of OWNERSHIP_TERMS) {
        if (txt === term || txt.includes(term)) { hasOwnershipTerm = true; break; }
      }
    }
    ts.forEachChild(n, collectTainted);
  };
  if (fn.body) collectTainted(fn.body);

  const visit = (n: ts.Node): void => {
    // Auth helper reference?
    if (ts.isIdentifier(n) && AUTH_REFERENCE_NAMES.has(n.text)) {
      const p = n.parent;
      if (!(p && ts.isFunctionDeclaration(p) && p.name === n)) {
        hasAuthCheck = true;
      }
    }

    // DB call site detection.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      if (DB_BY_ID_METHODS.has(method) && n.arguments.length > 0) {
        const argText = n.arguments[0].getText(sf);
        if (containsTaintedParam(argText, taintedParamNames)) {
          const start = n.getStart(sf);
          const lc = sf.getLineAndCharacterOfPosition(start);
          bolaCalls.push({ line: lc.line + 1, column: lc.character + 1, method, argText });
        }
      }
      if (DB_CHAINED_METHODS.has(method) && n.arguments.length >= 1) {
        // Look at every argument text for tainted-param usage.
        for (const arg of n.arguments) {
          const argText = arg.getText(sf);
          if (containsTaintedParam(argText, taintedParamNames)) {
            const start = n.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(start);
            bolaCalls.push({ line: lc.line + 1, column: lc.character + 1, method, argText });
            break;
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);

  return { hasAuthCheck, hasOwnershipTerm, taintedParamNames, bolaCalls };
}

function containsTaintedParam(argText: string, tainted: Set<string>): boolean {
  if (tainted.size === 0) return false;
  for (const name of tainted) {
    const re = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
    if (re.test(argText)) return true;
  }
  return false;
}

function fileIsRouteFile(ctx: RuleContext): boolean {
  return !!ctx.projectIndex?.routeFiles.some(r => r.relPath === ctx.filePath);
}

function collectFunctionLikes(sf: ts.SourceFile): ts.FunctionLikeDeclaration[] {
  const out: ts.FunctionLikeDeclaration[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n)) out.push(n);
    else if (ts.isMethodDeclaration(n)) out.push(n);
    else if (ts.isFunctionExpression(n)) out.push(n);
    else if (ts.isArrowFunction(n)) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export const vibeAuthBola: Rule = {
  id: 'vibe-auth-bola',
  version: '1.0.0',
  pack: 'vibe-auth',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.7,
  title: 'Route queries by id without scoping by the authenticated user (BOLA)',
  whyItMatters:
    'BOLA (Broken Object Level Authorization) is the #1 most prevalent access-control vuln ' +
    'in vibe-coded apps. The shape: the handler verifies a session, then queries the DB by ' +
    'a route-supplied id (`params.id`) without filtering by the authenticated user. Any ' +
    'logged-in user can then read or mutate any other user\'s record by guessing IDs. The ' +
    'AI generated the auth check correctly — it just forgot to scope the query.',
  citation: 'https://codemore.dev/rules/vibe-auth-bola',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    if (!fileIsRouteFile(ctx)) return [];

    const findings: RuleFinding[] = [];
    for (const fn of collectFunctionLikes(ctx.sourceFile)) {
      const a = analyzeFunction(fn, ctx.sourceFile);
      if (!a.hasAuthCheck) continue;          // missing-session-check covers this
      if (a.hasOwnershipTerm) continue;       // ownership check seen — assume scoped
      if (a.bolaCalls.length === 0) continue; // no DB-by-id call with tainted param

      for (const call of a.bolaCalls) {
        findings.push({
          evidence: {
            file: ctx.filePath,
            line: call.line,
            column: call.column,
            snippet: (ctx.lines[call.line - 1] ?? '').trim(),
            matchedPattern: `bola-${call.method}`,
          },
          whyItMatters:
            `\`.${call.method}(${call.argText})\` queries by a route-supplied id without ` +
            `referencing the authenticated user anywhere in this function body. The route ` +
            `verifies a session but then looks up the record by id only — any logged-in user ` +
            `can pass another user\'s id and access their record.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Scope the query by the authenticated user. Examples:\n\n` +
              `  // Prisma\n` +
              `  const post = await prisma.post.findUnique({\n` +
              `    where: { id: params.id, userId: session.user.id },\n` +
              `  });\n` +
              `  if (!post) return new Response('Not found', { status: 404 });\n\n` +
              `  // Supabase\n` +
              `  const { data } = await supabase\n` +
              `    .from('posts')\n` +
              `    .select()\n` +
              `    .eq('id', params.id)\n` +
              `    .eq('user_id', session.user.id)\n` +
              `    .single();\n\n` +
              `If the resource is genuinely shared (public read, admin-only write), ` +
              `enforce ownership at the policy / RLS layer and suppress with a Reason comment.`,
            verificationCriteria: [
              'The DB query is scoped by the authenticated-user id in addition to the route-param id',
              'OR an RLS policy / middleware that enforces ownership is documented',
              'Re-scan reports vibe-auth-bola resolved for this function',
            ],
          },
        });
      }
    }
    return findings;
  },
};
