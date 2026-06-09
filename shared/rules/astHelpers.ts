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

// ---------------------------------------------------------------------------
// Pivot-debris helpers (Phase 2A)
// ---------------------------------------------------------------------------

export interface UnreachableHit extends AstHit {
  /** Why this statement is unreachable — for the finding's whyItMatters. */
  reason: 'after-return' | 'after-throw' | 'after-break' | 'after-continue' | 'after-process-exit';
}

/**
 * Statements that can never run because a prior statement in the same
 * block always exits. Catches the classic pivot artifact:
 *
 *   function foo() {
 *     return result;
 *     cleanup();       // ← dead, left over from a removed branch
 *   }
 *
 * We only walk straight-line code inside Block nodes; nested branches
 * (if/for/switch/try) are visited recursively but unreachable-detection
 * doesn't span statement boundaries beyond a block.
 */
export function findUnreachableStatements(sf: ts.SourceFile): UnreachableHit[] {
  const hits: UnreachableHit[] = [];

  function isProcessExitCall(stmt: ts.Statement): boolean {
    if (!ts.isExpressionStatement(stmt)) return false;
    const expr = stmt.expression;
    if (!ts.isCallExpression(expr)) return false;
    const callee = expr.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const obj = callee.expression;
      const prop = callee.name.text;
      if (prop === 'exit' && ts.isIdentifier(obj) && obj.text === 'process') return true;
    }
    return false;
  }

  function classifyTerminator(stmt: ts.Statement): UnreachableHit['reason'] | null {
    if (ts.isReturnStatement(stmt))   return 'after-return';
    if (ts.isThrowStatement(stmt))    return 'after-throw';
    if (ts.isBreakStatement(stmt))    return 'after-break';
    if (ts.isContinueStatement(stmt)) return 'after-continue';
    if (isProcessExitCall(stmt))      return 'after-process-exit';
    return null;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      const statements = ts.isBlock(node) ? node.statements : (node as ts.SourceFile).statements;
      for (let i = 0; i < statements.length - 1; i++) {
        const reason = classifyTerminator(statements[i]);
        if (reason) {
          // Flag the FIRST unreachable statement (compresses noise).
          const dead = statements[i + 1];
          // Skip declaration-style dead code that hoists (function decls,
          // var declarations). They're not "dead" in the same way.
          if (ts.isFunctionDeclaration(dead) || (ts.isVariableStatement(dead)
              && dead.declarationList.flags === ts.NodeFlags.None)) {
            continue;
          }
          const start = dead.getStart(sf);
          const lc = sf.getLineAndCharacterOfPosition(start);
          hits.push({
            line: lc.line + 1,
            column: lc.character + 1,
            start,
            end: dead.getEnd(),
            reason,
          });
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export type DeadConditionalKind = 'literal-true' | 'literal-false' | 'tautological-eq' | 'always-falsy-eq';

export interface DeadConditionalHit extends AstHit {
  kind: DeadConditionalKind;
  /** Source text of the condition for the why-it-matters body. */
  conditionText: string;
}

/**
 * `if (...)` whose condition is trivially constant: `if (true)`, `if (false)`,
 * `if (1 === 1)`, `if ('x' === 'y')`. Pure pivot debris — the developer
 * wrapped code in a conditional, then changed their mind about the gate
 * but kept the wrapper.
 *
 * We intentionally do NOT flag `if (env === 'dev')` style — that's runtime
 * config, not a constant. We DO flag `if (false)` / `if (0)` / `if ('1')`.
 */
export function findDeadConditionals(sf: ts.SourceFile): DeadConditionalHit[] {
  const hits: DeadConditionalHit[] = [];

  const TAUTOLOGICAL_OPS = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ]);

  function classify(expr: ts.Expression): DeadConditionalKind | null {
    // `if (true)` / `if (false)` literal
    if (expr.kind === ts.SyntaxKind.TrueKeyword)  return 'literal-true';
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return 'literal-false';

    // Numeric / string literal: `if (0)`, `if (1)`, `if ('')`, `if ('x')`
    if (ts.isNumericLiteral(expr) || ts.isStringLiteralLike(expr)) {
      const raw = expr.getText(sf);
      const truthy = raw !== '0' && raw !== "''" && raw !== '""' && raw !== '``';
      return truthy ? 'literal-true' : 'literal-false';
    }

    // `if (X === X)` / `if (1 === 1)` etc. — both sides identical literals
    // or identical identifiers.
    if (ts.isBinaryExpression(expr) && TAUTOLOGICAL_OPS.has(expr.operatorToken.kind)) {
      const l = expr.left.getText(sf), r = expr.right.getText(sf);
      if (l === r) {
        const equality = expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
                      || expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
        return equality ? 'tautological-eq' : 'always-falsy-eq';
      }
    }
    return null;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) {
      const kind = classify(node.expression);
      if (kind) {
        const start = node.getStart(sf);
        const lc = sf.getLineAndCharacterOfPosition(start);
        hits.push({
          line: lc.line + 1,
          column: lc.character + 1,
          start,
          end: node.getEnd(),
          kind,
          conditionText: node.expression.getText(sf),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export interface UnusedVariableHit extends AstHit {
  name: string;
  kind: 'const' | 'let' | 'var';
}

function isDeclarationName(id: ts.Identifier): boolean {
  const p = id.parent as ts.Node | undefined;
  if (!p) return false;
  if (ts.isVariableDeclaration(p) && p.name === id) return true;
  if (ts.isParameter(p) && p.name === id) return true;
  if (ts.isBindingElement(p) && p.name === id) return true;
  if (ts.isFunctionDeclaration(p) && p.name === id) return true;
  if (ts.isClassDeclaration(p) && p.name === id) return true;
  if (ts.isInterfaceDeclaration(p) && p.name === id) return true;
  if (ts.isTypeAliasDeclaration(p) && p.name === id) return true;
  if (ts.isEnumDeclaration(p) && p.name === id) return true;
  if (ts.isImportClause(p) && p.name === id) return true;
  if (ts.isNamespaceImport(p) && p.name === id) return true;
  if (ts.isImportSpecifier(p) && (p.name === id || p.propertyName === id)) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return true;
  if (ts.isQualifiedName(p) && p.right === id) return true;
  if (ts.isPropertyAssignment(p) && p.name === id) return true;
  if (ts.isMethodDeclaration(p) && p.name === id) return true;
  if (ts.isPropertyDeclaration(p) && p.name === id) return true;
  if (ts.isPropertySignature(p) && p.name === id) return true;
  if (ts.isMethodSignature(p) && p.name === id) return true;
  return false;
}

/**
 * Pre-pass: walk the SourceFile collecting every Identifier "use" — i.e.
 * an identifier reference that is NOT itself the declaring name of its
 * parent. Returns a multiset (name -> count).
 *
 * Conservative on purpose: shorthand property assignments `{ foo }` count
 * as a USE of `foo`. Type-position identifiers (e.g. `as Foo`, `Foo[]`)
 * also count, since their Identifier survives the AST traversal.
 *
 * Cross-scope collision: if `const x` appears in two different functions
 * and one is used, both are considered "used" here. That under-reports
 * (false negatives) which is the safe direction for an experimental
 * pivot-debris rule.
 */
function collectIdentifierUses(sf: ts.SourceFile): Map<string, number> {
  const used = new Map<string, number>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && !isDeclarationName(n)) {
      used.set(n.text, (used.get(n.text) ?? 0) + 1);
    }
    if (ts.isShorthandPropertyAssignment(n)) {
      used.set(n.name.text, (used.get(n.name.text) ?? 0) + 1);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return used;
}

/**
 * Find locally-declared `const` / `let` / `var` whose name is never read
 * elsewhere in the same file. Pure pivot debris in vibe-coded apps: the
 * variable name (`oldServiceRoleKey`, `legacyAuthToken`) often reveals a
 * removed feature.
 *
 * Skip rules (kept generous to stay quiet on false positives):
 *   - Names prefixed with `_` (TS convention for deliberately unused).
 *   - Exported declarations (`export const x = …`).
 *   - Destructuring patterns (`const { a, b } = …`) — too noisy.
 *   - Declarations inside ambient contexts (.d.ts files don't reach here anyway).
 *   - Declarations whose initializer has side effects (CallExpression /
 *     NewExpression / AwaitExpression at the top of the initializer).
 *     The variable is unused but the call still ran for its side effect.
 */
export function findUnusedVariables(sf: ts.SourceFile): UnusedVariableHit[] {
  const used = collectIdentifierUses(sf);
  const hits: UnusedVariableHit[] = [];

  const isSideEffectInit = (init: ts.Expression | undefined): boolean => {
    if (!init) return false;
    if (ts.isAwaitExpression(init)) return true;
    if (ts.isCallExpression(init) || ts.isNewExpression(init)) return true;
    return false;
  };

  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const name = n.name.text;
      if (!name.startsWith('_')) {
        const list = n.parent as ts.VariableDeclarationList | undefined;
        const stmt = list?.parent;
        const isExported = stmt && ts.isVariableStatement(stmt)
          && (ts.getModifiers(stmt) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!isExported && !isSideEffectInit(n.initializer)) {
          const count = used.get(name) ?? 0;
          if (count === 0) {
            let kind: UnusedVariableHit['kind'] = 'var';
            if (list && (list.flags & ts.NodeFlags.Const)) kind = 'const';
            else if (list && (list.flags & ts.NodeFlags.Let)) kind = 'let';
            const start = n.name.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(start);
            hits.push({
              line: lc.line + 1,
              column: lc.character + 1,
              start,
              end: n.name.getEnd(),
              name,
              kind,
            });
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

export interface UnusedImportHit extends AstHit {
  /** The imported binding name (default name, namespace name, or named-import name). */
  name: string;
  /** Form of the unused import. */
  kind: 'default' | 'named' | 'namespace';
  /** Module specifier (e.g. `'react'`) for the snippet hint. */
  moduleSpecifier: string;
}

/**
 * Find import bindings that are never referenced in the file. Catches
 * the classic vibe-coding pattern: a feature was ripped out, but its
 * imports stayed behind, expanding bundle size and supply-chain surface.
 *
 * Coverage:
 *   - `import Foo from 'x'`        — default binding.
 *   - `import * as Foo from 'x'`   — namespace binding.
 *   - `import { Foo, Bar } from 'x'` — each named binding checked
 *     independently; we emit one hit per unused name.
 *
 * Coverage gap (intentional):
 *   - Side-effect imports (`import 'x'`) have no binding — skipped.
 *   - Type-only imports are checked the same way; if the type is used
 *     somewhere, the Identifier survives and is counted.
 */
export function findUnusedImports(sf: ts.SourceFile): UnusedImportHit[] {
  const used = collectIdentifierUses(sf);
  const hits: UnusedImportHit[] = [];

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    const moduleSpecifier = ts.isStringLiteralLike(stmt.moduleSpecifier)
      ? stmt.moduleSpecifier.text
      : '';

    if (clause.name) {
      const name = clause.name.text;
      if ((used.get(name) ?? 0) === 0) {
        const start = clause.name.getStart(sf);
        const lc = sf.getLineAndCharacterOfPosition(start);
        hits.push({
          line: lc.line + 1,
          column: lc.character + 1,
          start,
          end: clause.name.getEnd(),
          name,
          kind: 'default',
          moduleSpecifier,
        });
      }
    }

    const bindings = clause.namedBindings;
    if (bindings) {
      if (ts.isNamespaceImport(bindings)) {
        const name = bindings.name.text;
        if ((used.get(name) ?? 0) === 0) {
          const start = bindings.name.getStart(sf);
          const lc = sf.getLineAndCharacterOfPosition(start);
          hits.push({
            line: lc.line + 1,
            column: lc.character + 1,
            start,
            end: bindings.name.getEnd(),
            name,
            kind: 'namespace',
            moduleSpecifier,
          });
        }
      } else {
        for (const spec of bindings.elements) {
          const name = spec.name.text;
          if ((used.get(name) ?? 0) === 0) {
            const start = spec.name.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(start);
            hits.push({
              line: lc.line + 1,
              column: lc.character + 1,
              start,
              end: spec.name.getEnd(),
              name,
              kind: 'named',
              moduleSpecifier,
            });
          }
        }
      }
    }
  }
  return hits;
}

export interface ComplexityHit extends AstHit {
  /** Function or method name when known ('' for anonymous). */
  name: string;
  /** Computed cyclomatic complexity. */
  complexity: number;
  kind: 'function' | 'method' | 'arrow' | 'constructor';
}

/**
 * Cyclomatic complexity per function/method. Standard McCabe count:
 *   start at 1; +1 for each if, case, &&, ||, ??, ?: , for, while,
 *   do-while, catch, for-in, for-of, conditional return-in-loop.
 *
 * Functions exceeding `threshold` (default 15) are flagged. The threshold
 * is intentionally generous — vibe-coded apps routinely hit 25-40, and we
 * don't want to drown the dashboard with mid-complexity functions.
 */
export function findHighComplexityFunctions(sf: ts.SourceFile, threshold = 15): ComplexityHit[] {
  const hits: ComplexityHit[] = [];

  const isComplexityNode = (n: ts.Node): boolean => {
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        return true;
      case ts.SyntaxKind.BinaryExpression: {
        const op = (n as ts.BinaryExpression).operatorToken.kind;
        return op === ts.SyntaxKind.AmpersandAmpersandToken
            || op === ts.SyntaxKind.BarBarToken
            || op === ts.SyntaxKind.QuestionQuestionToken;
      }
      default:
        return false;
    }
  };

  function computeFor(body: ts.Node): number {
    let count = 1;
    const visit = (n: ts.Node) => {
      if (isComplexityNode(n)) count++;
      // Don't recurse into nested function-likes — each has its own score.
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
          || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
          || ts.isConstructorDeclaration(n)) {
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
    return count;
  }

  const visit = (node: ts.Node): void => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
              || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
              || ts.isConstructorDeclaration(node);
    if (isFn) {
      const body = (node as ts.FunctionLikeDeclaration).body;
      if (body && ts.isBlock(body)) {
        const complexity = computeFor(body);
        if (complexity > threshold) {
          const start = node.getStart(sf);
          const lc = sf.getLineAndCharacterOfPosition(start);
          let name = '';
          if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
            name = node.name.getText(sf);
          }
          const kind: ComplexityHit['kind'] =
            ts.isConstructorDeclaration(node) ? 'constructor' :
            ts.isMethodDeclaration(node)      ? 'method' :
            ts.isArrowFunction(node)          ? 'arrow' :
            'function';
          hits.push({
            line: lc.line + 1,
            column: lc.character + 1,
            start,
            end: node.getEnd(),
            name,
            complexity,
            kind,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}
