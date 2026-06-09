# TP: async functions whose body contains no await.

async def fetch_user(id: int):                    # ← flag
    user = lookup(id)                             # forgot the `await`
    return user

async def cleanup():                              # ← flag
    return 'done'

async def with_inner_await():                     # ← flag (inner await belongs to nested fn)
    async def nested():
        return await something()
    return nested

def lookup(id: int):
    return None
