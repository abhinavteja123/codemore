# FP: functions well under the 15 threshold.

def add(a, b):
    return a + b

def pick(x):
    if x > 0: return 'positive'
    if x < 0: return 'negative'
    return 'zero'

def classify(kind):
    if kind == 'a': return 'A'
    if kind == 'b': return 'B'
    if kind == 'c': return 'C'
    return None

def medium(opts):
    s = ''
    if opts.get('x'): s += 'x'
    if opts.get('y'): s += 'y'
    if opts.get('z'): s += 'z'
    for i in range(3):
        s += str(i)
    return s
