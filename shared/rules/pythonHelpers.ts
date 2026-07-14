/**
 * Python AST helpers.
 *
 * Equivalent of `shared/rules/astHelpers.ts` for the Python pack. Each
 * helper is a pure function over a tree-sitter Python node (or root tree)
 * and returns plain JS objects so rules don't need to know the
 * tree-sitter API.
 *
 * Node-type names below come from the official tree-sitter-python grammar
 * (https://github.com/tree-sitter/tree-sitter-python). Keep this file's
 * coupling to that grammar narrow: rules import named helpers, not raw
 * node-type strings.
 */

import type { PythonNode, PythonTree } from './pythonAst';

export interface PyAstHit {
  /** 1-indexed line. */
  line: number;
  /** 1-indexed column. */
  column: number;
}

interface NodePos {
  /** tree-sitter exposes `startPosition.row` (0-indexed) + `endPosition.row`. */
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
}

function posOf(node: PythonNode): PyAstHit {
  const p = (node as NodePos).startPosition;
  return { line: p.row + 1, column: p.column + 1 };
}

/** Iterate every descendant of `node`. */
function* walk(node: PythonNode): IterableIterator<PythonNode> {
  yield node;
  const count = node.childCount as number;
  for (let i = 0; i < count; i++) {
    const child = node.child(i) as PythonNode | null;
    if (child) yield* walk(child);
  }
}

/** Iterate descendants but skip the subtree under any node satisfying `cutoff`. */
function* walkExcept(node: PythonNode, cutoff: (n: PythonNode) => boolean): IterableIterator<PythonNode> {
  yield node;
  const count = node.childCount as number;
  for (let i = 0; i < count; i++) {
    const child = node.child(i) as PythonNode | null;
    if (!child) continue;
    if (cutoff(child)) continue;
    yield* walkExcept(child, cutoff);
  }
}

/**
 * Match a call expression by callee name. Handles three shapes:
 *   - bare callee: `print(x)`           → callee.type === 'identifier'
 *   - attribute:   `subprocess.run(x)`  → callee.type === 'attribute'
 *   - attribute deep: `os.path.join(x)` → callee.type === 'attribute'
 *
 * `dottedNames` accepts both `'print'` and `'subprocess.run'` and
 * `'os.system'` forms. Match is by full dotted path.
 */
export interface CallLike {
  node: PythonNode;
  callee: string;
  args: PythonNode | null;
  line: number;
  column: number;
}

function attributeDottedName(node: PythonNode): string | null {
  // `attribute` node has fields: object, attribute (identifier)
  const obj = (node as { childForFieldName: (n: string) => PythonNode | null }).childForFieldName('object');
  const attr = (node as { childForFieldName: (n: string) => PythonNode | null }).childForFieldName('attribute');
  if (!obj || !attr) return null;
  const tail = (attr as { text: string }).text;
  if (obj.type === 'identifier') {
    return `${(obj as { text: string }).text}.${tail}`;
  }
  if (obj.type === 'attribute') {
    const head = attributeDottedName(obj);
    return head ? `${head}.${tail}` : null;
  }
  return null;
}

function calleeName(callNode: PythonNode): string | null {
  const callee = (callNode as { childForFieldName: (n: string) => PythonNode | null }).childForFieldName('function');
  if (!callee) return null;
  if (callee.type === 'identifier') return (callee as { text: string }).text;
  if (callee.type === 'attribute') return attributeDottedName(callee);
  return null;
}

/** Find every Call node in `node` whose callee dotted-path is in `dottedNames`. */
export function findCallsTo(node: PythonNode, dottedNames: ReadonlySet<string>): CallLike[] {
  const out: CallLike[] = [];
  for (const n of walk(node)) {
    if (n.type !== 'call') continue;
    const name = calleeName(n);
    if (name && dottedNames.has(name)) {
      const pos = posOf(n);
      const args = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('arguments');
      out.push({ node: n, callee: name, args, line: pos.line, column: pos.column });
    }
  }
  return out;
}

/** A function definition (def / async def). */
export interface FunctionLike {
  node: PythonNode;
  name: string;
  isAsync: boolean;
  body: PythonNode;
  line: number;
  column: number;
}

