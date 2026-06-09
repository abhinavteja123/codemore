def parse(payload):
    return eval(payload)          # ← flag

def run(code):
    exec(code)                    # ← flag

def fancy_parse(s):
    return eval('1 + 1')          # ← flag (even constant args)
