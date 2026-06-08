# core-security-eval

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | experimental | 0.95 (clamped to 0.6 while experimental) |

## What it catches

Direct dynamic-code-execution sinks in TS / JS:

- `eval(<expr>)`
- `new Function(<string args>)`

Both compile arbitrary text into runnable code. The Function constructor is a "stealth eval" — its arguments are joined into a function body with the same security profile as `eval` itself.

## Why it matters

Any path that lets a user contribute to the string is a remote code execution bug. Modern JavaScript has a structured alternative for every legitimate use of `eval`:

| Original purpose | Structured replacement |
|---|---|
| Parsing JSON | `JSON.parse(x)` |
| Running a config DSL | a tiny hand-rolled parser, or a vetted library (e.g. `expr-eval`) |
| Loading a module by name | `import(x)` (ESM) or `require(x)` (CJS) |
| Sandboxed evaluation | `node:vm` with an empty context, or `isolated-vm` |

If you genuinely need a sandboxed `eval` (sandboxed REPL, vetted DSL evaluator), the suppression directive is the right answer — not turning the rule off project-wide.

## Example: failing code

```ts
export function runUserCode(code: string): unknown {
  return eval(code);                                 // BLOCKER
}

export function makeAdder() {
  return new Function('a', 'b', 'return a + b;');    // BLOCKER (stealth eval)
}
```

## Example: how to fix

```ts
import vm from 'node:vm';

const context = vm.createContext({});                // empty: no host access
export function runUserCode(code: string): unknown {
  return vm.runInContext(code, context, { timeout: 100 });
}

export function makeAdder() {
  return (a: number, b: number) => a + b;
}
```

## Known limitations

- Indirect eval through aliases (`const e = eval; e(x)`) or computed access (`window['eval'](x)`) is not yet caught. A v1.1 AST pass will close this.
- Both `eval` and `new Function` are flagged regardless of source. The suppression directive (with a short comment explaining the trust assumption) is the intended escape hatch for the rare legitimate use.

## Suppression

```ts
// codemore-ignore-next-line: core-security-eval
const result = eval(trustedInternalConfig);
```

Or for an entire file:

```ts
/* codemore-ignore-file: core-security-eval */
```

## References

- [MDN — eval](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval)
- [OWASP — Code injection](https://owasp.org/www-community/attacks/Code_Injection)
- [Node.js — vm module](https://nodejs.org/api/vm.html)
