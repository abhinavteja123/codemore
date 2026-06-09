import requests
import httpx
from urllib.request import urlopen


def fetch_a(request):
    body = request.json()
    return requests.get(body['url'])                     # ← flag (one-hop taint)


def fetch_b(request):
    target = request.args.get('url')                     # tainted
    return httpx.get(target)                             # ← flag


def fetch_c(request):
    return requests.get(request.json()['url'])           # ← flag (direct)


def fetch_d(request):
    return urlopen(request.values['target'])             # ← flag


def fetch_e(request):
    target = request.json()['id']
    return requests.get(f'https://api.example.com/items/{target}')  # ← flag (tainted f-string)
