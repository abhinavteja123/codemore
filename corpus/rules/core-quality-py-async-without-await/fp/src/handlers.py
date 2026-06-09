# FP: async functions with awaits, async-protocol dunders, and sync functions.

import asyncio

async def fetch_user(id: int):
    user = await lookup(id)
    return user

async def for_await_loop(items):
    async for item in items:          # async for is an implicit await
        yield item

async def using_async_with():
    async with something():           # async with is an implicit await
        return await go()

def sync_function():                  # plain def — not async, not flagged
    return 'ok'

async def lookup(id):
    return await asyncio.sleep(0)

# Async context-manager / iterator protocol dunders — exempt by name.
class MyResource:
    async def __aenter__(self):
        return self
    async def __aexit__(self, *args):
        return False
    async def __aiter__(self):
        return self
    async def __anext__(self):
        raise StopAsyncIteration

async def go():
    return await asyncio.sleep(0)

def something():
    return MyResource()
