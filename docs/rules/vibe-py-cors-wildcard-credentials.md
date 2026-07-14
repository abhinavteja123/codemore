# vibe-py-cors-wildcard-credentials

**Pack:** `vibe-frontend`
**Default severity:** BLOCKER
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.85

## What it catches

Wildcard CORS origin combined with credentials in the same file, across FastAPI/Starlette (`allow_origins=["*"]` + `allow_credentials=True`), Flask-CORS (`origins="*"` + `supports_credentials=True`), django-cors-headers settings (`CORS_ALLOW_ALL_ORIGINS = True` + `CORS_ALLOW_CREDENTIALS = True`), and raw `Access-Control-Allow-*` header assignments. Python analogue of [`vibe-cors-wildcard-credentials`](./vibe-cors-wildcard-credentials.md).

## Why it matters

Browsers reject the raw `Access-Control-Allow-Origin: *` + credentials header pair — but Starlette and Flask-CORS both special-case this configuration by **echoing the request Origin back**. The result is worse than the Express version of this bug: every site on the internet gets credentialed access to your API. Any page a logged-in user visits can read their data and act as them.

## Example — flagged

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
)
```

```python
CORS(app, origins="*", supports_credentials=True)
```

## Example — not flagged

```python
# Explicit allowlist with credentials — fine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
)

# Wildcard WITHOUT credentials — fine for public read-only APIs.
CORS(app, origins="*")
```

## Suggested fix

Allowlist specific origins (`allow_origins=["https://app.example.com"]` / `CORS_ALLOWED_ORIGINS = [...]`), or drop credentials if you genuinely need a wildcard origin.

## Suppression

```python
# codemore-ignore-next-line: vibe-py-cors-wildcard-credentials
CORS(app, origins="*", supports_credentials=True)
```

## Implementation

Regex over comment-stripped file content: a credentials signal anywhere in the file arms the rule, then every wildcard-origin signal is reported. Single-file analysis — a Django project that splits the two settings across files is a known false negative.

Source: [`shared/packs/vibe-frontend/vibe-py-cors-wildcard-credentials.ts`](../../shared/packs/vibe-frontend/vibe-py-cors-wildcard-credentials.ts)
Fixtures: [`corpus/rules/vibe-py-cors-wildcard-credentials/`](../../corpus/rules/vibe-py-cors-wildcard-credentials/)
