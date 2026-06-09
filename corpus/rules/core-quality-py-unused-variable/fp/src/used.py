# FP: assignments whose name is referenced, plus _-prefixed exemption.

def reads_back():
    x = 7
    return x + 1

def underscore_exempt():
    _scratch = compute()
    return 0

def side_effect_exempt():
    unused = api_call()        # call expression — possibly has side effect; exempt
    return 'done'

def compute(): return 1
def api_call(): return 2
