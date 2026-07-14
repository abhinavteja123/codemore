# vibe-py-no-input-validation

**Pack:** `vibe-frontend`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

State-changing (POST / PUT / PATCH / DELETE) Flask / FastAPI route handlers that read raw request input (`request.get_json()`, `request.form`, `request.args`, `request.values`, `request.data`, `await request.json()`) in a file that imports no recognised schema validator — pydantic, marshmallow, cerberus, wtforms / flask_wtf, voluptuous, trafaret, flask_restful, rest_framework. Python analogue of [`vibe-no-input-validation`](./vibe-no-input-validation.md).

## Why it matters

Unvalidated user input flows straight into the handler and DB calls — injection, shape confusion, mass assignment. Vibe-coded Flask apps almost always go straight from `request.get_json()` to the DB call. FastAPI handlers that declare a Pydantic model parameter are clean by construction and never match.

## Example — flagged

```python
@app.route("/posts", methods=["POST"])
def create_post():
    data = request.get_json()                 # no validation anywhere in the file
    post = Post(title=data["title"], body=data["body"])
    db.session.add(post)
```

## Example — not flagged

```python
from pydantic import BaseModel, ValidationError

class CreatePost(BaseModel):
    title: str
    body: str

@app.route("/posts", methods=["POST"])
def create_post():
    try:
        payload = CreatePost.model_validate(request.get_json())
    except ValidationError:
        return {"error": "invalid input"}, 400
```

Also not flagged: GET-only routes, FastAPI handlers taking a Pydantic model parameter, and test files (`tests/`, `test_*.py`, `conftest.py`).

## Suggested fix

Define a schema and validate the payload before use (pydantic shown above; marshmallow / cerberus / wtforms equally accepted). On FastAPI, declare the model as the handler parameter instead of reading `await request.json()`.

## Suppression

```python
# codemore-ignore-next-line: vibe-py-no-input-validation
@app.route("/webhook", methods=["POST"])
```

## Implementation

Tree-sitter-python AST scopes decorated route handlers (`@app.route(..., methods=[...])`, `@app.post(...)`, `@api_view([...])`); a regex confirms a raw request read inside the handler; a file-level import scan looks for validator evidence. As with the TS rule, a validator import is treated as evidence of intent — "imported marshmallow but never called `.load()`" is a known false negative.

Source: [`shared/packs/vibe-frontend/vibe-py-no-input-validation.ts`](../../shared/packs/vibe-frontend/vibe-py-no-input-validation.ts)
Fixtures: [`corpus/rules/vibe-py-no-input-validation/`](../../corpus/rules/vibe-py-no-input-validation/)
