<!-- codemore-ignore-file: core-security-weak-hash -->
# core-security-weak-hash

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | MAJOR | beta | 0.85 |

**Pack:** `core-security`

## What it catches

MD5 and SHA-1 being used for password hashing or auth-secret hashing. Both algorithms are cryptographically broken for any application where collision or pre-image resistance matters. Modern password hashing requires bcrypt / argon2 / scrypt with per-row salt and a configurable work factor.

Detects patterns like:

- `crypto.createHash('md5')` or `crypto.createHash('sha1')`
- `md5(password)` or `sha1(password)` (from popular md5/sha1 libraries)
- `hashlib.md5(...)` or `hashlib.sha1(...)` in Python

The rule fires at **MAJOR** severity when used in non-auth contexts (MD5 is fine for non-security checksums), but escalates to **BLOCKER** when nearby context names a password / secret / token / api_key variable, or when assigned to a password column.

## Why it matters

MD5 and SHA-1 are fast hashing algorithms — designed for **speed**, the opposite of what password storage needs. Even with a salt, an attacker who exfiltrates the password table can crack hashes at billions of guesses per second using consumer GPUs or specialized hardware like ASIC miners. This is OWASP A02 (Cryptographic Failures).

Modern password hashers (bcrypt, argon2id, scrypt) are deliberately slow — they include configurable work factors that slow down brute-force attacks. Per-row salts prevent rainbow-table attacks. No application should use MD5 or SHA-1 for anything involving a secret.

## Example — flagged

```ts
import crypto from 'crypto';

// BLOCKER: MD5 in a password-like context.
function hashPassword(password: string) {
  return crypto.createHash('md5').update(password).digest('hex');
}

// MAJOR: SHA-1 without password context (could be upgrade).
const dataHash = crypto.createHash('sha1').update(data).digest('hex');
```

```py
import hashlib

# BLOCKER: MD5 on a user password.
def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()

# MAJOR: SHA-1 in a generic hashing context.
token_digest = hashlib.sha1(token.encode()).hexdigest()
```

## Example — not flagged

```ts
import bcrypt from 'bcrypt';

// OK: bcrypt with per-row salt and work factor.
async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}
```

```py
import bcrypt

# OK: argon2 (also good: scrypt).
from argon2 import PasswordHasher

def hash_password(password):
    ph = PasswordHasher()
    return ph.hash(password)
```

## Suggested fix

Replace MD5/SHA-1 with a modern password hasher:

**Node.js — bcrypt:**

```ts
import bcrypt from 'bcrypt';

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12); // 12 rounds; adjust for your latency budget
  return bcrypt.hash(password, salt);
}

// Later, verify:
const match = await bcrypt.compare(passwordAttempt, storedHash);
```

**Node.js — argon2:**

```ts
import argon2 from 'argon2';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

// Later, verify:
const match = await argon2.verify(storedHash, passwordAttempt);
```

**Python — bcrypt:**

```py
import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

# Later, verify:
match = bcrypt.checkpw(password_attempt.encode(), stored_hash.encode())
```

**Python — argon2-cffi:**

```py
from argon2 import PasswordHasher

ph = PasswordHasher()

def hash_password(password: str) -> str:
    return ph.hash(password)

# Later, verify:
try:
    ph.verify(stored_hash, password_attempt)
    match = True
except:
    match = False
```

## Suppression

```ts
// Reason: this is an MD5 checksum for a non-security file integrity check.
// codemore-ignore-next-line: core-security-weak-hash
const checksum = crypto.createHash('md5').update(fileData).digest('hex');
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP — Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [CWE-916: Use of Password Hash With Insufficient Computational Effort](https://cwe.mitre.org/data/definitions/916.html)
- [Argon2 RFC 9106](https://datatracker.ietf.org/doc/html/rfc9106)

## Implementation

Regex scan for `crypto.createHash('md5'|'sha1')`, `hashlib.md5()`, `hashlib.sha1()`, and similar patterns. For each match, checks nearby context (~5 lines) for password-related identifiers (`password`, `secret`, `token`, `api_key`, `credential`) or a column name containing `password`. If found, raises severity to BLOCKER; otherwise, MAJOR.

Source: [`shared/packs/core-security/core-security-weak-hash.ts`](../../shared/packs/core-security/core-security-weak-hash.ts)
Fixtures: [`corpus/rules/core-security-weak-hash/`](../../corpus/rules/core-security-weak-hash/)
