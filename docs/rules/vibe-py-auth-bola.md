# vibe-py-auth-bola

**Pack:** `vibe-auth`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.7

## What it catches

Flask / FastAPI route handlers that authenticate the request (`@login_required` / `Depends(get_current_user)` / `current_user`) but then query the database by a route path param (`<int:post_id>` / `{item_id}`) without scoping by the authenticated user. Python analogue of [`vibe-auth-bola`](./vibe-auth-bola.md).

## Why it matters

BOLA (Broken Object Level Authorization) is the #1 access-control vuln in vibe-coded apps. The handler verifies identity, then calls `Model.query.get(post_id)` with the raw path param and no ownership filter — any logged-in user can pass another user's id and read or delete their record. The AI generated the auth check correctly; it just forgot to scope the query.

## Example — flagged

```python
@app.route("/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id):
    Post.query.filter_by(id=post_id).delete()      # any user can delete any post
    db.session.commit()
```

## Example — not flagged

```python
@app.route("/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id):
    post = Post.query.filter_by(id=post_id, user_id=current_user.id).first_or_404()
    db.session.delete(post)

@app.route("/pages/<slug>")                        # no auth — vibe-py-auth-missing-check territory
def get_public_page(slug):
    ...
```

## Suggested fix

Scope the query by the authenticated user: `filter_by(id=post_id, user_id=current_user.id)` (Flask-SQLAlchemy) or `.filter(Item.id == item_id, Item.owner_id == user.id)` (FastAPI + SQLAlchemy), returning 404 when the scoped lookup misses.

## Suppression

If ownership is enforced by middleware, a DB policy, or the resource is genuinely shared:

```python
# codemore-ignore-next-line: vibe-py-auth-bola — org-shared resource, ACL enforced in middleware
post = Post.query.get_or_404(post_id)
```

## Implementation

Tree-sitter-python AST scopes decorated route handlers and extracts path params from the route string. A handler fires only when it (1) references auth, (2) never references an ownership term (`user_id` / `owner_id` / `owner` / `current_user.id` / `request.user.id` / `g.user.id`), and (3) passes a path param to a DB-shaped call (`.get` / `.get_or_404` / `.filter_by` / `.filter` / `.where` / `.execute` / `get_object_or_404`). Test files are skipped.

Source: [`shared/packs/vibe-auth/vibe-py-auth-bola.ts`](../../shared/packs/vibe-auth/vibe-py-auth-bola.ts)
Fixtures: [`corpus/rules/vibe-py-auth-bola/`](../../corpus/rules/vibe-py-auth-bola/)
