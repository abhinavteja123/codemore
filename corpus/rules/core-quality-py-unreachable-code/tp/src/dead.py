import sys

def after_return():
    return 'ok'
    print('never')                  # ← flag (after-return)

def after_raise():
    raise ValueError('bad')
    cleanup()                       # ← flag (after-raise)

def after_sys_exit():
    sys.exit(0)
    log_done()                      # ← flag (after-sys-exit)

def in_loop():
    for x in [1, 2, 3]:
        if x > 0:
            continue
            x += 1                  # ← flag (after-continue)

def cleanup(): pass
def log_done(): pass
