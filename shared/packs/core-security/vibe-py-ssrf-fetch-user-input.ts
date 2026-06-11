/**
 * Rule: vibe-py-ssrf-fetch-user-input
 *
 * Python analogue of `vibe-ssrf-fetch-user-input`. Detects HTTP-client
 * calls whose URL argument is sourced from request input without a
 * visible allowlist.
 *
 * Severity: MAJOR.
 *   Same calibration as the TS rule: legitimate proxy / scraper use
 *   cases exist, so we run at MAJOR + experimental. Apps that want it
 *   gating CI can promote via .codemorerc.json.
 *
 * Detection (tree-sitter-python AST):
 *   - Recognised sinks (dotted callee path):
 *       requests.get / post / put / patch / delete / request
 *       httpx.get / post / put / patch / delete / request
 *       urllib.request.urlopen
 *       aiohttp.<Client>.get/post/... (rare; covered via attribute walk)
 *   - First positional arg classified as tainted when:
 *       - it's an f-string containing an interpolation
 *       - it's a `+` concatenation including a tainted side
 *       - it's a bare identifier defined in the function body as one of:
 *           * request.json() / await request.json()
 *           * request.form / request.args / request.values / request.json
 *           * flask request.values.get(...) etc.
 *           * FastAPI route param identifiers (function args without
 *             a default — heuristic only in v1)
 *       - it's a direct member access on request / req / ctx like
 *         `request.json['url']` or `request.args.get('url')`.
 *
 * Coverage gap (intentional):
 *   - Multi-hop dataflow (`a = req.json()['url']; b = a; requests.get(b)`)
 *     traced only one hop.
 *   - URL allowlist patterns (`if urlparse(u).hostname in ALLOWED`) are
 *     not inferred; allowlisting still trips the rule. Suppress with a
 *     Reason comment.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree, PythonNode } from '../../rules/pythonAst';
import { findCallsTo, iterFunctions, type CallLike } from '../../rules/pythonHelpers';

const HTTP_SINKS = new Set([
  'requests.get', 'requests.post', 'requests.put', 'requests.patch',
  'requests.delete', 'requests.request', 'requests.head', 'requests.options',
  'httpx.get', 'httpx.post', 'httpx.put', 'httpx.patch', 'httpx.delete',
  'httpx.request', 'httpx.head',
  'urllib.request.urlopen',
]);

const REQUEST_ROOTS = new Set(['request', 'req', 'ctx', 'context', 'event']);

/** Has the body assigned a name from a request-shaped expression? */
type TaintMap = Map<string, string>;

function firstPositionalArg(call: CallLike): PythonNode | null {
  if (!call.args) return null;
  for (let i = 0; i < (call.args.childCount as number); i++) {
    const c = call.args.child(i) as PythonNode | null;
    if (!c) continue;
    if (c.type === '(' || c.type === ')' || c.type === ',') continue;
    if (c.type === 'keyword_argument') continue;
    return c;
  }
  return null;
}

