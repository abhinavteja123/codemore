/**
 * Rule: vibe-ssrf-fetch-user-input
 *
 * Detects Server-Side Request Forgery (SSRF) sinks: a `fetch(...)` /
 * `axios.get(...)` / etc. whose URL argument is sourced from user
 * input without a visible allowlist or host check.
 *
 * Severity: MAJOR.
 *   SSRF can be devastating (cloud metadata, internal services), but
 *   the same call shape is also entirely legitimate (proxying public
 *   APIs, scraping by allowlist). At BLOCKER we'd light up server-side
 *   API gateways. MAJOR is loud enough to surface; teams can promote
 *   via .codemorerc.json if they care.
 *
 * Detection (single-file AST):
 *   1. Find every CallExpression whose callee is:
 *        - `fetch`              (top-level)
 *        - `globalThis.fetch`
 *        - `axios.get` / `axios.post` / `axios.put` / `axios.delete` / `axios.patch`
 *        - `got(...)` / `got.get(...)` / `got.post(...)`
 *        - `request(...)`       (the `request` npm package)
 *      Bare `fetch(...)` is the headline pattern; the others catch the
 *      same anti-pattern in alternative HTTP clients.
 *   2. Inspect the first argument:
 *        - Template literal with `${...}` interpolation -> tainted.
 *        - Direct property access of a user-input source:
 *            req.body.* / req.query.* / req.params.* / req.headers.*
 *            request.body.* / request.json() result / request.formData()
 *            searchParams.get(...) / url.searchParams.get(...)
 *        - Identifier `X` whose name was destructured/assigned in this
 *          function body from one of the above sources.
 *      Any tainted shape -> emit a finding pointing at the call site.
 *
 * Confidence trade-off:
 *   We tag findings with matchedPattern = 'tainted-<source>' so triagers
 *   can see why. Calibration via telemetry tightens this over time.
 *
 * Coverage gap (intentional):
 *   - Multi-hop dataflow (`a = req.body.url; b = a; fetch(b)`) is NOT
 *     traced; only one assignment-hop.
 *   - URL allowlist patterns (`if (new URL(url).host !== 'api.x.com')`)
 *     are NOT inferred; allowlisting still trips the rule. Suppress with
 *     a Reason comment.
 *   - SSRF via redirect (`fetch(safeUrl).then(r => fetch(r.url))`) is
 *     out of scope.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const USER_INPUT_PROPS = new Set([
  'body', 'query', 'params', 'headers', 'searchParams', 'formData',
]);

const REQUEST_OBJECT_NAMES = new Set([
  'req', 'request', 'ctx', 'context', 'event',
]);

/**
 * `fetch`        -> bare global call
 * `axios.<verb>` -> property access on `axios`
 * `got` / `got.<verb>` / `request(...)`
 */
function classifyCallee(callee: ts.Expression): { kind: 'fetch' | 'axios' | 'got' | 'request'; label: string } | null {
  if (ts.isIdentifier(callee)) {
    if (callee.text === 'fetch')   return { kind: 'fetch',   label: 'fetch' };
    if (callee.text === 'got')     return { kind: 'got',     label: 'got' };
    if (callee.text === 'request') return { kind: 'request', label: 'request' };
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const obj = callee.expression.text;
    const prop = callee.name.text;
    if (obj === 'globalThis' && prop === 'fetch') return { kind: 'fetch', label: 'globalThis.fetch' };
    if (obj === 'axios') return { kind: 'axios', label: `axios.${prop}` };
    if (obj === 'got' && (prop === 'get' || prop === 'post' || prop === 'put' || prop === 'delete' || prop === 'patch')) {
      return { kind: 'got', label: `got.${prop}` };
    }
  }
  return null;
}

/**
 * Did this expression read a property from a request-like object?
 * Walks chains so `req.query.url`, `request.params.user`, `event.body.target`
 * are all caught.
 */
function isUserInputAccess(expr: ts.Expression): string | null {
  let cur: ts.Expression = expr;
  // Strip optional `as` casts and parentheses.
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression as ts.Expression;
  }
  while (ts.isPropertyAccessExpression(cur)) {
    cur = cur.expression as ts.Expression;
  }
  if (ts.isCallExpression(cur)) {
    // Patterns like `(await req.json()).url` or `searchParams.get('url')`.
    return null;
  }
  if (ts.isIdentifier(cur) && REQUEST_OBJECT_NAMES.has(cur.text)) {
    // Check intermediate property segment for known user-input names.
    let walk: ts.Expression = expr;
    while (ts.isPropertyAccessExpression(walk)) {
      if (USER_INPUT_PROPS.has(walk.name.text)) return `${cur.text}.${walk.name.text}`;
      walk = walk.expression as ts.Expression;
    }
  }
  return null;
}

