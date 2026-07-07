<!-- codemore-ignore-file: core-security-path-traversal -->
# core-security-path-traversal

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | beta | 0.8 |

## What it catches

User-supplied filenames concatenated onto a file-system path without an inside-base guard. Maps to CWE-22 (Improper Limitation of a Pathname to a Restricted Directory) and OWASP A03 (Injection).

Detects patterns like:

- `fs.readFile(req.params.name, ...)` — no path validation
- `fs.createReadStream(BASE + req.query.name)` — user string appended to base
- `open(f'/uploads/{filename}')` — f-string with user input
- `res.sendFile(path.join(UPLOADS, req.params.f))` — no inside-base check

Constant-only joins are **not** flagged: if every path component is a string literal or an `UPPER_CASE` module constant (e.g. `os.path.join(FIGURES_DIR, "fig2.json")`), there is no untrusted input and no traversal.

## Why it matters

An attacker sends a filename like `../../etc/passwd` and the application concatenates it directly into `open()` or `readFile()`. The attacker can now read any file the process can access. The defence is two lines: resolve the candidate path to an absolute path, then refuse anything that doesn't sit inside your designated directory.

This is a top-10 web vulnerability and a reliable way to leak `.env` files, private keys, and other users' uploaded data.

## Example — flagged

```ts
import fs from 'fs';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('name');
  // BLOCKER: user input concatenated into readFile with no path guard.
  const contents = fs.readFileSync(`/uploads/${filename}`, 'utf-8');
  return new Response(contents);
}
```

```py
def serve_doc(request):
    # BLOCKER: user input from request.params directly into open().
    name = request.params['name']
    with open(f'/var/docs/{name}', 'r') as f:
        return f.read()
```

## Example — not flagged

```ts
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('name');
  
  // OK: resolve to absolute path, then check it's inside the safe base.
  const BASE = path.resolve('./uploads');
  const candidate = path.resolve(BASE, filename);
  if (!candidate.startsWith(BASE + path.sep)) {
    return new Response('Path escapes base', { status: 400 });
  }
  const contents = fs.readFileSync(candidate, 'utf-8');
  return new Response(contents);
}
```

```py
import os

def serve_doc(request):
    # OK: secure_filename + startswith check.
    from werkzeug.utils import secure_filename
    
    BASE = os.path.abspath('/var/docs')
    name = secure_filename(request.params['name'])
    candidate = os.path.abspath(os.path.join(BASE, name))
    if not candidate.startswith(BASE + os.sep):
        raise PermissionError("path escapes base")
    
    with open(candidate, 'r') as f:
        return f.read()
```

## Suggested fix

Always validate file paths with a base-directory guard:

**Node.js:**

```ts
import path from 'node:path';

const BASE = path.resolve(uploadsDir);
const candidate = path.resolve(BASE, userSuppliedFilename);
if (!candidate.startsWith(BASE + path.sep)) {
  return res.status(400).send('invalid path');
}
// Safe to open candidate now.
```

**Python:**

```py
import os
from werkzeug.utils import secure_filename

BASE = os.path.abspath('/safe/directory')
candidate = os.path.abspath(os.path.join(BASE, filename))
if not candidate.startswith(BASE + os.sep):
    raise PermissionError("path escapes base")
```

## Suppression

```ts
// Reason: filename comes from a trusted internal queue, never user input.
// codemore-ignore-next-line: core-security-path-traversal
const data = fs.readFileSync(`/archive/${queuedFilename}`, 'utf-8');
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [CWE-22: Improper Limitation of a Pathname to a Restricted Directory](https://cwe.mitre.org/data/definitions/22.html)

## Implementation

Regex scan for file-open call sites (`fs.readFile`, `open()`, `send_file`, etc.) and checks whether the captured argument contains a user-input hint (`req`, `params`, `query`, `filename`) AND lacks a nearby guard (`path.resolve` / `os.path.abspath` + `startswith` check within ~7 lines).

Source: [`shared/packs/core-security/core-security-path-traversal.ts`](../../shared/packs/core-security/core-security-path-traversal.ts)
Fixtures: [`corpus/rules/core-security-path-traversal/`](../../corpus/rules/core-security-path-traversal/)
