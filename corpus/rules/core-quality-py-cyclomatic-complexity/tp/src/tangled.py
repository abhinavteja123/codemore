# TP: function with > 15 decision points.

def tangled(opts):
    s = ''
    if opts.get('a'): s += 'a'            # +1
    if opts.get('b'): s += 'b'            # +2
    if opts.get('c'): s += 'c'            # +3
    if opts.get('d'): s += 'd'            # +4
    if opts.get('e'): s += 'e'            # +5
    if opts.get('f'): s += 'f'            # +6
    if opts.get('g'): s += 'g'            # +7
    if opts.get('h'): s += 'h'            # +8
    if opts.get('i'): s += 'i'            # +9
    if opts.get('j'): s += 'j'            # +10
    if opts.get('k'): s += 'k'            # +11
    if opts.get('l'): s += 'l'            # +12
    if opts.get('m'): s += 'm'            # +13
    if opts.get('n'): s += 'n'            # +14
    for x in opts.get('items', []):       # +15
        if x:                              # +16
            s += str(x)
    return s or 'empty'
