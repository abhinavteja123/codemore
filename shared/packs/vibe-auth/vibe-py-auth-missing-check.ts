/**
 * Rule: vibe-py-auth-missing-check
 *
 * Python analogue of `vibe-auth-missing-session-check`. Flags Flask /
 * FastAPI route handlers for state-changing methods (POST / PUT / PATCH /
 * DELETE) that reference no auth mechanism anywhere in the decorated
 * definition, in a file that imports no auth library.
 *
 * Auth evidence accepted (any one is enough, checked per handler):
 *   - decorator: @login_required / @jwt_required() / @auth.login_required /
 *     @permission_required(...) / dependencies=[Depends(...)]
 *   - body/signature: current_user, get_jwt_identity(), Depends(...),
 *     request.user, g.user, session["user_id"]-style reads,
 *     verify_token / authenticate / check_permission calls
 *
 * A bare auth-lib IMPORT is deliberately NOT evidence — "one gated route
 * plus one forgotten route in the same file" is exactly the bug class.
 * Files with a @app.before_request auth hook are skipped entirely, and so
 * are handlers whose NAME marks them public by design (login / register /
 * webhook / health / oauth callback).
 *
 * Severity: MAJOR (not BLOCKER) — same reasoning as the TS rule: public
 * form endpoints legitimately ship without a session check; suppress
 * those with a Reason comment.
 *
 * Coverage gap (intentional):
 *   - Auth enforced by middleware / a before_request hook in another file
 *     is invisible to single-file analysis. Suppress with a Reason comment.
 *   - Test files are skipped entirely.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import {
  isPyTestFilePath,
  iterDecoratedFunctions,
  parseRouteDecorators,
} from '../../rules/pythonHelpers';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Any auth reference inside the decorated definition (decorators + def + body).
const AUTH_TERM_RE = new RegExp(
  [
    /\blogin_required\b/.source,
    /\bjwt_required\b/.source,
    /\btoken_required\b/.source,
    /\bauth_required\b/.source,
    /\brequires_auth\b/.source,
    /\bpermission_required\b/.source,
    /\bpermission_classes\b/.source,
    /\bcurrent_user\b/.source,
    /\bget_jwt_identity\b/.source,
    /\bDepends\s*\(/.source,
    /\brequest\.user\b/.source,
    /\bg\.user\b/.source,
    /\bsession\s*\[\s*['"](?:user|user_id|uid|username)['"]/.source,
    /\bverify_token\b/.source,
    /\bauthenticate\b/.source,
    /\bcheck_permission\b/.source,
    /\bapi_key_required\b/.source,
  ].join('|'),
);

// File-level auth enforced by a hook that runs before every route —
// per-route decorators are then legitimately absent.
const BEFORE_REQUEST_HOOK_RE = /@\w+(?:\.\w+)*\.(?:before_request|before_app_request)\b/;

// Handlers that legitimately run unauthenticated: login/registration
// flows, token issuance, signature-verified webhooks, health checks.
const PUBLIC_HANDLER_NAME_RE =
  /^(?:login|logout|register|signup|signin|sign_in|sign_up|auth|token|refresh|callback|oauth|webhook|health|healthz|ping|status)/i;

export const vibePyAuthMissingCheck: Rule = {
  id: 'vibe-py-auth-missing-check',
  version: '1.0.0',
  pack: 'vibe-auth',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.8,
  title: 'State-changing route with no auth check',
  whyItMatters:
    'A POST / PUT / PATCH / DELETE route handler that never references any auth mechanism ' +
    '(@login_required / @jwt_required / current_user / Depends / request.user) is the canonical ' +
    'vibe-coding bug ported to Python: the UI gates the action behind sign-in, but the endpoint ' +
    'happily accepts requests from anyone. Anonymous callers can mutate other users\' data, ' +
    'enumerate IDs, or run up your costs.',
  citation: 'https://codemore.tech/rules/vibe-py-auth-missing-check',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    if (isPyTestFilePath(ctx.filePath)) return [];
    // Auth enforced for every route by a before_request hook — per-route
    // decorators are then legitimately absent. (A bare auth-lib IMPORT is
    // deliberately NOT a skip: "one gated route + one forgotten route in
    // the same file" is exactly the bug class this rule exists for.)
    if (BEFORE_REQUEST_HOOK_RE.test(ctx.content)) return [];

    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    for (const fn of iterDecoratedFunctions(tree)) {
      const route = parseRouteDecorators(fn.decorators);
      if (!route.isRoute) continue;
      const verbs = route.methods.filter(m => STATE_CHANGING.has(m));
      if (verbs.length === 0) continue;
      if (PUBLIC_HANDLER_NAME_RE.test(fn.name)) continue;
      if (AUTH_TERM_RE.test(fn.fullText)) continue;

      findings.push({
        evidence: {
          file: ctx.filePath,
          line: fn.line,
          column: fn.column,
          snippet: (ctx.lines[fn.line - 1] ?? '').trim(),
          matchedPattern: `py-missing-auth-${verbs.join('-').toLowerCase()}`,
        },
        whyItMatters:
          `Route handler \`${fn.name}\` handles ${verbs.join(', ')} but neither its decorators ` +
          `nor its body reference any auth mechanism. ` +
          `Anonymous callers can hit this endpoint and mutate data.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Gate the handler behind your auth layer. Examples:\n\n` +
            `  # Flask-Login\n` +
            `  from flask_login import login_required\n` +
            `  @app.route('/posts', methods=['POST'])\n` +
            `  @login_required\n` +
            `  def create_post(): ...\n\n` +
            `  # Flask-JWT-Extended\n` +
            `  from flask_jwt_extended import jwt_required\n` +
            `  @app.route('/posts', methods=['POST'])\n` +
            `  @jwt_required()\n` +
            `  def create_post(): ...\n\n` +
            `  # FastAPI\n` +
            `  @app.post('/posts')\n` +
            `  def create_post(user: User = Depends(get_current_user)): ...\n\n` +
            `If this route is a webhook that verifies a signature instead of a session ` +
            `(Stripe, GitHub, etc.), suppress with a Reason comment.`,
          verificationCriteria: [
            'The handler short-circuits unauthenticated requests with a 401 / 403',
            'Re-scan reports vibe-py-auth-missing-check resolved for this route',
          ],
        },
      });
    }
    return findings;
  },
};
