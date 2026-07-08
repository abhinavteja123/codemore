<!-- codemore-ignore-file: core-security-hardcoded-password -->
# core-security-hardcoded-password

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | CRITICAL | beta | 0.8 |

## What it catches

A password/credential-named identifier assigned or compared to a string literal — the class bandit calls B105, with no provider prefix to scan for:

- `password = "hunter2secret"` (assignment / kwarg)
- `app_config['SECRET_KEY'] = 'dev-9f8e7d6c5b4a'` (bracket / dict form)
- `"db_password": "pr0d-mysql-9f2!"` (object / dict key)
- `if supplied == "letmein42":` when compared against a credential-named identifier (auth backdoor)

Complements `core-security-hardcoded-secret-pattern`, which only detects provider-issued tokens by canonical prefix (`sk_live_*`, `ghp_*`, `AKIA*`, …). This rule was added after the 2026-07-07 external-recall audit, where bandit B105 caught assignment-form credentials the prefix rule structurally cannot see.

Precision guards: the identifier must **end** with a credential keyword (`passwordField`, `password_hash`, `password_label` do not match), the value must survive a placeholder filter (`changeme`, `<your-password>`, `${DB_PASSWORD}`, `xxxx`, values under 4 chars, values with whitespace), and comment lines are skipped.

## Why it matters

A literal credential in source ships with every clone, image, and bundle — and git history preserves it after removal, so rotation is mandatory once pushed. Comparisons like `password == "admin"` are worse: a backdoor that authenticates anyone who reads the source. Secret-leak rate on AI-assisted commits runs 2× the human baseline (GitGuardian SOSS 2026).

## Example — flagged

```ts
const dbPassword = "pr0d-pg-8842!x";           // CRITICAL

function isAdmin(pw: string): boolean {
  return pw === "sup3rAdmin!";                 // CRITICAL — comparison backdoor
}
```

```py
password = "hunter2secret"                     # CRITICAL
app_config['SECRET_KEY'] = 'dev-9f8e7d6c5b4a'  # CRITICAL
```

## Example — NOT flagged

```ts
const dbPassword = process.env.DB_PASSWORD;    // env read — the fix
const inputType = "password";                  // identifier doesn't end with a credential keyword
const testPassword = "xxxx";                   // placeholder value
const connSecret = "${VAULT_SECRET}";          // template interpolation
```

```py
password = os.environ.get("DB_PASSWORD")       # env read
password_hash = "5f4dcc3b5aa765d61d8327deb882cf99"  # hash, not a credential name
db_password = "changeme"                       # placeholder
```

## How to fix

Read the credential from the environment or a secret manager:

```ts
const dbPassword = process.env.DB_PASSWORD;
if (!dbPassword) throw new Error('DB_PASSWORD is required');
```

Then: (1) rotate the leaked value in the issuing system, (2) add the variable name to `.env.example` without a value, (3) if this was a comparison, replace the backdoor with a real credential check.

## Suppression

```ts
// codemore-ignore: core-security-hardcoded-password
```

Scope: `same-line | next-line | file`. Deliberate fixtures and demo data are the intended use of suppression — the rule errs toward flagging.

## Deliberate coverage gaps (v1.0.0)

- `.env` / YAML / JSON files excluded — `.env` is the conventional home for local credentials (flagging every `DB_PASSWORD=` would be an FP storm), YAML skipped for templating noise (`{{ .Values.password }}`).
- Unquoted values and f-string/template compositions need taint tracking — out of scope.
