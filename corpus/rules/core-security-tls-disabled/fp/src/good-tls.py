"""False-positive fixture for core-security-tls-disabled.

Verification enabled / using a pinned CA bundle. Rule must NOT fire.
"""
import requests


def fetch_safe(url):
    # Default: verify=True (implicit).
    return requests.get(url)


def fetch_with_custom_ca(url):
    # Explicit custom CA bundle path — still verified.
    return requests.get(url, verify='/etc/ssl/certs/internal-ca.pem')