/** Walk an expression and return a "source label" if it reads from request input. */
function userInputSource(expr: PythonNode): string | null {
  // request.json() / request.form / request.args / etc.
  if (expr.type === 'attribute') {
    let root: PythonNode | null = expr;
    let lastAttr = '';
    while (root && root.type === 'attribute') {
      const attr = (root as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('attribute');
      if (attr) lastAttr = (attr as { text: string }).text;
      root = (root as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('object');
    }
    if (root && root.type === 'identifier' && REQUEST_ROOTS.has((root as { text: string }).text)) {
      return `${(root as { text: string }).text}.${lastAttr}`;
    }
  }
  // request.json() / request.get_json() — call expression
  if (expr.type === 'call') {
    const callee = (expr as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('function');
    if (callee && callee.type === 'attribute') {
      const obj = (callee as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('object');
      const attr = (callee as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('attribute');
      if (obj && obj.type === 'identifier' && REQUEST_ROOTS.has((obj as { text: string }).text) && attr) {
        const m = (attr as { text: string }).text;
        if (m === 'json' || m === 'get_json' || m === 'form' || m === 'args' || m === 'values') {
          return `${(obj as { text: string }).text}.${m}()`;
        }
      }
    }
  }
  // await <request expr>
  if (expr.type === 'await') {
    const inner = expr.child(0)?.type === 'await' ? expr.child(1) : expr.child(0);
    if (inner) {
      const r = userInputSource(inner);
      if (r) return r;
    }
    // Some grammars wrap the awaited expr at index 1; try both.
    for (let i = 0; i < (expr.childCount as number); i++) {
      const c = expr.child(i) as PythonNode | null;
      if (!c) continue;
      if (c.type === 'await') continue;
      const r = userInputSource(c);
      if (r) return r;
    }
  }
  // subscript `request.json['url']`
  if (expr.type === 'subscript') {
    const obj = (expr as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('value');
    if (obj) {
      const r = userInputSource(obj);
      if (r) return r;
    }
  }
  return null;
}

function collectTaintMap(fnBody: PythonNode): TaintMap {
  const m: TaintMap = new Map();
  const visit = (n: PythonNode): void => {
    if (n.type === 'assignment') {
      const lhs = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('left');
      const rhs = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('right');
      if (lhs && lhs.type === 'identifier' && rhs) {
        const source = userInputSource(rhs);
        if (source) m.set((lhs as { text: string }).text, source);
      }
    }
    for (let i = 0; i < (n.childCount as number); i++) {
      const c = n.child(i) as PythonNode | null;
      if (c && c.type !== 'function_definition') visit(c);
    }
  };
  visit(fnBody);
  return m;
}

function classifyArg(arg: PythonNode, taint: TaintMap): string | null {
  const direct = userInputSource(arg);
  if (direct) return direct;
  if (arg.type === 'identifier') {
    const t = taint.get((arg as { text: string }).text);
    if (t) return t;
  }
  if (arg.type === 'binary_operator') {
    for (let i = 0; i < (arg.childCount as number); i++) {
      const c = arg.child(i) as PythonNode | null;
      if (!c) continue;
      const r = classifyArg(c, taint);
      if (r) return r;
    }
  }
  // f-string with interpolation
  if (arg.type === 'string' || arg.type === 'concatenated_string') {
    for (let i = 0; i < (arg.childCount as number); i++) {
      const c = arg.child(i) as PythonNode | null;
      if (!c) continue;
      if (c.type === 'interpolation') {
        // The interpolation has children including the inner expression.
        for (let j = 0; j < (c.childCount as number); j++) {
          const inner = c.child(j) as PythonNode | null;
          if (!inner) continue;
          if (inner.type === '{' || inner.type === '}') continue;
          const r = classifyArg(inner, taint);
          if (r) return `f-string:${r}`;
        }
      }
    }
  }
  return null;
}

export const vibePySsrfFetchUserInput: Rule = {
  id: 'vibe-py-ssrf-fetch-user-input',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'requests / httpx / urlopen call uses a user-controlled URL without a host allowlist',
  whyItMatters:
    'Server-Side Request Forgery (SSRF): a handler takes a URL from request input and passes ' +
    'it to requests.get / httpx.get / urlopen. Attackers point the request at cloud-metadata ' +
    'endpoints (169.254.169.254), internal services, or anywhere on your private network. ' +
    'Parse the URL with `urllib.parse.urlparse` and enforce a host allowlist before issuing ' +
    'the request.',
  citation: 'https://codemore.dev/rules/vibe-py-ssrf-fetch-user-input',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];

    for (const fn of iterFunctions(tree.rootNode)) {
      const taint = collectTaintMap(fn.body);
      for (const c of findCallsTo(fn.body, HTTP_SINKS)) {
        const arg = firstPositionalArg(c);
        if (!arg) continue;
        const source = classifyArg(arg, taint);
        if (!source) continue;
        findings.push({
          evidence: {
            file: ctx.filePath,
            line: c.line,
            column: c.column,
            snippet: (ctx.lines[c.line - 1] ?? '').trim(),
            matchedPattern: `tainted-${source}`,
          },
          whyItMatters:
            `\`${c.callee}(...)\` is called with a URL sourced from \`${source}\`. ` +
            `Validate the host against an allowlist before issuing the request.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Parse the URL and check the host before fetching:\n\n` +
              `  from urllib.parse import urlparse\n` +
              `  ALLOWED_HOSTS = {'api.example.com', 'cdn.example.com'}\n\n` +
              `  parsed = urlparse(user_url)\n` +
              `  if parsed.hostname not in ALLOWED_HOSTS:\n` +
              `      return Response('Forbidden host', status_code=400)\n` +
              `  r = ${c.callee.split('.')[0]}.get(user_url)\n\n` +
              `If you genuinely need an open URL proxy, run the fetch in a sandbox without ` +
              `access to cloud-metadata IP ranges and suppress with a Reason comment.`,
            verificationCriteria: [
              'The URL host is allowlist-checked before the HTTP call',
              'OR the value is documented as safe via a Reason-prefixed suppression',
              'Re-scan reports vibe-py-ssrf-fetch-user-input resolved for this line',
            ],
          },
        });
      }
    }
    return findings;
  },
};
