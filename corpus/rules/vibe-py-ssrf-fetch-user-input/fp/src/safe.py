import requests
import httpx

# Static URL — safe.
def health():
    return requests.get('https://api.example.com/health')

# Env-driven (not user input).
import os
def from_env():
    base = os.environ['BASE_URL']
    return httpx.get(f'{base}/health')

# Helper-wrapped URL (rule deliberately doesn't trace through helpers in v1).
def allowlisted(u):
    from urllib.parse import urlparse
    if urlparse(u).hostname != 'api.example.com':
        raise ValueError('bad')
    return u

def with_allowlist(request):
    body = request.json()
    safe = allowlisted(body['url'])
    return requests.get(safe)
