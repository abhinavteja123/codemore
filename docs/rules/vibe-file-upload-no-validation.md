# vibe-file-upload-no-validation

**Pack:** `vibe-frontend`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript, Python
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

File-upload handlers that persist user uploads without an **extension allowlist** OR **MIME type check** OR **secure_filename** call. Matches OWASP "Unrestricted File Upload" (A04) — the ability to upload and execute arbitrary code.

Recognises patterns:

- `req.file` / `request.files['x']` saved directly to disk without validation
- `fs.writeFile()` / `fs.createWriteStream()` used with a user-supplied filename
- `multer({ dest: 'uploads/' })` configured without a `fileFilter` callback
- `file.save(target_path)` in Python without extension checking
- Direct assignment to a target path without `secure_filename()`

## Why this matters for vibe-coded apps

AI-generated upload handlers routinely persist whatever the user sent, with the filename the user chose, under a webroot directory. An attacker:

1. Uploads `shell.php` (or `shell.aspx`, or a polyglot SVG + PHP).
2. Visits `/uploads/shell.php` in the browser.
3. The server executes the PHP — remote code execution.

This is the most common file-upload exploit. The defence is three-fold:

1. **Allowlist extensions** — only allow `.png`, `.jpg`, `.pdf`, etc.
2. **Validate MIME type** — check the `Content-Type` header and/or magic bytes.
3. **Rewrite the filename** — use a UUID so the attacker can't predict the path or exploit a polyglot upload.
4. **Store outside the webroot** — keep uploads in a separate directory not served by the web server.

## Example — flagged

```ts
import express from 'express';
import multer from 'multer';
import fs from 'fs';

const app = express();

// MAJOR: multer with no fileFilter — any extension is accepted.
const upload = multer({ dest: 'public/uploads/' });

app.post('/upload', upload.single('file'), async (req, res) => {
  // File is saved with its original name; an attacker can upload shell.php.
  res.json({ filename: req.file.filename });
});

// MAJOR: Direct fs.writeFile with user-supplied filename.
app.post('/upload-direct', async (req, res) => {
  const filename = req.file.originalname;  // User controls this.
  await fs.promises.writeFile(
    `/var/www/html/uploads/${filename}`,
    req.file.buffer
  );
  res.json({ url: `/uploads/${filename}` });
});
```

```py
from flask import Flask, request
import os

app = Flask(__name__)

@app.route('/upload', methods=['POST'])
def upload_file():
    # MAJOR: user filename saved directly without validation.
    f = request.files['file']
    target = os.path.join('/var/www/uploads', f.filename)
    f.save(target)  # Attacker can upload shell.php
    return { 'url': f'/uploads/{f.filename}' }
```

## Example — not flagged

```ts
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const app = express();

// OK: multer with fileFilter and filename rewrite.
const upload = multer({
  dest: '/var/uploads',  // Outside webroot
  fileFilter: (req, file, cb) => {
    const ALLOWED = new Set(['.png', '.jpg', '.pdf']);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      return cb(new Error('invalid file type'));
    }
    cb(null, true);
  },
  filename: (req, file, cb) => {
    // Rewrite filename to UUID — attacker can't predict the path.
    const id = crypto.randomUUID();
    cb(null, `${id}${path.extname(file.originalname)}`);
  },
});

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ filename: req.file.filename });
});
```

```py
from flask import Flask, request
import os
from werkzeug.utils import secure_filename
import uuid

app = Flask(__name__)

@app.route('/upload', methods=['POST'])
def upload_file():
    # OK: validate extension + rewrite filename + store outside webroot.
    f = request.files['file']
    
    # 1. Validate extension.
    ALLOWED = {'.png', '.jpg', '.pdf'}
    _, ext = os.path.splitext(secure_filename(f.filename))
    if ext.lower() not in ALLOWED:
        return 'Invalid file type', 400
    
    # 2. Rewrite filename to UUID.
    filename = f'{uuid.uuid4()}{ext}'
    
    # 3. Store outside webroot.
    target = os.path.join('/var/uploads', filename)
    f.save(target)
    
    return { 'url': f'/files/{filename}' }
```

## Suggested fix

Implement all three layers of defense:

**Node.js:**

```ts
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf']);

const upload = multer({
  dest: path.join(__dirname, '../uploads'),  // Outside public/
  limits: { fileSize: 10 * 1024 * 1024 },    // 10 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('File type not allowed'));
    }
    
    // Optional: also validate MIME type.
    const allowedMimes = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('MIME type not allowed'));
    }
    
    cb(null, true);
  },
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ filename: req.file.filename });
});
```

**Python (Flask):**

```py
from flask import Flask, request
from werkzeug.utils import secure_filename
import os
import uuid

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB

UPLOAD_DIR = '/var/uploads'  # Outside webroot
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.pdf'}

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return 'No file part', 400
    
    file = request.files['file']
    if file.filename == '':
        return 'No selected file', 400
    
    # Validate extension.
    _, ext = os.path.splitext(secure_filename(file.filename))
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return 'File type not allowed', 400
    
    # Optional: validate MIME type.
    if file.content_type not in ['image/png', 'image/jpeg', 'application/pdf']:
        return 'MIME type not allowed', 400
    
    # Rewrite filename.
    filename = f'{uuid.uuid4()}{ext}'
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)
    
    return { 'filename': filename }
```

## Suppressing

```ts
// Reason: this endpoint only accepts internal, pre-validated uploads from our API.
// codemore-ignore-next-line: vibe-file-upload-no-validation
await fs.promises.writeFile(path.join(ARCHIVE_DIR, internalFilename), buffer);
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP — Unrestricted File Upload](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)
- [CWE-434: Unrestricted Upload of File with Dangerous Type](https://cwe.mitre.org/data/definitions/434.html)
- [multer — npm](https://www.npmjs.com/package/multer)

## Implementation

Regex scan for file-save call sites (`fs.writeFile`, `file.save`, `multer()`) and checks whether the captured argument contains an upload hint (`req.file`, `files[`, `originalname`, `filename`) AND lacks a nearby guard (`endswith`, `path.extname`, `ALLOWED`, `fileFilter`, `secure_filename`, `mimetype` check within ~10 lines).

Source: [`shared/packs/vibe-frontend/vibe-file-upload-no-validation.ts`](../../shared/packs/vibe-frontend/vibe-file-upload-no-validation.ts)
Fixtures: [`corpus/rules/vibe-file-upload-no-validation/`](../../corpus/rules/vibe-file-upload-no-validation/)
