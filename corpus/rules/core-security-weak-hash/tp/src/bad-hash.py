"""True-positive fixture for core-security-weak-hash.

MD5/SHA1 in obvious password context. Rule MUST fire.
"""
import hashlib


def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()


def store_user_secret(secret):
    return hashlib.sha1(secret.encode()).hexdigest()
