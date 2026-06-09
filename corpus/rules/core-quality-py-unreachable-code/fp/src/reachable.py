# FP: no unreachable statements.

def early_return(x):
    if x > 0: return 'positive'
    return 'non-positive'

def loop():
    for i in range(3):
        if i % 2 == 0:
            continue              # last statement in block — OK
        print(i)
    return 'done'

def with_try():
    try:
        return load()
    except Exception:
        return None

def load(): return 42