/** `await req.json()` / `req.body` / `await request.json()` / `searchParams.get(...)`. */
function isUserInputExpression(expr: ts.Expression): string | null {
  let cur: ts.Expression = expr;
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression as ts.Expression;
  }
  if (ts.isAwaitExpression(cur)) {
    const inner = cur.expression;
    if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression)) {
      const obj = inner.expression.expression;
      const method = inner.expression.name.text;
      if (ts.isIdentifier(obj) && REQUEST_OBJECT_NAMES.has(obj.text)
          && (method === 'json' || method === 'formData' || method === 'text')) {
        return `${obj.text}.${method}()`;
      }
    }
  }
  if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    // searchParams.get('url') / url.searchParams.get('url')
    const method = cur.expression.name.text;
    if (method === 'get') {
      let host: ts.Expression = cur.expression.expression;
      while (ts.isPropertyAccessExpression(host)) host = host.expression as ts.Expression;
      if (ts.isIdentifier(host) && (host.text === 'searchParams' || host.text === 'url' || REQUEST_OBJECT_NAMES.has(host.text))) {
        return `${host.text}.get(...)`;
      }
    }
  }
  return isUserInputAccess(cur);
}

/** name -> origin label, e.g. 'req.json()'. */
type TaintMap = Map<string, string>;

/**
 * Like `isUserInputExpression` but also looks through `??` / `||`
 * defaulting and `+` concatenation so `target ?? ''` taints `target`.
 */
function isUserInputExpressionOrDefault(expr: ts.Expression): string | null {
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken
     || op === ts.SyntaxKind.BarBarToken
     || op === ts.SyntaxKind.PlusToken) {
      return isUserInputExpressionOrDefault(expr.left)
          ?? isUserInputExpressionOrDefault(expr.right);
    }
  }
  return isUserInputExpression(expr);
}

function collectTaintedIdentifiersInFunction(body: ts.Node): TaintMap {
  const tainted: TaintMap = new Map();
  const visit = (n: ts.Node): void => {
    // const X = (taint); / let X = (taint);
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      const origin = isUserInputExpressionOrDefault(n.initializer);
      if (origin) tainted.set(n.name.text, origin);
    }
    // const { X } = await req.json(); / const { X, Y } = req.body;
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isObjectBindingPattern(n.name)) {
      const origin = isUserInputExpressionOrDefault(n.initializer);
      if (origin) {
        for (const elt of n.name.elements) {
          if (ts.isIdentifier(elt.name)) tainted.set(elt.name.text, origin);
        }
      }
    }
    // X = (taint);
    if (ts.isBinaryExpression(n)
        && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(n.left)) {
      const origin = isUserInputExpressionOrDefault(n.right);
      if (origin) tainted.set(n.left.text, origin);
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return tainted;
}

const EMPTY_TAINT: TaintMap = new Map();

function classifyArgument(arg: ts.Expression, taintMap: TaintMap): string | null {
  let cur: ts.Expression = arg;
  while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression as ts.Expression;
  }
  // Template literal with substitutions — tainted only if at least one
  // substitution is itself a user-input source. A purely env-driven
  // template (`${SERVICE_HOST}/internal`) stays silent.
  if (ts.isTemplateExpression(cur)) {
    for (const span of cur.templateSpans) {
      const inner = classifyArgument(span.expression, taintMap);
      if (inner) return `template-interpolating-${inner}`;
    }
    return null;
  }
  if (ts.isStringLiteralLike(cur)) return null;                // static URL — safe
  if (ts.isNoSubstitutionTemplateLiteral(cur)) return null;    // static URL — safe
  // Direct property access of a user-input shape
  const direct = isUserInputExpression(cur);
  if (direct) return direct;
  // Identifier that the function body tainted
  if (ts.isIdentifier(cur)) {
    const origin = taintMap.get(cur.text);
    if (origin) return origin;
  }
  // Property access whose root is a tainted identifier: `body.url` where
  // `body = await req.json()`. Walks the access chain to the root and
  // checks the taint map.
  if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
    let root: ts.Expression = cur;
    while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) {
      root = root.expression as ts.Expression;
    }
    if (ts.isIdentifier(root)) {
      const origin = taintMap.get(root.text);
      if (origin) return origin;
    }
  }
  // Binary string concat: 'https://x/' + userVar
  // Also nullish-coalesce / logical-or defaulting: `target ?? ''` —
  // if either side is tainted, the whole thing is tainted.
  if (ts.isBinaryExpression(cur)) {
    const op = cur.operatorToken.kind;
    if (op === ts.SyntaxKind.PlusToken
     || op === ts.SyntaxKind.QuestionQuestionToken
     || op === ts.SyntaxKind.BarBarToken) {
      const l = classifyArgument(cur.left,  taintMap);
      const r = classifyArgument(cur.right, taintMap);
      return l ?? r;
    }
  }
  // Tainted via initializer that itself contained a user-input call:
  // `const target = req.nextUrl.searchParams.get('url') ?? '';`
  // We also accept the initializer being a CallExpression that maps
  // to isUserInputExpression — keep this last so the cheaper checks win.
  const indirect = isUserInputExpression(cur);
  if (indirect) return indirect;
  return null;
}

