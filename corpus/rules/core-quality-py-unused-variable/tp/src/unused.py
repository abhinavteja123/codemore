def with_orphans():
    old_service_role_key = 'sk-XXX'    # ← flag
    legacy_timeout = 7                  # ← flag
    return 42

def shadow_unused():
    config = {'a': 1}                   # ← flag (never read)
    return 'done'
