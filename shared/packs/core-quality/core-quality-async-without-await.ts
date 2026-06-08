/**
 * Rule: core-quality-async-without-await
 *
 * Detects `async function` / `async (…) => …` / `async method()` whose
 * body never uses `await`. The function returns a Promise wrapping the
 * synchronous return value, which:
 *
 *   1. Forces every caller to write `await` or `.then()` for no benefit.
 *   2. Hides the synchronous shape from anyone reading the signature.
 *   3. Is a frequent AI-tool artefact when the LLM marks a helper async
 *      "to be safe" without checking whether it actually does any I/O.
 *
 * Severity: MINOR. Each one is a code-smell rather than a bug, but the
 * inventory adds up — vibe-coded apps accumulate dozens of these.
 *
 * Coverage (single-file, brace-matched):
 *   - `async function name(...) { ... }` (function declaration)
 *   - `async function (...) { ... }` (function expression)
 *   - `async (...) => { ... }` (arrow with block body)
 *   - `async name(...) { ... }` (class method shorthand)
 *
 * Coverage gap:
 *   - Arrow with expression body (`async (x) => x`) is flagged when the
 *     expression doesn't contain `await` — which is by definition. To
 *     reduce noise, expression-body arrows are not flagged at all.
 *   - We cannot resolve `await` introduced by sub-functions (nested
 *     definitions that the outer async function returns and the inner
 *     awaits) — those are flagged. v1.1 with AST awareness handles it.
 */

/* codemore-ignore-file: core-quality-async-without-await */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findAsyncWithoutAwait } from '../../rules/astHelpers';

// Match the HEADER of an async function up to its closing param `)`. The
// body brace is found by `findBodyBraceAfter()` below — it walks forward
// from the closing `)`, skipping balanced `<...>` (so a return-type like
// `Promise<{ id: string }>` doesn't get mistaken for the body brace).
const ASYNC_FN_DECL_RE = /\basync\s+function\s*\*?\s*[A-Za-z_$][\w$]*\s*\([^)]*\)/g;
const ASYNC_FN_EXPR_RE = /\basync\s+function\s*\*?\s*\([^)]*\)/g;
// async arrow with block body: walk from after the params/single ident
// looking for `=>` then the body `{`.
const ASYNC_ARROW_RE   = /\basync\s+(?:\([^)]*\)|[A-Za-z_$][\w$]*)/g;
// class method: `async name(...)` preceded by class-keyword or statement boundary.
const ASYNC_METHOD_RE  = /(?:^|[;\{\n])(?:\s*(?:public|private|protected|static|readonly)\s+)*\s*async\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)/g;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function stripCommentsAndStrings(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

/**
 * Walk forward from `startIdx` (typically just past a closing `)` or single
 * arrow-ident) looking for the actual function body `{`. Skips balanced
 * `<...>` (return-type annotations like `Promise<{ id: string }>`) and
 * `(...)` (default-value parens), so the `{` inside a return-type doesn't
 * get mistaken for the body brace. Returns -1 if no body brace is found.
 *
 * For arrows we also accept `=>` as an intermediate token — the body brace
 * sits after the arrow. If `=>` is found without a following `{` (expression
 * body), we return -1 so the caller skips the match.
 */
function findBodyBraceAfter(sanitised: string, startIdx: number, requireArrow: boolean): number {
  let i = startIdx;
  let angleDepth = 0;
  let parenDepth = 0;
  let sawArrow = !requireArrow;
  while (i < sanitised.length) {
    const c = sanitised[i];
    const c2 = sanitised[i + 1];
    if (c === '<') { angleDepth++; i++; continue; }
    if (c === '>') { if (angleDepth > 0) angleDepth--; i++; continue; }
    if (c === '(' && angleDepth === 0) { parenDepth++; i++; continue; }
    if (c === ')' && angleDepth === 0) { if (parenDepth > 0) parenDepth--; i++; continue; }
    if (angleDepth === 0 && parenDepth === 0) {
      if (requireArrow && c === '=' && c2 === '>') { sawArrow = true; i += 2; continue; }
      if (sawArrow && c === '{') return i;
      // Anything else at top level (a `;`, a non-block token, etc.) means
      // we missed the body — bail.
      if (c === ';' || c === '\n' || c === ',') {
        if (requireArrow && !sawArrow) return -1;
      }
    }
    i++;
  }
  return -1;
}

/**
 * Given the index of the OPENING `{` of a function body, brace-balance
 * forward to find the matching close. Returns the body substring.
 */
function extractBody(sanitised: string, openBraceIdx: number): { body: string; closeIdx: number } | null {
  if (sanitised[openBraceIdx] !== '{') return null;
  let depth = 0;
  for (let i = openBraceIdx; i < sanitised.length; i++) {
    const c = sanitised[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return { body: sanitised.slice(openBraceIdx + 1, i), closeIdx: i };
      }
    }
  }
  return null;
}

const HAS_AWAIT_RE = /\bawait\b/;
const HAS_FOR_AWAIT_RE = /\bfor\s+await\b/;

