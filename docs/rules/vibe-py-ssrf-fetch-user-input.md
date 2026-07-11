# vibe-py-ssrf-fetch-user-input

**Pack:** `core-security`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

Server-Side Request Forgery (SSRF): a `requests` / `httpx` / `urllib.request.urlopen` call whose URL argument is sourced from request input without a visible host allowlist.

Recognised sinks: `requests.{get,post,put,patch,delete,request,head,options}`, `httpx.{get,post,put,patch,delete,request,head}`, `urllib.request.urlopen`.

Tainted sources (recognised inline OR via one-hop assignment):

- `request.json()` / `request.get_json()` / `request.form` / `request.args` / `request.values`
- `request.X['key']` / `request.X.get('key')`
- The same on `req`, `ctx`, `context`, `event` root names
- f-string interpolations containing any of the above

## Why this matters for vibe-coded apps

Tenzai 2025 documented this exact shape in every one of 5 AI coding agents on the same feature type (URL-preview / link-checker). Attackers point the request at cloud-metadata endpoints (169.254.169.254), internal services, or anywhere on the private network.

## Example — flagged

```python
import requests

def fetch_a(request):
    body = request.json()
    return requests.get(body['url'])              # ← one-hop taint

def fetch_c(request):
    return requests.get(request.json()['url'])    # ← direct

def fetch_e(request):
    target = request.json()['id']
    return requests.get(f'https://api.x/{target}/data')   # ← tainted f-string
```

## Example — not flagged

```python
# Static URL — safe.
requests.get('https://api.example.com/health')

# Env-driven — not user input.
import os
httpx.get(f'{os.environ["BASE_URL"]}/health')

# Helper-wrapped — v1 deliberately doesn't trace through helpers.
def allowlisted(u):
    from urllib.parse import urlparse
    if urlparse(u).hostname != 'api.example.com':
        raise ValueError('bad')
    return u

def with_allowlist(request):
    safe = allowlisted(request.json()['url'])
    return requests.get(safe)
```

## Suggested fix

```python
from urllib.parse import urlparse

ALLOWED_HOSTS = {'api.example.com', 'cdn.example.com'}

def fetch(user_url):
    parsed = urlparse(user_url)
    if parsed.hostname not in ALLOWED_HOSTS:
        return Response('Forbidden host', status_code=400)
    return requests.get(user_url)
```

For internal-network protection, also resolve the hostname and refuse private IPs (`ipaddress.ip_address(...).is_private`).

## Coverage gap (v1)

- Multi-hop taint (`a = req.json()['url']; b = a; requests.get(b)`) is only one hop tracked.
- Helper wrappers that allowlist internally don't suppress the rule — the heuristic can't reason through arbitrary function calls.
- v1 detects ~40-60% of TP patterns. The remaining cases are real bugs that require closer review or a cross-file taint analysis we plan for v1.1.

## Implementation

Tree-sitter-python AST. Per function-like body: collect a taint map from `var = <request-shape>` assignments. Walk every call to a recognised HTTP sink. Classify the first positional argument against the taint map + direct user-input shapes + tainted f-string substitutions.

Source: [`shared/packs/core-security/vibe-py-ssrf-fetch-user-input.ts`](../../shared/packs/core-security/vibe-py-ssrf-fetch-user-input.ts)
Fixtures: [`corpus/rules/vibe-py-ssrf-fetch-user-input/`](../../corpus/rules/vibe-py-ssrf-fetch-user-input/)
