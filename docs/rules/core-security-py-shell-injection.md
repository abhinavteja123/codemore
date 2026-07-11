# core-security-py-shell-injection

**Pack:** `core-security`
**Default severity:** BLOCKER
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.85

## What it catches

Three shell-injection sinks:

1. `subprocess.{call,run,Popen,check_call,check_output}(..., shell=True)`.
2. `subprocess.getoutput(...)` / `subprocess.getstatusoutput(...)` with a dynamic first-argument string. These ALWAYS pipe through the shell.
3. `os.system(...)` / `os.popen(...)` with a dynamic first-argument string.

A "dynamic string" here means: f-string with interpolation, `+`-concatenation, `.format(...)`, or a bare identifier (provenance unknown — treated as dynamic to stay on the safer side).

## Example — flagged

```python
import subprocess, os

def with_shell_true(rev):
    return subprocess.run(f'git log --oneline {rev}', shell=True)   # ← shell=True + f-string

def os_system(cmd):
    return os.system('rm -rf ' + cmd)                                # ← concat into os.system

def os_system_fstring(target):
    return os.system(f'curl {target}')                               # ← f-string into os.system

def get_output(name):
    return subprocess.getoutput('echo ' + name)                      # ← getoutput is always shell
```

## Example — not flagged

```python
def argv_form(rev):
    return subprocess.run(['git', 'log', '--oneline', rev], check=True)

def explicit_no_shell(cmd_argv):
    return subprocess.Popen(cmd_argv, shell=False)

def static_os_system():
    return os.system('ls')           # static string — rule only fires on dynamic input
```

## Suggested fix

```python
# Wrong
subprocess.run(f'git log --oneline {rev}', shell=True)

# Right — argv-list form
subprocess.run(['git', 'log', '--oneline', rev], check=True)

# If you absolutely need shell features, quote every interpolated value:
import shlex
subprocess.run(f'git log --oneline {shlex.quote(rev)}', shell=True)
```

## Implementation

Tree-sitter-python AST. `findCallsTo` matches the call by dotted-path. `hasShellTrue` inspects keyword arguments for `shell=True`. `firstArgIsDynamicString` classifies the first positional argument as static literal vs `binary_operator` / interpolated f-string / `.format(...)` call / bare identifier.

Source: [`shared/packs/core-security/core-security-py-shell-injection.ts`](../../shared/packs/core-security/core-security-py-shell-injection.ts)
Fixtures: [`corpus/rules/core-security-py-shell-injection/`](../../corpus/rules/core-security-py-shell-injection/)
