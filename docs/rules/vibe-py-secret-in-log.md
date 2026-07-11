# vibe-py-secret-in-log

**Pack:** `core-security`
**Default severity:** MAJOR
**Languages:** Python
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

`logging.<level>(...)` / `logger.<level>(...)` / `log.<level>(...)` / `print(...)` / `pprint.pprint(...)` calls whose argument references a binding whose name matches the "looks like a secret" pattern, UNLESS the value is wrapped in a recognised redaction helper.

Logger callees: any dotted path whose root is `logging`, `logger`, or `log` and whose tail is one of `debug`, `info`, `warning`, `warn`, `error`, `critical`, `exception`, `log`, `fatal`. Plus bare `print` / `pprint.pprint`.

Secret-name pattern (case-insensitive):
- Anchored at start or `_`-segmented start: `secret`, `token`, `password`, `passwd`, `credential`, `private_key`, `bearer`, `jwt`, `api_key`, `access_key`, `session_id`, `client_secret`, `service_role`.
- Anchored at end: `...Secret`, `...Token`, `...Password`, `...Key`, `...Bearer`, `...Jwt`.

Recognised redaction wrappers: `redact`, `mask`, `sanitize`, `sanitise`, `obfuscate`, `hash`, `truncate`.

## Why this matters for vibe-coded apps

GitGuardian SOSS 2026 top finding. A stray `logger.info({"apiKey": api_key})` leaks the credential to Datadog / Sentry / CloudWatch where every team member with log access can read it.

## Example — flagged

```python
logger.info('api_key=' + api_key)                # concat with secret-named identifier
logger.error({'apiKey': api_key})                # dict-key
logger.warning(f'token={access_token}')          # f-string substitution
print('the password is', api_key)                # print + identifier
logger.info(session_id)                          # identifier
```

## Example — not flagged

```python
logger.info('startup complete')                  # no secret-shaped name
logger.info({'apiKey': redact(api_key)})         # wrapped — silent
logger.error('token=' + mask(access_token))      # wrapped — silent

def use_api_key(api_key):                        # non-logger function — silent
    return f'Bearer {api_key}'
```

## Suggested fix

```python
# Wrap before logging.
logger.info({'apiKey': redact(api_key)})

# Or drop the line entirely.
logger.info('configured')
```

If your transport handles redaction (structlog with processors, etc.), suppress with a Reason comment.

## Implementation

Tree-sitter-python AST. Walks every `call` node, identifies logger-call shapes by dotted callee path, then classifies each positional and keyword argument against:

- `identifier` whose text matches the secret-name pattern
- `attribute` whose final segment matches
- `dictionary` whose any key matches
- `string` / `concatenated_string` with an interpolation containing a tainted identifier
- `binary_operator` (`+`-concat) with a tainted side
- `keyword_argument` whose name matches

Arguments wrapped in a recognised redaction call are exempt. One finding per logger call (avoids double-reporting).

Source: [`shared/packs/core-security/vibe-py-secret-in-log.ts`](../../shared/packs/core-security/vibe-py-secret-in-log.ts)
Fixtures: [`corpus/rules/vibe-py-secret-in-log/`](../../corpus/rules/vibe-py-secret-in-log/)
