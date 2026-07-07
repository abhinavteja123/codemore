# core-security-shell-injection

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | experimental | 0.9 (clamped to 0.6 while experimental) |

## What it catches

Calls to `exec`, `execSync`, `execFile`, `execFileSync`, `spawn`, `spawnSync` from `node:child_process` whose first argument is anything other than a pure string literal:

- Template literal containing `${…}` interpolation
- String concatenation (`'cmd ' + arg`)
- Bare identifier (e.g. `exec(command)`)
- Any other dynamic expression

A pure literal (`exec('git --version')`) is **not** flagged.

**Not flagged (since 1.2.0):** array-args `spawn`/`spawnSync`/`execFile`/`execFileSync` without `shell: true` — e.g. `spawn(velaBin, ['agent', 'run'])` or `execFile(command, args, { timeout: 120_000 })`. That form never invokes a shell (each args element is its own argv entry), so a variable command/args cannot inject shell commands. Adding a literal `shell: <truthy>` to the options re-enables flagging, as does building the command string via template/concat.

## Why it matters

`exec` and `execSync` pass their first argument to a shell parser. Anything in the string — a backtick, a `;`, a `&&` — is interpreted as shell. The single most common shape of a vibe-coded RCE is `exec(\`...${userInput}...\`)`: the developer expects the shell to treat the variable as a single token, the shell happily executes whatever was injected.

The structured fix has existed since Node 0.x: `execFile` and `spawn` take an **args array** that is passed to the OS without shell parsing. Each element is its own argv entry. No string concatenation, no shell, no injection.

## Example: failing code

```ts
exec(`git log ${cmd}`, cb);                // BLOCKER — template with ${}
execSync('git checkout ' + ref);           // BLOCKER — string concat
spawn(target);                             // BLOCKER — identifier
exec(command);                             // BLOCKER — identifier
```

## Example: how to fix

```ts
import { execFile, spawn } from 'node:child_process';

// Each array element becomes an argv entry — no shell interpretation.
execFile('git', ['log', '--format=%H', ref], cb);

// Same for long-running processes.
const proc = spawn('git', ['log', '--format=%H', ref]);

// If you genuinely need shell features (pipes, redirection), validate
// against an explicit allowlist FIRST, then suppress this rule with a
// comment that documents the validation.
const ALLOWED_CMDS = new Set(['build', 'test', 'deploy']);
if (!ALLOWED_CMDS.has(cmd)) throw new Error('unknown command');
// codemore-ignore-next-line: core-security-shell-injection
execSync(`npm run ${cmd}`);
```

## Known limitations

- We can't determine whether a bare identifier holds a constant from another file. A v1.1 cross-file dataflow pass will downgrade `exec(KNOWN_CONST)` from BLOCKER to MAJOR when the constant is verifiably a string literal.
- `shell: true` hidden in an options object defined elsewhere (`spawn(cmd, args, opts)`) is not detected — only a literal `shell:` at the call site re-enables flagging.
- Comments and pure string literals are stripped before matching, so docs mentioning the patterns don't fire.

## Suppression

```ts
// codemore-ignore-next-line: core-security-shell-injection
execSync(`vetted command ${VALIDATED_CONST}`);
```

Or per file:

```ts
/* codemore-ignore-file: core-security-shell-injection */
```

## References

- [Node.js — child_process](https://nodejs.org/api/child_process.html)
- [OWASP — OS command injection](https://owasp.org/www-community/attacks/Command_Injection)
