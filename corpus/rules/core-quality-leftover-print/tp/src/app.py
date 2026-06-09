# TP fixture: bare print() in production-style code.
def setup():
    print("server starting")            # ← flag

def cleanup():
    print("server stopping")            # ← flag


import pprint
def dump_state(state):
    pprint.pprint(state)                # ← flag (pprint.pprint)
