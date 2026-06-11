"""True-positive fixture for core-security-path-traversal.

User-controlled filename concatenated into open() with no abspath guard.
Rule MUST fire.
"""


def read_doc(request):
    name = request.params['name']
    return open('/var/docs/' + name).read()


def serve_image(request):
    filename = request.json()['filename']
    with open(f'/srv/images/{filename}', 'rb') as f:
        return f.read()
