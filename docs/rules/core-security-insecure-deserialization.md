<!-- codemore-ignore-file: core-security-insecure-deserialization -->
# core-security-insecure-deserialization

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | beta | 0.9 |

## What it catches

Unsafe deserialization of attacker-controlled bytes — the shortest path to remote code execution in Python apps. Detects calls to:

- `pickle.loads()` / `pickle.Unpickler()` on untrusted data
- `marshal.loads()` on untrusted data
- `yaml.load()` without `Loader=yaml.SafeLoader` / `BaseLoader` / `FullLoader`
- `shelve.open()` on a path influenced by user input

Strings or JSON are always safe alternatives for anything coming over the network.

## Why it matters

Pickle, marshal, and shelve are Python serialization formats that construct arbitrary objects during deserialization — a direct path to code execution. If an attacker controls the input to `pickle.loads()`, they can embed a payload that executes arbitrary code when unpickled. PyYAML's default `yaml.load()` has the same vulnerability. This is OWASP A08 (Software and Data Integrity Failures) and one of the most cited Python CVE classes. The fix is always to use JSON or a schema-validated parser.

## Example — flagged

```py
import pickle
from flask import request

@app.route('/load')
def load_object():
    # BLOCKER: pickle.loads on request body.
    return pickle.loads(request.data)

def parse_config(yaml_text):
    # BLOCKER: yaml.load without SafeLoader.
    return yaml.load(yaml_text)
```

## Example — not flagged

```py
import json
import yaml
from flask import request

@app.route('/load')
def load_object():
    # OK: JSON is always safe.
    return json.loads(request.data)

def parse_config(yaml_text):
    # OK: safe_load never constructs arbitrary objects.
    return yaml.safe_load(yaml_text)

def parse_with_loader(yaml_text):
    # OK: explicit SafeLoader.
    return yaml.load(yaml_text, Loader=yaml.SafeLoader)
```

## Suggested fix

**Never** use pickle / marshal / shelve for untrusted input. Replace with:

```py
# For JSON-structured data:
import json
data = json.loads(request.data)

# For YAML (if you must):
import yaml
data = yaml.safe_load(yaml_text)  # NOT yaml.load()

# If you genuinely need binary structured data, use msgpack with a typed schema:
import msgpack
data = msgpack.unpackb(request.data, raw=False)
```

If the data was already serialized in pickle format, refuse it and ask the client to resend as JSON.

## Suppression

```py
# Reason: this object is from a trusted internal queue, never user-sourced.
# codemore-ignore-next-line: core-security-insecure-deserialization
obj = pickle.loads(trusted_bytes_from_queue)
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP — Deserialization of Untrusted Data](https://owasp.org/www-community/deserialization-of-untrusted-data)
- [CWE-502: Deserialization of Untrusted Data](https://cwe.mitre.org/data/definitions/502.html)
- [Python pickle docs — warning](https://docs.python.org/3/library/pickle.html)

## Implementation

File-by-file regex scan of Python source. For each match to the unsafe deserializer patterns, checks whether `Loader=yaml.SafeLoader` (or equivalent) is present in the same call for yaml.load. If a string hint like `request`, `payload`, `user_input` is nearby, confidence is raised.

Source: [`shared/packs/core-security/core-security-insecure-deserialization.ts`](../../shared/packs/core-security/core-security-insecure-deserialization.ts)
Fixtures: [`corpus/rules/core-security-insecure-deserialization/`](../../corpus/rules/core-security-insecure-deserialization/)
