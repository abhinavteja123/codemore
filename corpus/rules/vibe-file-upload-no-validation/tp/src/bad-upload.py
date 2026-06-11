"""True-positive fixture for vibe-file-upload-no-validation.

Save user file without extension/MIME check. Rule MUST fire.
"""


def upload(request):
    f = request.files['upload']
    f.save('/srv/uploads/' + f.filename)
