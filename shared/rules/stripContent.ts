/**
 * Strip-content helpers used by AST-light regex rules.
 *
 * Several security rules (eval, shell-injection, path-traversal, …) match
 * patterns over source. Without stripping comments + string literals first,
 * they fire on:
 *   - The rule's OWN documentation block (`fs.readFile(req.params.name, ...)`
 *     appears inside a JSDoc example and matches the rule's own regex).
 *   - Doc-strings that mention the dangerous function name.
 *   - Test fixture data containing the pattern as text.
 *
 * These helpers replace those regions with spaces of the same length so
 * line + column offsets stay valid for the downstream `lineForOffset` call.
 */

/**
 * Strip JS/TS line + block comments and string literals from a source.
 *
 * Replacements preserve byte positions (uses `' '.repeat(n)`) so any regex
 * match offset into the stripped source maps back to the same line/column
 * in the original.
 *
 * Strips:
 *   - `// line comments`
 *   - `/* block comments *​/` (multi-line)
 *   - `"double-quoted strings"`
 *   - `'single-quoted strings'`
 *   - `` `template literals` `` (interpolation expressions LEFT IN so that
 *     `${userInput}` is still visible to dataflow-style rules)
 *   - `/regex literals/flags`
 */
export function stripJsCommentsAndStrings(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  // Template literals: keep the interpolation `${...}` expressions visible
  // (they CAN contain user input), blank everything else.
  out = out.replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, m => m.replace(/[^\n]/g, ' '));
  // Regex literals (after we've stripped strings so divisions aren't confused
  // with regex slashes).
  out = out.replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, m => ' '.repeat(m.length));
  return out;
}

/**
 * Strip Python comments, docstrings (triple-quoted), and string literals.
 *
 * The big motivation: a rule's `whyItMatters` block in a Python rule file
 * doesn't exist (we write rules in TS), but PROJECT-level docstrings in
 * Python often contain example code that triggers our regex. E.g., a module
 * docstring saying "use `eval(payload)`" caused false BLOCKERs.
 */
export function stripPyCommentsAndStrings(content: string): string {
  let out = content;
  // Triple-quoted strings (docstrings) — DO FIRST so the `#` inside them
  // doesn't get treated as a comment.
  out = out.replace(/"""[\s\S]*?"""/g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/'''[\s\S]*?'''/g, m => m.replace(/[^\n]/g, ' '));
  // Single-line comments.
  out = out.replace(/#[^\n]*/g, m => ' '.repeat(m.length));
  // Regular string literals (after docstrings + comments).
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  return out;
}
