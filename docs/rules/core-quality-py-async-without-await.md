# core-quality-py-async-without-await

**Pack:** `core-quality`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** experimental
**Confidence:** 0.85

## What it catches

`async def` functions whose body contains no `await` expression, no `async for`, and no `async with`. Almost always a missing-await bug — the developer meant `await something()` and wrote `something()`.

Async-protocol dunders are **exempt** by name: `__aenter__`, `__aexit__`, `__aiter__`, `__anext__`, `__await__`. They legitimately don't need an internal await — the protocol does the awaiting.

## Why this matters for vibe-coded apps

A missing `await` is invisible at the call site: the coroutine returns a Coroutine object that nobody schedules, the side effect silently never happens, and FastAPI / asyncio carry on as if the work succeeded. Either add the missing await or drop the `async` keyword.

## Example — flagged

```python
async def fetch_user(id):
    user = lookup(id)         # ← missing await; flagged on the `async def`
    return user

async def cleanup():          # no await at all; flagged
    return 'done'

async def with_inner_await(): # inner function's await doesn't count
    async def nested():
        return await something()
    return nested
```

## Example — not flagged

```python
async def fetch_user(id):
    user = await lookup(id)        # explicit await — silent
    return user

async def for_await_loop(items):
    async for item in items:       # `async for` is an implicit await
        yield item

async def using_async_with():
    async with cm():               # `async with` is an implicit await
        return 'ok'

class Resource:
    async def __aenter__(self):    # async-protocol dunder — exempt
        return self
```

## Suggested fix

```python
# (a) Add the missing await.
async def fetch_user(id):
    user = await lookup(id)

# (b) Drop the async keyword — the body is synchronous.
def fetch_user(id):
    return lookup_sync(id)
```

## Implementation

Tree-sitter-python AST. Visits every `function_definition` with an `async` modifier child. `bodyHasAwait` recursively walks the body for any `await` expression OR a `for_statement` / `with_statement` with an `async` child token. Nested function definitions are skipped (their awaits don't satisfy the outer's contract).

Source: [`shared/packs/core-quality/core-quality-py-async-without-await.ts`](../../shared/packs/core-quality/core-quality-py-async-without-await.ts)
Fixtures: [`corpus/rules/core-quality-py-async-without-await/`](../../corpus/rules/core-quality-py-async-without-await/)
