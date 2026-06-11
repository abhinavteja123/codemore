"""True-positive fixture for core-security-tls-disabled.

Multiple TLS-disable patterns. Rule MUST fire on each.
"""
import requests
import urllib3
import ssl


def fetch_unsafe(url):
    return requests.get(url, verify=False)


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def unverified_context():
    return ssl._create_unverified_context()
