/**
 * Rule: vibe-py-auth-bola
 *
 * Python analogue of `vibe-auth-bola` (Broken Object Level Authorization).
 * The canonical shape, ported to Flask / FastAPI:
 *
 *   The handler authenticates the request (@login_required / Depends /
 *   current_user) BUT then queries the database by a route path param
 *   without scoping by the authenticated user. Any logged-in user can
 *   read or mutate any other user's record by guessing IDs.
 *
 * Detection (per decorated route handler):
 *   1. The route path declares a param — Flask `<int:post_id>`,
 *      FastAPI `{item_id}`.
 *   2. The decorated definition references an auth mechanism (so the
 *      developer DID think about identity; the no-auth case belongs to
 *      vibe-py-auth-missing-check).
 *   3. The definition NEVER references an ownership term (user_id /
 *      owner_id / owner / current_user.id / request.user.id / g.user.id).
 *   4. A DB-shaped call (.get / .get_or_404 / .filter_by / .filter /
 *      .where / .execute / get_object_or_404) uses the path param.
 *   -> Emit a finding at the DB call line.
 *
 * Severity: MAJOR — same calibration as the TS rule; ownership can be
 * enforced by middleware or DB policy we can't see. Suppress with a
 * Reason comment when that's your setup.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import {
  isPyTestFilePath,
  iterDecoratedFunctions,
  parseRouteDecorators,
} from '../../rules/pythonHelpers';

// Same auth-evidence surface as vibe-py-auth-missing-check (duplicated by
// convention — the TS twins do the same; the sets will drift apart as each
// rule tunes independently).
const AUTH_TERM_RE =
  /\blogin_required\b|\bjwt_required\b|\btoken_required\b|\bauth_required\b|\brequires_auth\b|\bpermission_required\b|\bcurrent_user\b|\bget_jwt_identity\b|\bDepends\s*\(|\brequest\.user\b|\bg\.user\b|\bverify_token\b|\bauthenticate\b/;

// Ownership terms — any of these anywhere in the definition means the
// developer scoped (or is scoping) the query by the authenticated user.
const OWNERSHIP_RE =
  /\buser_id\b|\bowner_id\b|\bowner\b|\bcurrent_user\.(?:id\b|get_id\b)|\brequest\.user\.id\b|\bg\.user\.id\b/;

const DB_METHODS =
  'get|get_or_404|first_or_404|filter_by|filter|where|find_one|find_by_id|execute';

export const vibePyAuthBola: Rule = {
  id: 'vibe-py-auth-bola',
  version: '1.0.0',
  pack: 'vibe-auth',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.7,
  title: 'Route queries by path-param id without scoping by the authenticated user (BOLA)',
  whyItMatters:
    'BOLA is the #1 access-control vuln in vibe-coded apps, and the Python shape is identical ' +
    'to the TS one: the handler authenticates (@login_required / Depends), then calls ' +
    '`Model.query.get(post_id)` with the raw path param and no ownership filter. Any logged-in ' +
    'user can pass another user\'s id and read or delete their record. The AI generated the ' +
    'auth check correctly — it just forgot to scope the query.',
  citation: 'https://codemore.tech/rules/vibe-py-auth-bola',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    if (isPyTestFilePath(ctx.filePath)) return [];

    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    for (const fn of iterDecoratedFunctions(tree)) {
      const route = parseRouteDecorators(fn.decorators);
      if (!route.isRoute || route.pathParams.length === 0) continue;
      if (!AUTH_TERM_RE.test(fn.fullText)) continue;      // missing-check covers no-auth routes
      if (OWNERSHIP_RE.test(fn.fullText)) continue;       // ownership seen — assume scoped

      const paramAlt = route.pathParams.join('|');
      const dbCallRe = new RegExp(
        `(?:\\.(?:${DB_METHODS})|\\bget_object_or_404)\\s*\\([^)\\n]*\\b(?:${paramAlt})\\b`,
      );

      for (let i = fn.line - 1; i < fn.endLine && i < ctx.lines.length; i++) {
        const lineText = ctx.lines[i] ?? '';
        if (!dbCallRe.test(lineText)) continue;
        findings.push({
          evidence: {
            file: ctx.filePath,
            line: i + 1,
            column: 1,
            snippet: lineText.trim(),
            matchedPattern: `py-bola:${route.pathParams.join(',')}`,
          },
          whyItMatters:
            `Handler \`${fn.name}\` authenticates the request but queries by the route param ` +
            `(${route.pathParams.join(', ')}) without referencing the authenticated user ` +
            `anywhere in the function. Any logged-in user can pass another user's id.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Scope the query by the authenticated user. Examples:\n\n` +
              `  # Flask-SQLAlchemy\n` +
              `  post = Post.query.filter_by(\n` +
              `      id=post_id, user_id=current_user.id\n` +
              `  ).first_or_404()\n\n` +
              `  # FastAPI + SQLAlchemy\n` +
              `  item = db.query(Item).filter(\n` +
              `      Item.id == item_id, Item.owner_id == user.id\n` +
              `  ).first()\n` +
              `  if item is None:\n` +
              `      raise HTTPException(status_code=404)\n\n` +
              `If the resource is genuinely shared (public read, admin-only write), enforce ` +
              `ownership at the policy layer and suppress with a Reason comment.`,
            verificationCriteria: [
              'The DB query is scoped by the authenticated-user id in addition to the path-param id',
              'OR a policy / middleware that enforces ownership is documented',
              'Re-scan reports vibe-py-auth-bola resolved for this function',
            ],
          },
        });
      }
    }
    return findings;
  },
};