/** Iterate every `function_definition`. */
export function* iterFunctions(node: PythonNode): IterableIterator<FunctionLike> {
  for (const n of walk(node)) {
    if (n.type !== 'function_definition') continue;
    const nameNode = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('name');
    const bodyNode = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('body');
    if (!nameNode || !bodyNode) continue;
    // tree-sitter-python: `function_definition` has an unconditional `async` modifier child when async.
    let isAsync = false;
    for (let i = 0; i < (n.childCount as number); i++) {
      const c = n.child(i) as PythonNode | null;
      if (c && c.type === 'async') { isAsync = true; break; }
    }
    const pos = posOf(n);
    yield {
      node: n,
      name: (nameNode as { text: string }).text,
      isAsync,
      body: bodyNode,
      line: pos.line,
      column: pos.column,
    };
  }
}

/**
 * Does `body` contain at least one `await` expression OUTSIDE nested
 * function bodies?
 *
 * Also returns true for `async for` and `async with` — those are
 * semantically implicit awaits (they call __anext__ / __aenter__ /
 * __aexit__ under the hood) and a function that only uses them is
 * legitimately async.
 */
export function bodyHasAwait(body: PythonNode): boolean {
  for (const n of walkExcept(body, c => c.type === 'function_definition' || c.type === 'lambda')) {
    if (n.type === 'await') return true;
    // `async for x in ...`: tree-sitter exposes this as a `for_statement`
    // with an `async` child token.
    if (n.type === 'for_statement') {
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (c && c.type === 'async') return true;
      }
    }
    // `async with`: same structure on `with_statement`.
    if (n.type === 'with_statement') {
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (c && c.type === 'async') return true;
      }
    }
  }
  return false;
}

/**
 * Names that are by-design async-without-await: the async context
 * manager + async iterator protocol methods. Their callers awaited
 * them, the protocol is what makes them async.
 */
const ASYNC_PROTOCOL_DUNDERS = new Set([
  '__aenter__', '__aexit__',
  '__aiter__', '__anext__',
  '__await__',
]);

/** True when this name is one of the async protocol dunders. */
export function isAsyncProtocolDunder(name: string): boolean {
  return ASYNC_PROTOCOL_DUNDERS.has(name);
}

/** Async-function-without-await hit. */
export interface AsyncWithoutAwaitHit extends PyAstHit {
  name: string;
}

export function findAsyncWithoutAwait(tree: PythonTree): AsyncWithoutAwaitHit[] {
  const hits: AsyncWithoutAwaitHit[] = [];
  for (const fn of iterFunctions(tree.rootNode)) {
    if (!fn.isAsync) continue;
    if (isAsyncProtocolDunder(fn.name)) continue;
    if (bodyHasAwait(fn.body)) continue;
    hits.push({ name: fn.name, line: fn.line, column: fn.column });
  }
  return hits;
}

/** Empty-except hit. */
export interface EmptyExceptHit extends PyAstHit {}

/**
 * `except_clause` whose body is `pass` only (or an Ellipsis statement) —
 * the classic "swallowed exception" pattern.
 */
export function findEmptyExcepts(tree: PythonTree): EmptyExceptHit[] {
  const hits: EmptyExceptHit[] = [];
  for (const n of walk(tree.rootNode)) {
    if (n.type !== 'except_clause') continue;
    // Last child is the suite/block; iterate its statements.
    const block = (() => {
      for (let i = (n.childCount as number) - 1; i >= 0; i--) {
        const c = n.child(i) as PythonNode | null;
        if (c && (c.type === 'block')) return c;
      }
      return null;
    })();
    if (!block) continue;
    // A `block` contains statements; we consider it "empty" when every
    // statement is a `pass_statement`, an Ellipsis expression-statement,
    // a bare string (used as a fake-docstring placeholder), or a comment.
    // Comments are tree-sitter-python nodes too, so we exempt them.
    let allEmpty = true;
    for (let i = 0; i < (block.childCount as number); i++) {
      const c = block.child(i) as PythonNode | null;
      if (!c) continue;
      if (c.type === 'comment') continue;
      if (c.type === 'pass_statement') continue;
      if (c.type === 'expression_statement') {
        const inner = c.child(0) as PythonNode | null;
        if (inner && (inner.type === 'ellipsis' || inner.type === 'string')) continue;
      }
      allEmpty = false; break;
    }
    if (allEmpty) {
      hits.push(posOf(n));
    }
  }
  return hits;
}