interface SsrfHit {
  line: number;
  column: number;
  start: number;
  end: number;
  callee: string;
  source: string;
}

/**
 * Walks each function-like body, computes its local taint map, and emits
 * a hit for every fetch-shaped call whose URL argument is tainted. Bare
 * top-level calls (not inside any function) are scanned against an empty
 * taint map — they only trigger on direct user-input access or template
 * literals, since there's nowhere for taint to flow from.
 */
function findSsrfSinks(sf: ts.SourceFile): SsrfHit[] {
  const hits: SsrfHit[] = [];

  function scanBody(body: ts.Node, taintMap: TaintMap): void {
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const kind = classifyCallee(n.expression);
        if (kind && n.arguments.length > 0) {
          const reason = classifyArgument(n.arguments[0], taintMap);
          if (reason) {
            const start = n.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(start);
            hits.push({
              line: lc.line + 1,
              column: lc.character + 1,
              start,
              end: n.getEnd(),
              callee: kind.label,
              source: reason,
            });
          }
        }
      }
      // Don't recurse into nested function-likes here — they get their
      // own taint scope in the outer walk.
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
          || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
          || ts.isConstructorDeclaration(n)) {
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
  }

  const walkFunctions = (n: ts.Node): void => {
    const isFn = ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
              || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
              || ts.isConstructorDeclaration(n);
    if (isFn) {
      const body = (n as ts.FunctionLikeDeclaration).body;
      if (body && ts.isBlock(body)) {
        const taintMap = collectTaintedIdentifiersInFunction(body);
        scanBody(body, taintMap);
      }
    }
    ts.forEachChild(n, walkFunctions);
  };

  // Top-level pass: empty taint map, only direct-access or template hits.
  scanBody(sf, EMPTY_TAINT);
  // Per-function pass: each function-like gets its own taint scope.
  walkFunctions(sf);
  return hits;
}

export const vibeSsrfFetchUserInput: Rule = {
  id: 'vibe-ssrf-fetch-user-input',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'fetch / axios call uses a user-controlled URL without a host allowlist',
  whyItMatters:
    'Server-Side Request Forgery (SSRF) is the canonical "I let users tell me where to ' +
    'go" footgun. A handler that takes a URL from req.body / req.query / req.params and ' +
    'passes it to fetch() lets attackers reach cloud-metadata endpoints, internal services, ' +
    'and admin dashboards behind the gateway. Tenzai 2025 found this pattern in every one ' +
    'of 5 AI coding agents on the same feature type — it\'s the most reliable SSRF source ' +
    'in vibe-coded apps.',
  citation: 'https://codemore.dev/rules/vibe-ssrf-fetch-user-input',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findSsrfSinks(ctx.sourceFile)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `tainted-${hit.source}`,
        },
        whyItMatters:
          `${hit.callee}(...) is called with a URL sourced from \`${hit.source}\`. ` +
          `An attacker can point the request at AWS / GCP metadata endpoints ` +
          `(169.254.169.254), localhost services, or anywhere on your private network. ` +
          `Add a host allowlist before issuing the request.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two things to do before the fetch:\n\n` +
            `  // 1. Parse the URL with WHATWG URL — anything malformed throws.\n` +
            `  const target = new URL(userUrl);\n\n` +
            `  // 2. Enforce an allowlist:\n` +
            `  const ALLOWED_HOSTS = new Set(['api.example.com', 'cdn.example.com']);\n` +
            `  if (!ALLOWED_HOSTS.has(target.host)) {\n` +
            `    return new Response('Forbidden host', { status: 400 });\n` +
            `  }\n\n` +
            `  // 3. (Optional) Block private CIDRs explicitly:\n` +
            `  // const ip = await resolve(target.hostname);\n` +
            `  // if (isPrivateOrLocal(ip)) return 400;\n\n` +
            `If you genuinely need an open URL proxy (e.g. a public scraper), ` +
            `move the fetch behind a sandboxed worker without metadata-IP access and ` +
            `suppress with a Reason comment.`,
          verificationCriteria: [
            'The URL is parsed with `new URL(...)` and the host is allowlist-checked before fetch',
            'OR the value is documented as safe via a Reason-prefixed suppression',
            'Re-scan reports vibe-ssrf-fetch-user-input resolved for the call site',
          ],
        },
      });
    }
    return findings;
  },
};
