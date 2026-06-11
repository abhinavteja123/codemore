/**
 * Rule: vibe-auth-inverted
 *
 * Detects the inverted-auth pattern (CVE-2025-48757 class, ~24% of vibe
 * apps): a route handler whose anonymous branch returns MORE data than
 * its authenticated branch.
 *
 *   export async function GET() {
 *     const session = await auth();
 *     if (!session) {
 *       return Response.json(await db.from('users').select());  // anon → ALL users
 *     }
 *     return Response.json({ user: session.user });             // authed → just self
 *   }
 *
 * The bug usually comes from copy-pasting placeholder code: "this is what
 * we return while the auth wiring is incomplete" stays in the !session
 * branch and ships.
 *
 * Severity: BLOCKER. This is full data exfiltration to anonymous callers.
 *
 * Detection (per route file, single-file AST):
 *   1. The file is in projectIndex.routeFiles (we don't fire on arbitrary
 *      utility files — too noisy).
 *   2. The file references an auth helper name (so the developer DID
 *      intend an auth gate).
 *   3. Inside any function-like body, find an `if (!X)` where `X` is one of
 *      the auth-helper / session identifiers: session, user, auth, userId,
 *      ctx?.session?.user, etc.
 *   4. The THEN-branch of that if contains a DB read against a user-data
 *      table (SELECT shape OR Supabase .from('<user-table>') OR Prisma
 *      .user/.account/.profile/.session/.order/.subscription chain).
 *   5. The ELSE-branch (or the if-body's continuation) returns a NARROWER
 *      response. Practically: the THEN-branch references a user-data
 *      query AND the rest of the function body does not.
 *   -> Emit one finding pointing at the `if (!X)` line.
 *
 * Coverage gap (intentional):
 *   - The "more data" comparison is heuristic — we look for the presence
 *     of a user-data query in the anon branch and its absence outside.
 *     False positives are possible when the anon branch genuinely should
 *     read user data (rare but real, e.g. a public leaderboard).
 *   - We only check direct `if (!X)`. The dual `if (X)` form with the
 *     fall-through being the leaky branch is not yet detected.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const AUTH_NEGATABLE_NAMES = new Set([
  'session', 'user', 'auth', 'userId', 'currentUser',
  'sessionId', 'isAuthenticated', 'isLoggedIn', 'currentUserId',
]);

const AUTH_REFERENCE_NAMES = new Set([
  'getServerSession', 'auth', 'currentUser', 'getAuth', 'clerkClient',
  'getUser', 'getSession', 'requireUser', 'requireAuth', 'verifySession',
]);

const USER_TABLE_NAMES = new Set([
  'users', 'profiles', 'accounts', 'customers', 'sessions', 'orders',
  'memberships', 'subscriptions', 'billing', 'payments', 'identities',
  'user', 'profile', 'account', 'customer', 'session', 'order',
  'membership', 'subscription', 'payment', 'identity',
]);

/** A regex over SQL-string-shaped text. */
const SELECT_USER_TABLE_RE = new RegExp(
  '\\b(?:SELECT|FROM|UPDATE|DELETE\\s+FROM)\\s+[A-Za-z_."]*(?:' +
  Array.from(USER_TABLE_NAMES).join('|') + ')\\b',
  'i',
);

/** Does the expression negate a session-like identifier? */
function negatesAuth(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (!ts.isPrefixUnaryExpression(expr)) return false;
  if (expr.operator !== ts.SyntaxKind.ExclamationToken) return false;
  const operand = expr.operand;
  if (ts.isIdentifier(operand)) {
    return AUTH_NEGATABLE_NAMES.has(operand.text);
  }
  // `!session?.user`, `!session.user`, `!ctx.session`, etc. — walk the
  // chain and accept if any root identifier matches.
  let cur: ts.Expression = operand;
  while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
    cur = (cur as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression as ts.Expression;
  }
  if (ts.isCallExpression(cur)) {
    // `!await auth()` — TS parses the negation around the await; we get
    // the call expression here. Accept if the callee text matches.
    const calleeText = cur.expression.getText(sf);
    return AUTH_REFERENCE_NAMES.has(calleeText) || /\b(?:auth|getServerSession|getUser|currentUser)\b/.test(calleeText);
  }
  if (ts.isIdentifier(cur) && AUTH_NEGATABLE_NAMES.has(cur.text)) return true;
  return false;
}

/**
 * Does this node tree contain a "user-data read" — a SQL SELECT against
 * a user table OR an ORM chain referencing a user-data segment?
 */