/** Unreachable-after-terminator hit. */
export interface UnreachableHit extends PyAstHit {
  reason: 'after-return' | 'after-raise' | 'after-sys-exit' | 'after-continue' | 'after-break';
}

function classifyTerminator(node: PythonNode): UnreachableHit['reason'] | null {
  if (node.type === 'return_statement') return 'after-return';
  if (node.type === 'raise_statement') return 'after-raise';
  if (node.type === 'continue_statement') return 'after-continue';
  if (node.type === 'break_statement') return 'after-break';
  // `sys.exit(...)` shaped as an expression_statement wrapping a call.
  if (node.type === 'expression_statement') {
    const inner = node.child(0) as PythonNode | null;
    if (inner && inner.type === 'call') {
      const name = calleeName(inner);
      if (name === 'sys.exit' || name === 'exit' || name === 'quit') return 'after-sys-exit';
    }
  }
  return null;
}

export function findUnreachableStatements(tree: PythonTree): UnreachableHit[] {
  const hits: UnreachableHit[] = [];
  for (const n of walk(tree.rootNode)) {
    if (n.type !== 'block') continue;
    const stmts: PythonNode[] = [];
    for (let i = 0; i < (n.childCount as number); i++) {
      const c = n.child(i) as PythonNode | null;
      if (!c) continue;
      // Skip newline / dedent / indent / comment trivia.
      if (c.type === 'comment' || c.type === ':' || c.isExtra) continue;
      stmts.push(c);
    }
    for (let i = 0; i < stmts.length - 1; i++) {
      const reason = classifyTerminator(stmts[i]);
      if (!reason) continue;
      const dead = stmts[i + 1];
      // Don't flag a nested function definition or class — they're
      // hoisted in a different sense (defined but never called here).
      if (dead.type === 'function_definition' || dead.type === 'class_definition') break;
      const pos = posOf(dead);
      hits.push({ line: pos.line, column: pos.column, reason });
      break;
    }
  }
  return hits;
}

/**
 * Compute McCabe cyclomatic complexity per function-like body. Each of
 * these node types adds 1 to a base of 1:
 *   if_statement, elif_clause, for_statement, while_statement,
 *   except_clause, conditional_expression (a ternary),
 *   `and` / `or` boolean operators, `case_clause` of `match` (PEP 634).
 */
export interface ComplexityHit extends PyAstHit {
  name: string;
  complexity: number;
}

function isComplexityNode(n: PythonNode): boolean {
  switch (n.type) {
    case 'if_statement':
    case 'elif_clause':
    case 'for_statement':
    case 'while_statement':
    case 'except_clause':
    case 'conditional_expression':
    case 'case_clause':
      return true;
    case 'boolean_operator':
      // Both `and` and `or` show up as boolean_operator. Each adds 1.
      return true;
    default:
      return false;
  }
}

function computeComplexityFor(body: PythonNode): number {
  let count = 1;
  for (const n of walkExcept(body, c => c.type === 'function_definition' || c.type === 'lambda')) {
    if (isComplexityNode(n)) count++;
  }
  return count;
}

export function findHighComplexityFunctions(tree: PythonTree, threshold = 15): ComplexityHit[] {
  const hits: ComplexityHit[] = [];
  for (const fn of iterFunctions(tree.rootNode)) {
    const c = computeComplexityFor(fn.body);
    if (c > threshold) {
      hits.push({ name: fn.name, complexity: c, line: fn.line, column: fn.column });
    }
  }
  return hits;
}

/**
 * Collect every Identifier USE position keyed by text. "Use" here means
 * the identifier is NOT the LHS of an assignment / parameter name /
 * import binding / function-or-class definition name.
 *
 * Conservative on purpose: shorthand-style uses inside f-strings count
 * (their interior expressions show up as identifier nodes too).
 */
