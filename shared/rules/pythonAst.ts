/**
 * Python AST entry point.
 *
 * Wraps `web-tree-sitter` + `tree-sitter-python` (both WASM) into a
 * minimal API the Python rule pack consumes. WASM was chosen over native
 * tree-sitter bindings deliberately — no node-gyp build step, the same
 * tarball runs on Windows / macOS / Linux, and the runtime cost is paid
 * once per process.
 *
 * Module loading:
 *   - Lazy. We only initialise the parser when the first `.py` file
 *     enters a scan. Projects without Python pay nothing.
 *   - Cached. After the first init, subsequent parses reuse the loaded
 *     Parser and Language instances.
 *   - Failure-tolerant. If the WASM modules fail to load (corrupt
 *     install, sandboxed environment), rules that need `pythonAst`
 *     receive `null` and early-return — the scan keeps going for
 *     other languages.
 *
 * What this module exports:
 *   - `parsePython(content)` → `Promise<PythonTree | null>`
 *   - `PythonTree`, `PythonNode` — re-exported from web-tree-sitter so
 *     rule files don't need to import the library directly.
 *   - `initPythonParser()` — internal init used by the lazy first-parse
 *     path. Exported for tests that want to fail-fast on missing WASM.
 */

import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitterMod: typeof import('web-tree-sitter') = require('web-tree-sitter');
const TreeSitter: any = (TreeSitterMod as unknown as { Parser?: unknown }).Parser ?? (TreeSitterMod as unknown);
const Language: any = ((TreeSitterMod as unknown as { Language?: unknown }).Language) ?? TreeSitter.Language;

export type PythonNode = any;
export type PythonTree = { rootNode: PythonNode };

interface PythonParserState {
  parser: any;
  language: any;
}

let cached: PythonParserState | null = null;
let initPromise: Promise<PythonParserState | null> | null = null;

/**
 * Resolve the on-disk path to the Python grammar WASM. Looks at the
 * conventional install location relative to this module. If the file
 * is missing (unusual in published builds), returns null and rules
 * fall through to a no-op.
 */
function findPythonGrammarWasm(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'node_modules', 'tree-sitter-python', 'tree-sitter-python.wasm'),
    path.resolve(__dirname, '..', '..', '..', 'node_modules', 'tree-sitter-python', 'tree-sitter-python.wasm'),
    path.resolve(process.cwd(), 'node_modules', 'tree-sitter-python', 'tree-sitter-python.wasm'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function initPythonParser(): Promise<PythonParserState | null> {
  if (cached) return cached;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const wasmPath = findPythonGrammarWasm();
      if (!wasmPath) return null;
      if (typeof TreeSitter.init === 'function') {
        await TreeSitter.init();
      }
      const language = await Language.load(wasmPath);
      const parser = new TreeSitter();
      parser.setLanguage(language);
      cached = { parser, language };
      return cached;
    } catch {
      return null;
    }
  })();

  return initPromise;
}

/**
 * Parse a Python source string into a tree-sitter tree. Returns null
 * when the parser could not be initialised — callers MUST treat null as
 * "Python parsing unavailable in this environment" and skip rather than
 * fail.
 */
export async function parsePython(content: string): Promise<PythonTree | null> {
  const state = await initPythonParser();
  if (!state) return null;
  try {
    return state.parser.parse(content) as PythonTree;
  } catch {
    return null;
  }
}

/** Test helper — clears the cached parser so tests can re-init clean. */
export function _resetPythonParserForTests(): void {
  cached = null;
  initPromise = null;
}