function containsUserDataRead(node: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;

    // SQL inside string / template literal — regex match.
    if (ts.isStringLiteralLike(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (SELECT_USER_TABLE_RE.test(n.text)) { found = true; return; }
    }
    if (ts.isTemplateExpression(n)) {
      const composed = n.head.text + n.templateSpans.map(s => s.literal.text).join(' ');
      if (SELECT_USER_TABLE_RE.test(composed)) { found = true; return; }
    }

    // Supabase / Prisma chain: .from('users') / .from("profiles") / .users / .findMany
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      if (method === 'from' && n.arguments.length > 0
          && ts.isStringLiteralLike(n.arguments[0])
          && USER_TABLE_NAMES.has((n.arguments[0] as ts.StringLiteralLike).text.toLowerCase())) {
        found = true; return;
      }
    }
    // Prisma-shape: `prisma.user.findMany(...)` etc.
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name)
        && USER_TABLE_NAMES.has(n.name.text.toLowerCase())) {
      // Only treat as a "DB read" when this property access is the receiver
      // of a known query method (`.findMany`, `.findFirst`, `.findUnique`,
      // `.findAll`, `.find`, `.select`, `.all`).
      const p = n.parent;
      if (p && ts.isPropertyAccessExpression(p)) {
        const m = p.name.text;
        if (m === 'findMany' || m === 'findFirst' || m === 'findUnique'
         || m === 'findAll' || m === 'find' || m === 'select' || m === 'all') {
          found = true; return;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function fileReferencesAuthHelper(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && AUTH_REFERENCE_NAMES.has(n.text)) {
      found = true; return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

export const vibeAuthInverted: Rule = {
  id: 'vibe-auth-inverted',
  version: '1.0.0',
  pack: 'vibe-auth',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.7,
  title: 'Anonymous branch returns more user data than the authenticated branch (inverted auth)',
  whyItMatters:
    'Inverted-auth (CVE-2025-48757 class) shows up in ~24% of audited vibe-coded apps: the ' +
    'route checks `if (!session)` and the anonymous branch ships a query against the users / ' +
    'profiles / accounts table, while the authenticated branch returns the much smaller ' +
    '`session.user` shape. The bug is full data exfiltration to unauthenticated callers. ' +
    'Usually it\'s placeholder code ("this is what we return while auth is incomplete") that ' +
    'never got replaced.',
  citation: 'https://codemore.dev/rules/vibe-auth-inverted',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    if (!ctx.projectIndex) return [];
    if (!ctx.projectIndex.routeFiles.some(r => r.relPath === ctx.filePath)) return [];
    if (!fileReferencesAuthHelper(ctx.sourceFile)) return [];

    const sf = ctx.sourceFile;
    const findings: RuleFinding[] = [];

    const visit = (n: ts.Node): void => {
      if (ts.isIfStatement(n) && negatesAuth(n.expression, sf)) {
        const thenLeaks = containsUserDataRead(n.thenStatement, sf);
        if (thenLeaks) {
          // Verify the rest of the function body doesn't ALSO contain the
          // same data read — that would mean both branches leak (which is
          // missing-session-check's territory).
          const enclosingFn = findEnclosingFunction(n);
          let restLeaks = false;
          if (enclosingFn?.body) {
            const restVisit = (m: ts.Node): void => {
              if (restLeaks) return;
              if (m === n.thenStatement) return; // skip the if-then we already saw
              if (m === n) {
                // descend into the else only, skip then
                if (n.elseStatement) restVisit(n.elseStatement);
                return;
              }
              if (ts.isStringLiteralLike(m) || ts.isCallExpression(m) || ts.isPropertyAccessExpression(m)) {
                if (containsUserDataRead(m, sf)) { restLeaks = true; return; }
              }
              ts.forEachChild(m, restVisit);
            };
            restVisit(enclosingFn.body);
          }
          if (!restLeaks) {
            const start = n.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(start);
            findings.push({
              evidence: {
                file: ctx.filePath,
                line: lc.line + 1,
                column: lc.character + 1,
                snippet: (ctx.lines[lc.line] ?? '').trim(),
                matchedPattern: 'inverted-auth-if-not-session',
              },
              whyItMatters:
                `The \`if (!…)\` branch on this line reads from a user-data table while the ` +
                `rest of the function body does not. Anonymous callers receive the wider ` +
                `payload — full data exfiltration if the table contains other users' records.`,
              suggestedFix: {
                type: 'code-patch',
                instructions:
                  `Invert the gate so the anon branch returns the SMALLER response and the ` +
                  `authenticated branch returns the user-scoped data:\n\n` +
                  `  // wrong\n` +
                  `  if (!session) return Response.json(await db.from('users').select());\n` +
                  `  return Response.json({ user: session.user });\n\n` +
                  `  // right\n` +
                  `  if (!session) return new Response('Unauthorized', { status: 401 });\n` +
                  `  return Response.json({ user: session.user });\n\n` +
                  `If the anon branch is genuinely supposed to return public data (e.g. a public ` +
                  `leaderboard query against a "user-stats" table that holds only aggregate ` +
                  `stats), suppress with a Reason comment describing exactly which columns are ` +
                  `public.`,
                verificationCriteria: [
                  'The anon branch returns a non-user-data response (401, public summary, etc.)',
                  'The user-data query is moved inside the authenticated branch and scoped to session.user.id',
                  'Re-scan reports vibe-auth-inverted resolved for this line',
                ],
              },
            });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return findings;
  },
};

function findEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur)
     || ts.isArrowFunction(cur) || ts.isMethodDeclaration(cur)
     || ts.isConstructorDeclaration(cur)) {
      return cur;
    }
    cur = cur.parent;
  }
  return undefined;
}