export function collectIdentifierUses(tree: PythonTree): Map<string, number> {
  const uses = new Map<string, number>();

  // web-tree-sitter returns a NEW JS wrapper on each call to .child() /
  // .childForFieldName() / .parent, so reference equality on nodes
  // fails. Compare by node `id` (stable integer per syntactic node).
  const sameNode = (a: PythonNode | null, b: PythonNode | null): boolean => {
    if (!a || !b) return false;
    return (a as { id: number }).id === (b as { id: number }).id;
  };

  const isDeclarationName = (id: PythonNode): boolean => {
    const p = id.parent as PythonNode | null;
    if (!p) return false;
    if (p.type === 'function_definition') {
      const nameNode = (p as { childForFieldName: (n: string) => PythonNode | null }).childForFieldName('name');
      if (sameNode(nameNode, id)) return true;
    }
    if (p.type === 'class_definition') {
      const nameNode = (p as { childForFieldName: (n: string) => PythonNode | null }).childForFieldName('name');
      if (sameNode(nameNode, id)) return true;
    }
    if (p.type === 'parameters' || p.type === 'typed_parameter' || p.type === 'default_parameter') {
      return true;
    }
    if (p.type === 'assignment') {
      const lhs = (p as { childForFieldName: (n: string) => PythonNode | null }).childForFieldName('left');
      if (sameNode(lhs, id)) return true;
    }
    if (p.type === 'aliased_import' || p.type === 'dotted_name' || p.type === 'import_from_statement') {
      return true;
    }
    return false;
  };

  for (const n of walk(tree.rootNode)) {
    if (n.type !== 'identifier') continue;
    if (isDeclarationName(n)) continue;
    const text = (n as { text: string }).text;
    uses.set(text, (uses.get(text) ?? 0) + 1);
  }
  return uses;
}

/** Unused-variable hit. */
export interface UnusedVariableHit extends PyAstHit {
  name: string;
}

/**
 * Walk top-level + function-level assignment LHS identifiers and emit
 * those whose name is never referenced elsewhere.
 *
 * Skip rules:
 *   - `_`-prefixed names (Python convention for deliberately unused).
 *   - assignments whose RHS contains a call (potential side effect).
 *   - tuple / star / subscript / attribute LHS (too noisy for v1).
 *   - top-level constants (we only check inside function bodies).
 */
export function findUnusedVariables(tree: PythonTree): UnusedVariableHit[] {
  const uses = collectIdentifierUses(tree);
  const hits: UnusedVariableHit[] = [];

  function rhsHasCall(rhs: PythonNode): boolean {
    for (const n of walk(rhs)) {
      if (n.type === 'call') return true;
      if (n.type === 'await') return true;
    }
    return false;
  }

  for (const fn of iterFunctions(tree.rootNode)) {
    for (const n of walkExcept(fn.body, c => c.type === 'function_definition')) {
      if (n.type !== 'assignment') continue;
      const lhs = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('left');
      const rhs = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('right');
      if (!lhs || lhs.type !== 'identifier') continue;
      const name = (lhs as { text: string }).text;
      if (name.startsWith('_')) continue;
      if (rhs && rhsHasCall(rhs)) continue;
      if ((uses.get(name) ?? 0) === 0) {
        hits.push({ name, ...posOf(lhs) });
      }
    }
  }
  return hits;
}

/** Unused-import hit. */
export interface UnusedImportHit extends PyAstHit {
  name: string;
  module: string;
  kind: 'import' | 'from-import' | 'aliased';
}

