# vibe-py-cookie-missing-flags

**Pack:** `vibe-frontend`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.8

## What it catches

Flask / Django `set_cookie(...)` calls that are missing `secure=True`, `httponly=True`, or a `samesite` value — or that set them explicitly to `False` / `None`. Python analogue of [`vibe-cookie-missing-flags`](./vibe-cookie-missing-flags.md).

## Why it matters

Both frameworks default all three flags OFF. Without `secure` the cookie rides any HTTP fallback in cleartext; without `httponly` any XSS payload can read it with `document.cookie`; without `samesite` the browser attaches it to cross-site POSTs (CSRF). AI-generated login handlers routinely emit the bare two-argument form.

## Example — flagged

```python
resp = make_response("ok")
resp.set_cookie("session_id", token)                          # all three missing
resp.set_cookie("remember_me", "1", secure=False)             # explicitly off
```

## Example — not flagged

```python
resp.set_cookie("session_id", token,
                secure=True, httponly=True, samesite="Lax")
resp.set_cookie("csrftoken", t,
                secure=not app.debug, httponly=True, samesite="Strict")
resp.set_cookie("theme", "dark", **cookie_opts)               # flags supplied by caller
resp.delete_cookie("session_id")
```

## Suggested fix

```python
resp.set_cookie(
    "session_id", token,
    secure=True,        # only sent over HTTPS
    httponly=True,      # invisible to JS / XSS
    samesite="Lax",     # not attached to cross-site POSTs
)
```

In development, condition `secure` on the environment (`secure=not app.debug`) so localhost still works.

## Suppression

```python
# codemore-ignore-next-line: vibe-py-cookie-missing-flags
resp.set_cookie("public_pref", "1")
```

## Implementation

Tree-sitter-python AST. Walks every `call` node whose callee attribute is `set_cookie`, reads the keyword arguments, and reports the missing / falsy flags. Calls that spread `**kwargs` are skipped — the flags may be supplied by the caller.

Source: [`shared/packs/vibe-frontend/vibe-py-cookie-missing-flags.ts`](../../shared/packs/vibe-frontend/vibe-py-cookie-missing-flags.ts)
Fixtures: [`corpus/rules/vibe-py-cookie-missing-flags/`](../../corpus/rules/vibe-py-cookie-missing-flags/)
