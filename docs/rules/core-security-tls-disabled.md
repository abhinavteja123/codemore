<!-- codemore-ignore-file: core-security-tls-disabled -->
# core-security-tls-disabled

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | MAJOR | beta | 0.95 |

**Pack:** `core-security`

## What it catches

TLS certificate verification being explicitly disabled. The fix in the moment is always the same: don't disable it. The number of production incidents where someone "temporarily" set `verify=False` or `rejectUnauthorized: false` and forgot to revert is depressingly large.

Detects patterns like:

- `axios({ rejectUnauthorized: false, ... })`
- `new https.Agent({ rejectUnauthorized: false })`
- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`
- `requests.get(url, verify=False)`
- `urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)`
- `ssl.create_default_context().verify_mode = ssl.CERT_NONE`
- `ssl._create_unverified_context()`

## Why it matters

Disabling TLS verification silently turns every HTTPS call into a man-in-the-middle attack vector. Any attacker on the network between your app and the server can intercept, decrypt, and mutate the response. This is especially dangerous for:

- API calls to payment processors, auth services, or cloud providers
- Webhook handlers that trust the server identity
- Any data that transits HTTPS

The "fix later" comment people leave next to these lines never gets revisited. Fix the underlying cert issue (pin the right CA, regenerate the dev cert) instead of bypassing verification.

## Example — flagged

```ts
import axios from 'axios';

// MAJOR: rejectUnauthorized disabled — any MITM can intercept.
const response = await axios.get('https://api.stripe.com/v1/charges', {
  rejectUnauthorized: false,
  headers: { Authorization: `Bearer ${apiKey}` },
});
```

```py
import requests

# MAJOR: verify=False disables all certificate checks.
response = requests.get('https://api.stripe.com/v1/charges', verify=False)
```

```ts
import https from 'https';

// MAJOR: https.Agent with verification disabled.
const agent = new https.Agent({ rejectUnauthorized: false });
const response = await fetch('https://api.example.com', { agent });
```

## Example — not flagged

```ts
import axios from 'axios';

// OK: use defaults (verification is ON).
const response = await axios.get('https://api.stripe.com/v1/charges', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
```

```py
import requests

# OK: verify is omitted; defaults to True.
response = requests.get('https://api.stripe.com/v1/charges')

# OK: custom CA bundle for a valid certificate.
response = requests.get('https://internal-api.local', verify='/etc/ssl/custom-ca.pem')
```

## Suggested fix

**Re-enable certificate verification** — delete the disable flag. If you encounter a certificate error:

**Node.js — Self-signed cert in development:**

```ts
// Bad approach:
const agent = new https.Agent({ rejectUnauthorized: false });

// Better: generate a valid local cert with mkcert.
// https://github.com/FiloSottile/mkcert
// Then add the CA to your OS trust store and omit the agent entirely:
const response = await fetch('https://localhost:3000');
```

**Python — Self-signed cert in development:**

```py
# Bad approach:
requests.get(url, verify=False)

# Better: use a custom CA bundle for your local CA:
requests.get(url, verify='/path/to/custom-ca.pem')

# Or use the certifi package with a local CA:
import certifi
requests.get(url, verify=certifi.where())
```

**Production:**

Fix the underlying certificate issue:

- Ensure the server's certificate is issued by a trusted CA.
- If using a private CA, ensure the certificate is in the system trust store.
- If the hostname doesn't match the certificate, fix the hostname or regenerate the cert with the correct hostname.

## Suppression

```ts
// Reason: this is a local dev endpoint with a self-signed cert managed by mkcert.
// codemore-ignore-next-line: core-security-tls-disabled
const agent = new https.Agent({ rejectUnauthorized: false });
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [Node.js https.Agent](https://nodejs.org/api/https.html#https_class_https_agent)
- [Requests verify parameter](https://requests.readthedocs.io/en/latest/user/advanced/#ssl-warnings)
- [mkcert — Local CA for development](https://github.com/FiloSottile/mkcert)

## Implementation

Regex scan for patterns that disable TLS verification: `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED = '0'`, `verify=False`, `urllib3.disable_warnings()`, `ssl.CERT_NONE`, or `_create_unverified_context()`. Each match is flagged as a MAJOR security issue.

Source: [`shared/packs/core-security/core-security-tls-disabled.ts`](../../shared/packs/core-security/core-security-tls-disabled.ts)
Fixtures: [`corpus/rules/core-security-tls-disabled/`](../../corpus/rules/core-security-tls-disabled/)
