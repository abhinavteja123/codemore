"""False-positive fixture for core-security-weak-hash.

bcrypt for passwords, sha256 for non-secret checksums. Rule must NOT fire.
"""
import bcrypt
import hashlib


def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt())


def file_checksum(content: bytes) -> str:
    # SHA-256 for non-security checksumming is fine; rule should not flag.
    return hashlib.sha256(content).hexdigest()
