# vibe-py-auth-missing-check

**Pack:** `vibe-auth`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.8

## What it catches

Flask / FastAPI route handlers for state-changing methods (POST / PUT / PATCH / DELETE) that reference no auth mechanism anywhere in the decorated definition, in a file that imports no auth library. Python analogue of [`vibe-auth-missing-session-check`](./vibe-auth-missing-session-check.md).

Auth evidence accepted (any one is enough): `@login_required`, `@jwt_required()`, `@permission_required`, `current_user`, `get_jwt_identity()`, `Depends(...)`, `request.user`, `g.user`, `session["user_id"]` reads, `verify_token` / `authenticate` / `check_permission` calls, or a file-level import of flask_login / flask_jwt_extended / flask_httpauth / fastapi.security / authlib / django.contrib.auth.

## Why it matters

The canonical vibe-coding bug ported to Python: the UI gates the action behind sign-in, but the endpoint happily accepts requests from anyone. Anonymous callers can mutate other users' data, enumerate IDs, or run up your costs.

## Example — flagged

```python
@app.route("/posts", methods=["POST"])
def create_post():
    data = request.get_json()
    db.session.add(Post(title=data["title"]))
    db.session.commit()
```

## Example — not flagged

```python
@app.route("/posts", methods=["POST"])
@login_required
def create_post():
    ...

@app.post("/items")
def create_item(item: Item, user: User = Depends(get_current_user)):
    ...
```

Also not flagged: GET-only routes and test files (`tests/`, `test_*.py`, `conftest.py`).

## Suggested fix

Gate the handler behind your auth layer — `@login_required` (Flask-Login), `@jwt_required()` (Flask-JWT-Extended), or `Depends(get_current_user)` (FastAPI) — and short-circuit unauthenticated requests with a 401/403.

## Suppression

Webhook receivers verify a signature instead of a session — suppress with a Reason comment:

```python
# codemore-ignore-next-line: vibe-py-auth-missing-check — verifies Stripe webhook signature
@app.route("/stripe-webhook", methods=["POST"])
```

## Implementation

Tree-sitter-python AST scopes decorated route handlers; a regex over the full decorated definition looks for auth terms; a file-level import scan looks for auth libraries. Auth enforced by middleware or a `before_request` hook in another file is invisible to single-file analysis — suppress with a Reason comment.

Source: [`shared/packs/vibe-auth/vibe-py-auth-missing-check.ts`](../../shared/packs/vibe-auth/vibe-py-auth-missing-check.ts)
Fixtures: [`corpus/rules/vibe-py-auth-missing-check/`](../../corpus/rules/vibe-py-auth-missing-check/)