export const coreQualityAsyncWithoutAwait: Rule = {
  id: 'core-quality-async-without-await',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'code-smell',
  defaultSeverity: 'MINOR',
  defaultConfidence: 0.8,
  title: '`async` function with no `await` in its body',
  whyItMatters:
    'An `async` function whose body never uses `await` returns a Promise wrapping a synchronous ' +
    'value, forcing every caller to `await` (or `.then`) for no actual asynchrony. The signature ' +
    'lies about whether I/O happens, and any caller that forgets the `await` silently gets a ' +
    'Promise object instead of the value. AI-generated code marks helpers async "to be safe" ' +
    'when it has no idea whether the helper does I/O — this rule surfaces those.',
  citation: 'https://codemore.dev/rules/core-quality-async-without-await',

  detect(ctx: RuleContext): RuleFinding[] {
    // AST path — exact, no regex edge cases. Skips nested function bodies
    // correctly (an inner await doesn't satisfy the outer async).
    if (ctx.sourceFile) {
      const findings: RuleFinding[] = [];
      for (const hit of findAsyncWithoutAwait(ctx.sourceFile)) {
        const snippet = (ctx.lines[hit.line - 1] ?? '').trim();
        findings.push({
          evidence: {
            file: ctx.filePath,
            line: hit.line,
            column: hit.column,
            snippet,
            matchedPattern: `async-without-await:${hit.kind}`,
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              'Either drop the `async` keyword (the function is synchronous), or add the missing ' +
              '`await`. If the function MUST stay async for an interface contract (e.g. it implements ' +
              'a method that other implementations DO await), suppress with a comment that names the ' +
              'interface and explains why.',
            verificationCriteria: [
              'The function either uses `await` in its body OR is no longer marked async',
              'All callers continue to work (either they already awaited, or no longer need to)',
              'Re-scan reports core-quality-async-without-await resolved for this function',
            ],
          },
        });
      }
      return findings;
    }

    // Regex fallback for environments where the TS parser couldn't load
    // a SourceFile (extremely rare; the walker always populates it for
    // .ts/.tsx/.js/.jsx/.mjs/.cjs).
    const sanitised = stripCommentsAndStrings(ctx.content);
    const findings: RuleFinding[] = [];

    // Each header regex matches up to and including the closing `)` of the
    // params (for arrow with single-ident params, it matches the ident).
    // We then walk forward — skipping balanced `<...>` and `(...)` — to find
    // the actual body brace. For arrows, that walk must pass `=>` first.
    const allHeaders: Array<{ headerStart: number; openBraceIdx: number }> = [];
    const collect = (re: RegExp, requireArrow: boolean) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sanitised)) !== null) {
        const afterMatch = m.index + m[0].length;
        const openBraceIdx = findBodyBraceAfter(sanitised, afterMatch, requireArrow);
        if (openBraceIdx >= 0) allHeaders.push({ headerStart: m.index, openBraceIdx });
      }
    };
    collect(ASYNC_FN_DECL_RE, false);
    collect(ASYNC_FN_EXPR_RE, false);
    collect(ASYNC_ARROW_RE,   true);
    collect(ASYNC_METHOD_RE,  false);

    // Sort by headerStart so we can dedupe overlapping matches (method regex
    // can overlap with the function-decl/expr regexes).
    allHeaders.sort((a, b) => a.headerStart - b.headerStart);
    const seenOpenBrace = new Set<number>();

    for (const { headerStart, openBraceIdx } of allHeaders) {
      if (seenOpenBrace.has(openBraceIdx)) continue;
      seenOpenBrace.add(openBraceIdx);

      const body = extractBody(sanitised, openBraceIdx);
      if (!body) continue;
      // `for await` would have triggered HAS_AWAIT_RE too, but be explicit.
      if (HAS_AWAIT_RE.test(body.body) || HAS_FOR_AWAIT_RE.test(body.body)) continue;

      const line = lineForOffset(ctx.content, headerStart);
      const snippet = (ctx.lines[line - 1] ?? '').trim();

      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet,
          matchedPattern: 'async-without-await',
        },
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Either drop the `async` keyword (the function is synchronous), or add the missing ' +
            '`await`:\n\n' +
            '  // (a) The function is genuinely synchronous — drop async:\n' +
            '  function compute(x: number): number { return x * 2; }\n\n' +
            '  // (b) The function should await something it currently does not:\n' +
            '  async function fetchAndCompute(id: string) {\n' +
            '    const v = await db.get(id);\n' +
            '    return v * 2;\n' +
            '  }\n\n' +
            'If the function MUST stay async for an interface contract (e.g. it implements a ' +
            'method that other implementations DO await), suppress with a comment that names ' +
            'the interface and explains why.',
          verificationCriteria: [
            'The function either uses `await` in its body OR is no longer marked async',
            'All callers continue to work (either they already awaited, or no longer need to)',
            'Re-scan reports core-quality-async-without-await resolved for this function',
          ],
        },
      });
    }

    return findings;
  },
};
