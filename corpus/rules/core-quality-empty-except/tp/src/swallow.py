# TP: except clauses whose body is `pass` or `...`.

def safe_load(path):
    try:
        with open(path) as f:
            return f.read()
    except Exception:
        pass                                      # ← flag

def maybe_int(s):
    try:
        return int(s)
    except ValueError:
        ...                                       # ← flag (ellipsis only)

def with_specific():
    try:
        thing()
    except (KeyError, IndexError):
        pass                                      # ← flag

def thing(): pass
