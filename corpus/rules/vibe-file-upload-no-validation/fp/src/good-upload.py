"""False-positive fixture for vibe-file-upload-no-validation.

Extension allowlist + secure_filename + UUID rename. Rule must NOT fire.
"""
import os
import uuid
from werkzeug.utils import secure_filename

ALLOWED = {'png', 'jpg', 'pdf'}
UPLOADS = '/srv/uploads'


def upload(request):
    f = request.files['upload']
    filename = secure_filename(f.filename)
    ext = filename.rsplit('.', 1)[-1].lower()
    if ext not in ALLOWED:
        return "invalid file", 400
    target = os.path.join(UPLOADS, f"{uuid.uuid4()}.{ext}")
    f.save(target)
    return "ok"