export function findUnusedImports(tree: PythonTree): UnusedImportHit[] {
  const uses = collectIdentifierUses(tree);
  const hits: UnusedImportHit[] = [];

  for (const n of walk(tree.rootNode)) {
    // `import x` / `import x.y` / `import x as y`
    if (n.type === 'import_statement') {
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (!c) continue;
        if (c.type === 'dotted_name') {
          // top-level name is the FIRST identifier in the dotted_name.
          const firstId = c.child(0) as PythonNode | null;
          if (firstId && firstId.type === 'identifier') {
            const name = (firstId as { text: string }).text;
            if ((uses.get(name) ?? 0) === 0) {
              hits.push({ name, module: (c as { text: string }).text, kind: 'import', ...posOf(c) });
            }
          }
        } else if (c.type === 'aliased_import') {
          const aliasNode = (c as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('alias');
          const nameNode = (c as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('name');
          if (aliasNode && nameNode) {
            const alias = (aliasNode as { text: string }).text;
            if ((uses.get(alias) ?? 0) === 0) {
              hits.push({ name: alias, module: (nameNode as { text: string }).text, kind: 'aliased', ...posOf(c) });
            }
          }
        }
      }
    }
    // `from x import a, b as c`
    if (n.type === 'import_from_statement') {
      const moduleNode = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('module_name');
      const moduleText = moduleNode ? (moduleNode as { text: string }).text : '';
      const moduleId = moduleNode ? (moduleNode as { id: number }).id : -1;
      // After the `import` keyword the children are dotted_name / aliased_import nodes.
      // Compare against the module child by node id — web-tree-sitter returns
      // new JS wrappers per call so `c !== moduleNode` always evaluates true.
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (!c) continue;
        if (c.type === 'dotted_name' && (c as { id: number }).id !== moduleId) {
          const firstId = c.child(0) as PythonNode | null;
          if (firstId && firstId.type === 'identifier') {
            const name = (firstId as { text: string }).text;
            if ((uses.get(name) ?? 0) === 0) {
              hits.push({ name, module: moduleText, kind: 'from-import', ...posOf(c) });
            }
          }
        } else if (c.type === 'aliased_import') {
          const aliasNode = (c as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('alias');
          if (aliasNode) {
            const alias = (aliasNode as { text: string }).text;
            if ((uses.get(alias) ?? 0) === 0) {
              hits.push({ name: alias, module: moduleText, kind: 'aliased', ...posOf(c) });
            }
          }
        }
      }
    }
  }
  return hits;
}

/**
 * Collect every Python `import` / `from X import Y` module specifier.
 * Used by `vibe-supply-chain-hallucinated-import` when we extend it
 * to Python in v1.1; surfaced here so the same scan can populate it.
 */
export function collectPythonImports(tree: PythonTree): string[] {
  const out: string[] = [];
  for (const n of walk(tree.rootNode)) {
    if (n.type === 'import_statement') {
      for (let i = 0; i < (n.childCount as number); i++) {
        const c = n.child(i) as PythonNode | null;
        if (!c) continue;
        if (c.type === 'dotted_name') out.push((c as { text: string }).text);
        if (c.type === 'aliased_import') {
          const nameNode = (c as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('name');
          if (nameNode) out.push((nameNode as { text: string }).text);
        }
      }
    }
    if (n.type === 'import_from_statement') {
      const moduleNode = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('module_name');
      if (moduleNode) out.push((moduleNode as { text: string }).text);
    }
  }
  return out;
}

/**
 * Find every `print(...)` and `pprint.pprint(...)` call. The
 * `leftover-print` rule consumes this.
 */
export function findPrintCalls(tree: PythonTree): CallLike[] {
  return findCallsTo(tree.rootNode, new Set(['print', 'pprint.pprint']));
}

/** `eval(...)` and `exec(...)` call sites. */
export function findEvalExecCalls(tree: PythonTree): CallLike[] {
  return findCallsTo(tree.rootNode, new Set(['eval', 'exec']));
}

/**
 * A decorated function definition — the shape every Flask / FastAPI /
 * Django route handler takes. Consumed by the vibe-py route rules
 * (no-input-validation, auth-missing-check, bola).
 */
export interface DecoratedFunctionLike extends FunctionLike {
  /** Raw text of each decorator, including the leading `@`. */
  decorators: string[];
  /** Full text of the decorated_definition (decorators + def + body). */
  fullText: string;
  /** 1-indexed last line of the definition. */
  endLine: number;
}

/** Iterate every `decorated_definition` wrapping a function_definition. */
export function* iterDecoratedFunctions(tree: PythonTree): IterableIterator<DecoratedFunctionLike> {
  for (const n of walk(tree.rootNode)) {
    if (n.type !== 'decorated_definition') continue;
    const def = (n as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('definition');
    if (!def || def.type !== 'function_definition') continue;
    const nameNode = (def as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('name');
    const bodyNode = (def as { childForFieldName: (k: string) => PythonNode | null }).childForFieldName('body');
    if (!nameNode || !bodyNode) continue;
    const decorators: string[] = [];
    for (let i = 0; i < (n.childCount as number); i++) {
      const c = n.child(i) as PythonNode | null;
      if (c && c.type === 'decorator') decorators.push((c as { text: string }).text);
    }
    let isAsync = false;
    for (let i = 0; i < (def.childCount as number); i++) {
      const c = def.child(i) as PythonNode | null;
      if (c && c.type === 'async') { isAsync = true; break; }
    }
    const pos = posOf(def);
    yield {
      node: def,
      name: (nameNode as { text: string }).text,
      isAsync,
      body: bodyNode,
      line: pos.line,
      column: pos.column,
      decorators,
      fullText: (n as { text: string }).text,
      endLine: (n as NodePos).endPosition.row + 1,
    };
  }
}

/** What the vibe-py route rules learn from a handler's decorator list. */
export interface RouteDecoratorInfo {
  isRoute: boolean;
  /** Uppercase HTTP methods. `@app.route` with no methods kwarg => ['GET']. */
  methods: string[];
  /** Path parameter names: Flask `<int:post_id>` / FastAPI `{post_id}`. */
  pathParams: string[];
}

const ROUTE_VERB_RE = /^@[\w.]+\.(get|post|put|patch|delete|head|options)\s*\(\s*(['"])(\/[^'"]*)\2/;
const ROUTE_ROUTE_RE = /^@[\w.]+\.(?:route|add_url_rule)\s*\(\s*(['"])([^'"]*)\1/;
const ROUTE_METHODS_KWARG_RE = /methods\s*=\s*[[(]([^\])]*)[\])]/;
const DRF_API_VIEW_RE = /^@api_view\s*\(\s*[[(]([^\])]*)[\])]/;
const PATH_PARAM_RE = /<(?:\w+:)?(\w+)>|\{(\w+)(?::[^}]*)?\}/g;

/**
 * Classify a decorator list as a route handler. Verb-style decorators
 * (`@app.post(...)`) only count when their first argument is a
 * `/`-leading path string — this is what separates `@router.post("/x")`
 * from `@cache.get("key")`.
 */
export function parseRouteDecorators(decorators: ReadonlyArray<string>): RouteDecoratorInfo {
  const info: RouteDecoratorInfo = { isRoute: false, methods: [], pathParams: [] };
  for (const raw of decorators) {
    const d = raw.trim();
    let pathStr: string | null = null;

    const verb = ROUTE_VERB_RE.exec(d);
    if (verb) {
      info.isRoute = true;
      info.methods.push(verb[1].toUpperCase());
      pathStr = verb[3];
    }

    const route = ROUTE_ROUTE_RE.exec(d);
    if (route) {
      info.isRoute = true;
      pathStr = route[2];
      const mk = ROUTE_METHODS_KWARG_RE.exec(d);
      if (mk) {
        for (const m of mk[1].split(',')) {
          const cleaned = m.trim().replace(/['"]/g, '');
          if (cleaned) info.methods.push(cleaned.toUpperCase());
        }
      } else {
        info.methods.push('GET');
      }
    }

    const drf = DRF_API_VIEW_RE.exec(d);
    if (drf) {
      info.isRoute = true;
      for (const m of drf[1].split(',')) {
        const cleaned = m.trim().replace(/['"]/g, '');
        if (cleaned) info.methods.push(cleaned.toUpperCase());
      }
    }

    if (pathStr) {
      PATH_PARAM_RE.lastIndex = 0;
      let pm: RegExpExecArray | null;
      while ((pm = PATH_PARAM_RE.exec(pathStr)) !== null) {
        info.pathParams.push(pm[1] ?? pm[2]);
      }
    }
  }
  return info;
}

/** Test-file paths the vibe-py route rules skip (fixtures & test suites define throwaway routes). */
export function isPyTestFilePath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return /(^|\/)tests?\//.test(norm)
    || /(^|\/)test_[^/]*\.py$/.test(norm)
    || /_test\.py$/.test(norm)
    || /(^|\/)conftest\.py$/.test(norm);
}
