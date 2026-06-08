/**
 * AST helpers — small, opinionated traversal utilities the noisier
 * regex rules can use to escape from regex edge-cases.
 *
 * Why these live here, not in a per-rule file:
 *   - Three rules (async-without-await, non-null-assertion-abuse,
 *     xss-dangerously-set) all need a shared TS-AST traversal pattern.
 *     Centralising it keeps the AST import surface (and bundle size)
 *     stable.
 *   - Rules under `shared/packs/` cannot import from `daemon/*`. So the
 *     helpers must live under `shared/`.
 *
 * Each helper is a pure function over the `ts.SourceFile` already on
 * `RuleContext.sourceFile`. They return plain JS objects so rules don't
 * need TypeScript-API knowledge to consume them.
 */

import * as ts from 'typescript';

export interface AstHit {
  /** 1-indexed line number. */
  line: number;
  /** 1-indexed column number. */
  column: number;
  /** Source offset (character index) of the start of the matched node. */
  start: number;
  /** End offset (exclusive). */
  end: number;
}

export interface AsyncWithoutAwaitHit extends AstHit {
  /** Function name when known ('' for anonymous expressions). */
  name: string;
  /** Function kind for snippet hint. */
  kind: 'function-decl' | 'function-expr' | 'arrow' | 'method';
}

function position(sf: ts.SourceFile, offset: number): { line: number; column: number } {
  const lc = sf.getLineAndCharacterOfPosition(offset);
  return { line: lc.line + 1, column: lc.character + 1 };
}

function isAsyncFn(node: ts.Node): node is ts.FunctionLikeDeclaration {
  if (!ts.isFunctionDeclaration(node) &&
      !ts.isFunctionExpression(node) &&
      !ts.isArrowFunction(node) &&
      !ts.isMethodDeclaration(node)) {
    return false;
  }
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

/**
 * Walks `fn.body` looking for an AwaitExpression. Returns true on the
 * first hit. Crucially: stops descending into NESTED function bodies —
 * an inner function's `await` doesn't satisfy the outer function's
 * async contract. That's the exact gap the regex implementation has.
 */
function bodyHasAwait(body: ts.Block | ts.Expression): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (n.kind === ts.SyntaxKind.AwaitExpression) { found = true; return; }
    // for await (...) loops
    if (ts.isForOfStatement(n) && n.awaitModifier) { found = true; return; }
    // Don't descend into nested function declarations / expressions / arrows
    // — their `await` is NOT this function's `await`.
    if (ts.isFunctionDeclaration(n) ||
        ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n) ||
        ts.isMethodDeclaration(n) ||
        ts.isAccessor(n) ||
        ts.isConstructorDeclaration(n)) {
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/**
 * Find all `async` functions whose body never `await`s anything. We
 * deliberately skip arrow functions with expression bodies (`async x => x`)
 * since `await x` IS valid in expression bodies and most expression-body
 * arrows are tiny — too noisy to flag.
 */
export function findAsyncWithoutAwait(sf: ts.SourceFile): AsyncWithoutAwaitHit[] {
  const hits: AsyncWithoutAwaitHit[] = [];

  const visit = (node: ts.Node): void => {
    if (isAsyncFn(node)) {
      const body = (node as ts.FunctionLikeDeclaration).body;
      // Skip expression-body arrows (no block); too noisy to flag.
      if (body && ts.isBlock(body)) {
        if (!bodyHasAwait(body)) {
          const start = node.getStart(sf);
          const { line, column } = position(sf, start);
          let name = '';
          if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
            name = node.name.getText(sf);
          }
          const kind: AsyncWithoutAwaitHit['kind'] =
            ts.isFunctionDeclaration(node) ? 'function-decl' :
            ts.isFunctionExpression(node)  ? 'function-expr' :
            ts.isArrowFunction(node)       ? 'arrow' :
            'method';
          hits.push({ line, column, start, end: node.getEnd(), name, kind });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/**
 * Find all non-null-assertion (`!`) expressions. The AST node is
 * `NonNullExpression` — exact, no regex edge cases. Catches trailing
 * `value!;` patterns the regex misses (no `.` or `[` after).
 */
export function findNonNullExpressions(sf: ts.SourceFile): AstHit[] {
  const hits: AstHit[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNonNullExpression(node)) {
      // The `!` token sits at node.end - 1.
      const bangOffset = node.getEnd() - 1;
      const { line, column } = position(sf, bangOffset);
      hits.push({ line, column, start: bangOffset, end: bangOffset + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export interface DangerouslySetHit extends AstHit {
  /**
   * Classification of the `__html` value.
   *   - 'literal-string' : a plain string literal (no interpolation)
   *   - 'static-svg'     : a string literal whose contents look like SVG
   *   - 'dynamic'        : anything else (identifier, call, member, template w/ ${…})
   */
  valueKind: 'literal-string' | 'static-svg' | 'dynamic';
  /** Raw text of the value expression, for the `whyItMatters` body. */
  valueText: string;
}

const PURE_SVG_RE = /^<svg\b[^]*<\/svg>$/i;

function classifyHtmlValueExpression(expr: ts.Expression, sf: ts.SourceFile): DangerouslySetHit['valueKind'] {
  if (ts.isStringLiteral(expr)) {
    const txt = expr.text.trim();
    if (PURE_SVG_RE.test(txt)) return 'static-svg';
    return 'literal-string';
  }
  if (ts.isNoSubstitutionTemplateLiteral(expr)) {
    const txt = expr.text.trim();
    if (PURE_SVG_RE.test(txt)) return 'static-svg';
    return 'literal-string';
  }
  // Anything else (TemplateExpression w/ subs, CallExpression, Identifier, etc.)
  return 'dynamic';
}

/**
 * Find every `dangerouslySetInnerHTML={{ __html: <expr> }}` attribute in
 * JSX. The AST path is exact: we don't trip on `{` inside object-literal
 * defaults or stringified JSX in test fixtures the regex stumbled on.
 *
 * Only call this when `ctx.sourceFile` is non-null AND the source is
 * `.tsx`/`.jsx` (the TS parser will accept the JSX with `Latest`).
 */
export function findDangerouslySetInnerHTML(sf: ts.SourceFile): DangerouslySetHit[] {
  const hits: DangerouslySetHit[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'dangerouslySetInnerHTML') {
      const init = node.initializer;
      if (init && ts.isJsxExpression(init) && init.expression && ts.isObjectLiteralExpression(init.expression)) {
        for (const prop of init.expression.properties) {
          if (ts.isPropertyAssignment(prop)) {
            const key = prop.name.getText(sf);
            if (key === '__html' || key === '"__html"' || key === "'__html'") {
              const valueExpr = prop.initializer;
              const start = node.getStart(sf);
              const { line, column } = position(sf, start);
              hits.push({
                line, column, start, end: node.getEnd(),
                valueKind: classifyHtmlValueExpression(valueExpr, sf),
                valueText: valueExpr.getText(sf),
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}
