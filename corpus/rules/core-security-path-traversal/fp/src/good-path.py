"""False-positive fixture for core-security-path-traversal.

Both functions use abspath + startswith — the rule must NOT fire.
"""
import os

BASE = os.path.abspath('/srv/safe')


def read_doc_safe(request):
    name = request.params['name']
    candidate = os.path.abspath(os.path.join(BASE, name))
    if not candidate.startswith(BASE + os.sep):
        raise PermissionError("path escapes safe dir")
    return open(candidate).read()


def open_log(path):
    # Local helper using a literal path — no user input.
    return open('/var/log/app.log').read()
